import * as fs from 'fs';
import { Package } from 'motoko/lib/package';
import * as baseLibrary from 'motoko/packages/latest/base.json';
import * as path from 'path';
import {
    ExtensionContext,
    FormattingOptions,
    TestItem,
    TestMessage,
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
import { watchGlob } from './common/watchConfig';
import { formatDocument } from './formatter';
import * as glob from 'fast-glob';

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
    const pattern = '**/*.test.mo';
    const watcher = workspace.createFileSystemWatcher(pattern);
    const addFile = (uri: Uri) => {
        const uriString = uri.toString();
        if (/\/(\.vessel|\.mops|node_modules)\//.test(uriString)) {
            return;
        }
        const name = /([^\\/]+)\.test\.mo$/.exec(uriString)?.[1] || 'Motoko';
        const item = controller.createTestItem(uriString, name, uri);
        controller.items.add(item);
        testItemTypeMap.set(item, ItemType.File);
    };
    workspace.workspaceFolders?.forEach((workspaceFolder) => {
        const directory = workspaceFolder.uri.fsPath;
        glob.sync(pattern, { cwd: directory }).forEach((file) =>
            addFile(Uri.file(path.join(directory, file))),
        );
    });
    watcher.onDidCreate(addFile, context.subscriptions);
    watcher.onDidChange(addFile, context.subscriptions);
    watcher.onDidDelete((uri) => {
        controller.items.delete(uri.toString());
    }, context.subscriptions);

    enum ItemType {
        File,
        TestCase,
    }
    const testItemTypeMap = new WeakMap<TestItem, ItemType>();
    const getType = (item: TestItem) => testItemTypeMap.get(item)!;
    const assertTestFilePasses = async (item: TestItem) => {
        console.log('Running test:', item);

        if (!client) {
            startServer(context);
        }

        if (!item.uri) {
            throw new Error('Unknown file system path');
        }
        const result = await client.sendRequest('vscode-motoko:run-test-file', {
            uri: item.uri.toString(),
        });

        console.log(result);

        // TODO
    };
    const runProfile = controller.createRunProfile(
        'Run',
        TestRunProfileKind.Run,
        async (request, token) => {
            const run = controller.createTestRun(request);
            const queue: TestItem[] = [];
            if (request.include) {
                request.include.forEach((test) => queue.push(test));
            } else {
                controller.items.forEach((test) => queue.push(test));
            }

            while (queue.length > 0 && !token.isCancellationRequested) {
                const item = queue.pop()!;
                if (request.exclude?.includes(item)) {
                    continue;
                }
                switch (getType(item)) {
                    case ItemType.File:
                        const start = Date.now();
                        try {
                            await assertTestFilePasses(item);
                            run.passed(item, Date.now() - start);
                        } catch (e) {
                            run.failed(
                                item,
                                new TestMessage((e as any)?.message || e),
                                Date.now() - start,
                            );
                        }
                        // if (test.children.size === 0) {
                        //     await parseTestsInFileContents(test);
                        // }
                        break;
                    // case ItemType.TestCase:
                    //     const start = Date.now();
                    //     try {
                    //         await assertTestPasses(test);
                    //         run.passed(test, Date.now() - start);
                    //     } catch (e) {
                    //         run.failed(
                    //             test,
                    //             new TestMessage((e as any)?.message || e),
                    //             Date.now() - start,
                    //         );
                    //     }
                    //     break;
                }

                item.children.forEach((test) => queue.push(test));
            }

            run.end();
        },
    );
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
    restartLanguageServer(context, {
        run: { module, transport: TransportKind.ipc },
        debug: {
            module,
            options: { execArgv: ['--nolazy', '--inspect=6004'] },
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
