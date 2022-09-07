import {
    workspace,
    ExtensionContext,
    window,
    commands,
    languages,
    TextDocument,
    TextEdit,
    FormattingOptions,
} from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as which from 'which';
import { execSync } from 'child_process';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';
import { formatDocument } from './formatter';

const config = workspace.getConfiguration('motoko');

let client: LanguageClient;

export function activate(context: ExtensionContext) {
    context.subscriptions.push(
        commands.registerCommand('motoko.startService', startServer),
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
    startServer(context);
}

export function startServer(context: ExtensionContext) {
    if (client) {
        client.stop().catch((err) => console.error(err.stack || err));
    }

    const dfxConfig = getDfxConfig();
    if (dfxConfig && getDfxPath()) {
        return launchDfxProject(context, dfxConfig);
    }

    // Check if `mo-ide` exists
    fs.access(config.standaloneBinary, fs.constants.F_OK, (err) => {
        if (err) {
            console.error(err.message);

            // Launch TypeScript language server
            const module = context.asAbsolutePath(
                path.join('out', 'server', 'server.js'),
            );
            launchClient(context, {
                run: { module, transport: TransportKind.ipc },
                debug: {
                    module,
                    options: { execArgv: ['--nolazy', '--inspect=6004'] },
                    transport: TransportKind.ipc,
                },
            });
            return;
        }

        const prompt = `There doesn't seem to be a dfx.json file for this Motoko project. What file do you want to use as an entry point?`;
        const currentDocument = window.activeTextEditor?.document?.fileName;

        window
            .showInputBox({ prompt, value: currentDocument })
            .then((entryPoint) => {
                if (entryPoint) {
                    const serverCommand = {
                        command: config.standaloneBinary,
                        args: ['--canister-main', entryPoint]
                            .concat(vesselArgs())
                            .concat(config.standaloneArguments.split(' ')),
                    };
                    launchClient(context, {
                        run: serverCommand,
                        debug: serverCommand,
                    });
                }
            });
    });
}

function launchDfxProject(context: ExtensionContext, dfxConfig: DfxConfig) {
    const start = (canister: string) => {
        const dfxPath = getDfxPath();
        if (!fs.existsSync(dfxPath)) {
            window.showErrorMessage(
                `Failed to locate dfx at ${dfxPath} check that dfx is installed or try changing motoko.dfx in settings`,
            );
            throw Error('Failed to locate dfx');
        }
        const serverCommand = {
            command: getDfxPath(),
            args: ['_language-service', canister],
        };
        launchClient(context, { run: serverCommand, debug: serverCommand });
    };

    let canister = config.get<string>('canister');
    let canisters = Object.keys(dfxConfig.canisters);

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

function launchClient(context: ExtensionContext, serverOptions: ServerOptions) {
    let clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: 'file', language: 'motoko' },
            // { scheme: 'untitled', language: 'motoko' },
        ],
        synchronize: {
            // Synchronize the setting section 'motoko' to the server
            configurationSection: 'motoko',
            // Notify the server about external changes to `.mo` workspace files
            fileEvents: workspace.createFileSystemWatcher('**/*.mo'),
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

export async function deactivate() {
    if (client) {
        await client.stop();
    }
}

interface DfxCanisters {
    [key: string]: { main: string };
}

type DfxConfig = {
    canisters: DfxCanisters;
};

function getDfxConfig(): DfxConfig | undefined {
    if (!config.get('legacyDfxSupport')) {
        return;
    }
    const wsf = workspace.workspaceFolders;
    if (!wsf) {
        return;
    }
    try {
        return JSON.parse(
            fs
                .readFileSync(path.join(wsf[0].uri.fsPath, 'dfx.json'))
                .toString('utf8'),
        );
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

function vesselArgs(): string[] {
    try {
        let ws = workspace.workspaceFolders!![0].uri.fsPath;
        if (
            !fs.existsSync(path.join(ws, 'vessel.dhall')) &&
            !fs.existsSync(path.join(ws, 'vessel.json'))
        )
            return [];
        let flags = execSync('vessel sources', {
            cwd: ws,
        }).toString('utf8');
        return flags.split(' ');
    } catch (err) {
        console.log(err);
        return [];
    }
}
