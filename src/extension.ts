import * as path from 'path';
import {
    commands, ExtensionContext, FormattingOptions, languages,
    TextDocument,
    TextEdit, workspace
} from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';
import { watchGlob } from './common/watchConfig';
import { formatDocument } from './formatter';

// const config = workspace.getConfiguration('motoko');

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

// originally from https://github.com/viperproject/viper-ide/blob/master/client/src/Settings.ts
function normalise(path: string) {
    if (!path || path.length <= 2) return path;
    while (path.indexOf("$") >= 0) {
        const index_of_dollar = path.indexOf("$")
        let index_of_closing_slash = path.indexOf("/", index_of_dollar + 1)
        if (index_of_closing_slash < 0) {
            index_of_closing_slash = path.length
        }
        const envName = path.substring(index_of_dollar + 1, index_of_closing_slash)
        const envValue = process.env[envName]
        if (!envValue) {
            throw new Error(`environment variable ${envName} used in path ${path} is not set`);
        }
        if (envValue.indexOf("$") >= 0) {
            throw new Error(`environment variable ${envName} must not contain '$': ${envValue}`);
        }
        path = path.substring(0, index_of_dollar) + envValue + path.substring(index_of_closing_slash, path.length)
    }
    return path
}

export function startServer(context: ExtensionContext) {
    // Cross-platform language server
    const module = context.asAbsolutePath(
        path.join('out', 'server', 'server.js'),
    );

    var java = '';
    var serverJars = '';
    const config = workspace.getConfiguration('viperSettings');
    if (config.javaSettings.javaBinary) {
       java = normalise(config.javaSettings.javaBinary);
    }
    if (config.viperServerSettings.serverJars) {
       serverJars = normalise(config.viperServerSettings.serverJars);
    }
    const args = [`--java="${java}"`, `--jars="${serverJars}"`]

    launchClient(context, {
        run: {
            module,
            args,
            transport: TransportKind.ipc
	},
        debug: {
            module,
            args,
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
