import * as glob from 'fast-glob';
import * as fs from 'fs';
import { Package } from 'motoko/lib/package';
import * as baseLibrary from 'motoko/packages/latest/base.json';
import * as path from 'path';
import {
    ExtensionContext,
    FormattingOptions,
    Position,
    Range,
    TestItem,
    TestRunProfileKind,
    TextDocument,
    TextEdit,
    Uri,
    commands,
    languages,
    tests,
    window,
    workspace,
} from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';
import * as which from 'which';
import { TEST_FILE_REQUEST, TestParams, TestResult } from './common/testConfig';
import { watchGlob } from './common/watchConfig';
import { formatDocument } from './formatter';

const config = workspace.getConfiguration('motoko');

let client: LanguageClient;

export function activate(context: ExtensionContext) {
    context.subscriptions.push(
        commands.registerCommand('motoko.startService', () =>
            startServer(context),
        ),
    );
    context.subscriptions.push(
        languages.registerDocumentFormattingEditProvider('motoko', {
            provideDocumentFormattingEdits(
                document: TextDocument,
                options: FormattingOptions,
            ): TextEdit[] {
                return formatDocument(document, context, options);
            },
        }),
    );
    // Virtual base library URIs
    context.subscriptions.push(
        workspace.registerTextDocumentContentProvider('mo', {
            provideTextDocumentContent(uri: Uri) {
                const prefix = 'base/';
                if (!uri.path.startsWith(prefix)) {
                    return;
                }
                const path = uri.path.substring(prefix.length);
                return (baseLibrary as Package).files[path]?.content ?? null;
            },
        }),
    );
    startServer(context);
    setupTests(context);
}

export async function deactivate() {
    if (client) {
        await client.stop();
    }
}

function setupTests(context: ExtensionContext) {
    const controller = tests.createTestController(
        'motokoTests',
        'Motoko Tests',
    );

    enum ItemType {
        File,
        TestCase,
    }
    const testItemTypeMap = new WeakMap<TestItem, ItemType>();
    const getType = (item: TestItem) => testItemTypeMap.get(item)!;

    const runTest = async (item: TestItem) => {
        console.log('Running test:', item);

        if (!client) {
            startServer(context);
        }

        if (!item.uri) {
            throw new Error('Unknown file system path');
        }
        const result: TestResult = await client.sendRequest(TEST_FILE_REQUEST, {
            uri: item.uri.toString(),
        } as TestParams);

        return result;
    };

    const runProfile = controller.createRunProfile(
        'Run',
        TestRunProfileKind.Run,
        async (request, token) => {
            const run = controller.createTestRun(request);
            const queue: TestItem[] = [];
            if (request.include) {
                request.include.forEach((item) => queue.push(item));
            } else {
                controller.items.forEach((item) => queue.push(item));
            }
            queue.sort((a, b) =>
                a.label
                    .toLocaleLowerCase()
                    .localeCompare(b.label.toLocaleLowerCase()),
            );
            queue.forEach((item) => {
                run.enqueued(item);
            });
            while (queue.length > 0 && !token.isCancellationRequested) {
                const item = queue.shift()!;
                if (request.exclude?.includes(item)) {
                    continue;
                }
                switch (getType(item)) {
                    case ItemType.File:
                        const start = Date.now();
                        try {
                            run.started(item);
                            const result = await runTest(item);
                            const end = Date.now() - start;
                            if (result.passed) {
                                run.passed(item, end);
                            } else {
                                run.failed(
                                    item,
                                    // new TestMessage(result.stderr),
                                    [],
                                    end,
                                );
                                // TODO: DRY
                                const location = item.uri
                                    ? {
                                          uri: item.uri,
                                          range: new Range(
                                              new Position(0, 0),
                                              new Position(0, 100),
                                          ),
                                      }
                                    : undefined;
                                [result.stderr, result.stdout].forEach(
                                    (output) => {
                                        if (output) {
                                            run.appendOutput(
                                                output.replace(
                                                    /\r?\n/g,
                                                    '\r\n',
                                                ),
                                                location,
                                                item,
                                            );
                                        }
                                    },
                                );
                            }
                        } catch (e) {
                            const output =
                                ((e as any)?.message as string) || String(e);
                            run.errored(
                                item,
                                // new TestMessage(message), // TODO: `TextMessage.diff()`
                                [],
                                Date.now() - start,
                            );
                            const location = item.uri
                                ? {
                                      uri: item.uri,
                                      range: new Range(
                                          new Position(0, 0),
                                          new Position(0, 100),
                                      ),
                                  }
                                : undefined;
                            run.appendOutput(
                                output.replace(/\r?\n/g, '\r\n'),
                                location,
                                item,
                            );
                        }
                        // if (test.children.size === 0) {
                        //     await parseTestsInFileContents(test);
                        // }
                        break;
                    // case ItemType.TestCase:
                    //     break;
                }
                item.children.forEach((test) => queue.push(test));
            }
            queue.forEach((item) => run.skipped(item));
            run.end();
        },
    );

    const pattern = '**/*.test.mo';
    const watcher = workspace.createFileSystemWatcher(pattern);
    const addFile = (uri: Uri) => {
        try {
            const uriString = uri.toString();
            if (/\/(\.vessel|\.mops|node_modules)\//.test(uriString)) {
                return;
            }
            const name =
                /([^\\/]+)\.test\.mo$/.exec(uriString)?.[1] || 'Motoko';
            const item = controller.createTestItem(uriString, name, uri);
            controller.items.add(item);
            testItemTypeMap.set(item, ItemType.File);
        } catch (err) {
            console.error(`Error while adding test file: ${uri}\n${err}`);
        }
    };
    workspace.workspaceFolders?.forEach((workspaceFolder) => {
        const directory = workspaceFolder.uri.fsPath;
        glob.sync(pattern, { cwd: directory }).forEach((file) => {
            addFile(Uri.file(path.resolve(directory, file)));
        });
    });
    watcher.onDidCreate(addFile, context.subscriptions);
    watcher.onDidChange(addFile, context.subscriptions);
    watcher.onDidDelete((uri) => {
        controller.items.delete(uri.toString());
    }, context.subscriptions);

    context.subscriptions.push(controller, watcher, runProfile);
}

export function startServer(context: ExtensionContext) {
    // Legacy dfx language server
    const dfxConfig = getDfxConfig();
    if (dfxConfig && getDfxPath()) {
        launchDfxProject(context, dfxConfig);
        return;
    }

    // Cross-platform language server
    const module = context.asAbsolutePath(path.join('out', 'server.js'));
    const execArgv = ['--stack-size=1361']; // TODO: reduce after improving moc.js WASI compilation
    restartLanguageServer(context, {
        run: { module, transport: TransportKind.ipc, options: { execArgv } },
        debug: {
            module,
            options: { execArgv: ['--nolazy', '--inspect=6004', ...execArgv] },
            transport: TransportKind.ipc,
        },
    });
}

function launchDfxProject(context: ExtensionContext, dfxConfig: DfxConfig) {
    const start = (canister: string) => {
        const dfxPath = getDfxPath();
        if (!fs.existsSync(dfxPath)) {
            window.showErrorMessage(
                `Failed to locate dfx at ${dfxPath}. Check that dfx is installed or try changing motoko.dfx in settings`,
            );
            throw Error('Failed to locate dfx');
        }
        const serverCommand = {
            command: getDfxPath(),
            args: ['_language-service', canister],
        };
        restartLanguageServer(context, {
            run: serverCommand,
            debug: serverCommand,
        });
    };

    const canister = config.get<string>('canister');
    const canisters = Object.keys(dfxConfig.canisters);

    if (canister) {
        start(canister);
    } else if (canisters.length === 1) {
        start(canisters[0]);
    } else {
        window
            .showQuickPick(canisters, {
                canPickMany: false,
                placeHolder: 'What canister do you want to work on?',
            })
            .then((c) => {
                if (c) start(c);
            });
    }
}

function restartLanguageServer(
    context: ExtensionContext,
    serverOptions: ServerOptions,
) {
    if (client) {
        console.log('Restarting Motoko language server');
        client.stop().catch((err) => console.error(err.stack || err));
    }
    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: 'file', language: 'motoko' },
            // { scheme: 'untitled', language: 'motoko' },
        ],
        synchronize: {
            // Synchronize the setting section 'motoko' to the server
            configurationSection: 'motoko',
            // Notify the server about external changes to `.mo` workspace files
            fileEvents: workspace.createFileSystemWatcher(watchGlob),
        },
    };
    client = new LanguageClient(
        'motoko',
        'Motoko Language Server',
        serverOptions,
        clientOptions,
    );
    client.start().catch((err) => console.error(err.stack || err));
    context.subscriptions.push(client);
}

interface DfxCanisters {
    [key: string]: { main: string };
}

type DfxConfig = {
    canisters: DfxCanisters;
};

function getDfxConfig(): DfxConfig | undefined {
    if (!config.get('legacyLanguageServer')) {
        return;
    }
    const wsf = workspace.workspaceFolders;
    if (!wsf) {
        return;
    }
    try {
        const dfxConfig = JSON.parse(
            fs
                .readFileSync(path.join(wsf[0].uri.fsPath, 'dfx.json'))
                .toString('utf8'),
        );
        // Require TS language server for newer versions of `dfx`
        if (!dfxConfig?.dfx || dfxConfig.dfx >= '0.11.1') {
            return;
        }
        return dfxConfig;
    } catch {
        return; // TODO: warning?
    }
}

function getDfxPath(): string {
    const dfx = config.get<string>('dfx') || 'dfx';
    try {
        return which.sync(dfx);
    } catch {
        return dfx;
    }
}
