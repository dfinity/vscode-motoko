import * as fs from 'fs';
import * as path from 'path';
import {
    commands,
    ExtensionContext,
    FormattingOptions,
    languages,
    TextDocument,
    TextEdit,
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
    startServer(context);
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
    launchClient(context, {
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
    if (client) {
        console.log('Restarting Motoko language server');
        client.stop().catch((err) => console.error(err.stack || err));
    }
    let clientOptions: LanguageClientOptions = {
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
