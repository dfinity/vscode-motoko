import * as path from 'path';
import {
    commands,
    languages,
    extensions,
    ExtensionContext,
    FormattingOptions,
    TextDocument,
    TextEdit,
    workspace,
} from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';
import { watchGlob } from './common/watchConfig';
import { formatDocument } from './formatter';

interface ViperApi {
    registerServerMessageCallback?: any;
}

let client: LanguageClient | undefined;

export async function activate(context: ExtensionContext) {
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

    console.error('BEFORE TIMEOUT');

    setTimeout(async () => {
        console.error('BEFORE EXTENSION');
        // Load Viper extension
        const viperApi = await getViperApi();
        console.error('VIPER EXTENSION'); ///
        console.log(viperApi); /////
        // console.log(); /////

        if (viperApi) {
            viperApi.registerServerMessageCallback('StateChange',(params:any)=>console.error('PARAMS::::',params));
        }

        // console.error('VIPER EXTENSION:', viperApi); ///
    }, 10000);
}

async function getViperApi(): Promise<ViperApi | undefined> {
    try {
        const viperExtension =
            extensions.getExtension<ViperApi>('viper-admin.viper');
        if (!viperExtension) {
            return;
        }
        console.error('ACTIVE:', viperExtension.isActive);
        if (!viperExtension.isActive) {
            await viperExtension.activate();
        }
        return viperExtension.exports;
    } catch (err) {
        console.error(`Error while resolving Viper API: ${err}`);
        return;
    }
}

function startServer(context: ExtensionContext) {
    // Launch cross-platform language server
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
