import * as glob from 'fast-glob';
import * as mops from 'ic-mops/mops';
import { Package } from 'motoko/lib/package';
import * as baseLibrary from 'motoko/packages/latest/base.json';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    ExtensionContext,
    FormattingOptions,
    Position,
    QuickPickItem,
    Range,
    TestItem,
    TestRunProfileKind,
    TextDocument,
    TextEdit,
    Uri,
    ViewColumn,
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
import {
    DEPLOY_TEMPORARY,
    DEPLOY_TEMPORARY_MESSAGE,
    ERROR_MESSAGE,
    IMPORT_MOPS_PACKAGE,
    TEST_FILE_REQUEST,
    TestParams,
    TestResult,
} from './common/connectionTypes';
import { ignoreGlobPatterns, watchGlob } from './common/watchConfig';
import { formatDocument } from './formatter';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
    context.subscriptions.push(
        commands.registerCommand('motoko.startService', () =>
            startServer(context),
        ),
    );
    context.subscriptions.push(
        commands.registerCommand(
            'motoko.deployTemporary',
            async (relevantUri?: Uri) => {
                const uri =
                    relevantUri?.toString() ||
                    window.activeTextEditor?.document?.uri.toString();
                if (!uri || !uri.endsWith('.mo')) {
                    window.showErrorMessage(
                        'Invalid deploy URI:',
                        uri ?? `(${uri})`,
                    );
                    return;
                }
                await deployTemporary(context, uri);
            },
        ),
    );
    context.subscriptions.push(
        commands.registerCommand('motoko.importMopsPackage', async () => {
            await importMopsPackage(context);
        }),
    );
    context.subscriptions.push(
        languages.registerDocumentFormattingEditProvider(['motoko', 'candid'], {
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
            const appendOutput = (item: TestItem, output: string) => {
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
            };
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
                                run.failed(item, [], end);
                                appendOutput(
                                    item,
                                    result.stdout.replace(
                                        /All tests passed\.\r?\n?/g,
                                        '', // Remove noise from Matchers output
                                    ),
                                );
                                appendOutput(item, result.stderr);
                            }
                        } catch (e) {
                            const output =
                                ((e as any)?.message as string) || String(e);
                            run.errored(item, [], Date.now() - start);
                            appendOutput(item, output);
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
            console.error(`Error while adding test file: ${uri}`);
            console.error(err);
        }
    };
    workspace.workspaceFolders?.forEach((workspaceFolder) => {
        try {
            const directory = workspaceFolder.uri.fsPath;
            glob.sync(pattern, {
                cwd: directory,
                ignore: ignoreGlobPatterns,
                followSymbolicLinks: false,
            }).forEach((file) => {
                addFile(Uri.file(path.resolve(directory, file)));
            });
        } catch (err) {
            console.error('Error while loading test files:');
            console.error(err);
        }
    });
    watcher.onDidCreate(addFile, context.subscriptions);
    watcher.onDidChange(addFile, context.subscriptions);
    watcher.onDidDelete((uri) => {
        controller.items.delete(uri.toString());
    }, context.subscriptions);

    context.subscriptions.push(controller, watcher, runProfile);
}

export function startServer(context: ExtensionContext) {
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
    client.onNotification(ERROR_MESSAGE, async ({ message, detail }) => {
        const item = await window.showErrorMessage(
            detail ? `${message}\n${detail}` : message,
            'View logs',
        );
        if (item === 'View logs') {
            client.outputChannel.show();
        }
    });
    client.start().catch((err) => console.error(err.stack || err));
    context.subscriptions.push(client);
}

const deployingSet = new Set<string>();
const deployPanelMap = new Map<string, vscode.WebviewPanel>();
let tag = Math.floor(Math.random() * 1e12);

async function deployTemporary(_context: ExtensionContext, uri: string) {
    try {
        if (deployingSet.has(uri)) {
            throw new Error('Already deploying this file');
        }
        deployingSet.add(uri);
        const result = await window.withProgress(
            { location: vscode.ProgressLocation.Notification },
            async (progress) => {
                progress.report({
                    message: 'Deploying...',
                });
                const listener = client.onNotification(
                    DEPLOY_TEMPORARY_MESSAGE,
                    ({ message }) => progress.report({ message }),
                );
                const result = await client.sendRequest(DEPLOY_TEMPORARY, {
                    uri,
                });
                listener.dispose();
                return result;
            },
        );
        const key = result.canisterId;
        let panel = deployPanelMap.get(key);
        if (!panel) {
            panel = window.createWebviewPanel(
                'candid-ui',
                'Candid UI',
                ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                },
            );
            deployPanelMap.set(key, panel);
            panel.onDidDispose(() => deployPanelMap.delete(key));
        }
        panel.webview.html = `
            <iframe
                src="https://a4gq6-oaaaa-aaaab-qaa4q-cai.raw.icp0.io/?id=${
                    result.canisterId
                }&tag=${tag++}"
                style="width:100vw; height:100vh; border:none"
            />`;
    } catch (err: any) {
        window.showErrorMessage(
            err?.message
                ? String(err.message)
                : 'Unexpected error while deploying canister',
        );
    }
    deployingSet.delete(uri);
}

let packageItemsCache: vscode.QuickPickItem[] = [];

async function importMopsPackage(_context: ExtensionContext) {
    const mopsActor = await mops.mainActor();
    const quickPick = window.createQuickPick<QuickPickItem>();
    quickPick.placeholder = 'Type to search for Motoko packages';

    const loadInitial = async () => {
        if (packageItemsCache.length) {
            quickPick.items = packageItemsCache;
            return;
        }
        quickPick.busy = true;
        const limit = 200;
        const [results, _pageCount] = await mopsActor
            .search('', [BigInt(limit)], [])
            .finally(() => {
                quickPick.busy = false;
            });
        const items = results.map((packageSummary) => {
            return {
                label: packageSummary.config.name,
                description: packageSummary.config.version,
                detail: packageSummary.config.description,
            };
        });
        packageItemsCache = items;
        quickPick.items = items;
    };

    quickPick.onDidAccept(async () => {
        const name = quickPick.selectedItems[0].label;

        quickPick.enabled = true;
        quickPick.busy = false;
        quickPick.dispose();

        await window.withProgress(
            { location: vscode.ProgressLocation.Notification },
            async (progress) => {
                progress.report({ message: `Installing package "${name}"...` });
                const editor = window.activeTextEditor;
                if (!editor) {
                    return;
                }
                try {
                    const uri = editor.document?.uri.toString();
                    // install package
                    const edits = await client.sendRequest(
                        IMPORT_MOPS_PACKAGE,
                        { uri, name },
                    );

                    // add import line
                    const workspaceEdit = new vscode.WorkspaceEdit();
                    workspaceEdit.set(
                        editor.document.uri,
                        edits.map(
                            (edit) =>
                                new TextEdit(
                                    new Range(
                                        edit.range.start.line,
                                        edit.range.start.character,
                                        edit.range.end.line,
                                        edit.range.end.character,
                                    ),
                                    edit.newText,
                                ),
                        ),
                    );
                    vscode.workspace.applyEdit(workspaceEdit);
                    // window.showInformationMessage(`Package "${name}" installed successfully`);
                } catch (err) {
                    window.showErrorMessage(
                        `Failed to install package "${name}"\n${err}`,
                    );
                }
            },
        );
    });

    quickPick.onDidHide(async () => {
        quickPick.dispose();
    });

    quickPick.show();

    await loadInitial();
}
