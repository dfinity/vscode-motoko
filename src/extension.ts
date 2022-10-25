import { homedir } from 'os';
import * as path from 'path';
import {
    commands,
    ExtensionContext,
    FormattingOptions,
    languages,
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

interface PlatformDependentPath {
    windows?: string | string[];
    mac?: string | string[];
    linux?: string | string[];
}

const isLinux = /^linux/.test(process.platform);
const isMac = /^darwin/.test(process.platform);

function first (paths: string | string[]) : string {
    if (typeof paths !== 'string') {
        return paths[0]
    } else {
        return paths
    }
}

// originally from https://github.com/viperproject/viper-ide/blob/master/client/src/Settings.ts
function normalise(tools: string, path: string | PlatformDependentPath) : string {
    if (typeof path !== 'string') {
        // handle object values
        if (isMac && path.mac) return normalise(tools, first(path.mac))
        else if (isLinux && path.linux) return normalise(tools, first(path.linux))
        else throw new Error(`normalise() on an unsupported platform: ${process.platform}, or path missing`);
    } else {
        if (!path || path.length <= 2) return path;
        path = path.replace(/\$viperTools\$/g, tools);
        while (path.includes('$')) {
            const index_of_dollar = path.indexOf('$');
            let index_of_closing_slash = path.indexOf('/', index_of_dollar + 1);
            if (index_of_closing_slash < 0) {
                index_of_closing_slash = path.length;
            }
            const envName = path.substring(
                index_of_dollar + 1,
                index_of_closing_slash,
            );
            const envValue: string = process.env[envName] || '';
            if (!envValue) {
                throw new Error(
                    `environment variable ${envName} used in path ${path} is not set`,
                );
            }
            if (envValue.includes('$')) {
                throw new Error(
                    `environment variable ${envName} must not contain '$': ${envValue}`,
                );
            }
            path = `${path.substring(
                0,
                index_of_dollar,
            )}${envValue}${path.substring(index_of_closing_slash, path.length)}`;
        }
        return path
    }
}

export function startServer(context: ExtensionContext) {
    // Cross-platform language server
    const module = context.asAbsolutePath(
        path.join('out', 'server', 'server.js'),
    );

    let viperTools = '';
    let java = '';
    let serverJar = '';
    let z3 = '';
    const config = workspace.getConfiguration('viperSettings');
    if (config) {
        viperTools = normalise(viperTools, config.paths.viperToolsPath);
        if (viperTools.endsWith('/Library/Application Support/Viper')) {
            // Rewrite default directory
            const buildVersion = config.buildVersion || 'Stable';
            viperTools = path.resolve(
                homedir(),
                `Library/Application Support/Code/User/globalStorage/viper-admin.viper/${buildVersion}/ViperTools`
            );
        }
        else if(viperTools.endsWith('Library/Application Support/Code/User/globalStorage/viper-admin.viper/Local/ViperTools')) {
            // Replace 'Local' directory with current build version
            viperTools = viperTools.replace(/\/Local\/ViperTools/, `/${config.buildVersion}/ViperTools`);
        }
    }
    if (config.javaSettings.javaBinary) {
        java = normalise(viperTools, config.javaSettings.javaBinary);
    }
    if (config.viperServerSettings.serverJars) {
        serverJar = normalise(viperTools, config.viperServerSettings.serverJars);
        if (!serverJar.endsWith('.jar')) {
            serverJar = path.join(serverJar, 'viperserver.jar');
        }
    }
    if (config.paths.z3Executable) {
        z3 = normalise(viperTools, config.paths.z3Executable);
    }
    const args = [`--java="${java}"`, `--jar="${serverJar}"`, `--z3="${z3}"`];

    launchClient(context, {
        run: {
            module,
            args,
            transport: TransportKind.ipc,
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
