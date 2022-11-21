import locateJavaHome from '@viperproject/locate-java-home';
import { IJavaHomeInfo } from '@viperproject/locate-java-home/js/es5/lib/interfaces';
import { homedir } from 'os';
import * as path from 'path';
import {
    commands,
    ExtensionContext,
    extensions,
    window,
    workspace,
} from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';
import { watchGlob } from './common/watchConfig';

// const config = workspace.getConfiguration('motoko');

let client: LanguageClient;

export async function activate(context: ExtensionContext) {
    context.subscriptions.push(
        commands.registerCommand('motoko-viper.startService', () =>
            startServer(context).catch(console.error),
        ),
    );
    // context.subscriptions.push(
    //     languages.registerDocumentFormattingEditProvider('motoko', {
    //         provideDocumentFormattingEdits(
    //             document: TextDocument,
    //             options: FormattingOptions,
    //         ): TextEdit[] {
    //             return formatDocument(document, context, options);
    //         },
    //     }),
    // );
    const incompatible = extensions.getExtension(
        'dfinity-foundation.vscode-motoko',
    );
    if (incompatible) {
        const verifyName = require('../package.json').displayName;
        const originalName = 'Motoko';
        window
            .showErrorMessage(
                `[${verifyName}](https://marketplace.visualstudio.com/items?itemName=dfinity-foundation.motoko-viper) is incompatible with the standard [${originalName}](https://marketplace.visualstudio.com/items?itemName=dfinity-foundation.vscode-motoko) extension. Please choose which extension to keep installed:`,
                verifyName,
                originalName,
            )
            .then((choice) => {
                let uninstallPromise;
                if (choice === verifyName) {
                    uninstallPromise = commands.executeCommand(
                        'workbench.extensions.uninstallExtension',
                        'dfinity-foundation.vscode-motoko',
                    );
                }
                if (choice === originalName) {
                    uninstallPromise = commands.executeCommand(
                        'workbench.extensions.uninstallExtension',
                        'dfinity-foundation.motoko-viper',
                    );
                } 
                uninstallPromise?.then(() =>
                    commands.executeCommand('workbench.action.reloadWindow'),
                );
            });
    }
    await startServer(context);
}

interface PlatformDependentPath {
    windows?: string | string[];
    mac?: string | string[];
    linux?: string | string[];
}

const isLinux = /^linux/.test(process.platform);
const isMac = /^darwin/.test(process.platform);

function first(paths: string | string[]): string {
    if (typeof paths !== 'string') {
        return paths[0];
    } else {
        return paths;
    }
}

// originally from https://github.com/viperproject/viper-ide/blob/master/client/src/Settings.ts
function normalise(
    tools: string,
    path: string | PlatformDependentPath,
): string {
    if (typeof path !== 'string') {
        // handle object values
        if (isMac && path.mac) return normalise(tools, first(path.mac));
        else if (isLinux && path.linux)
            return normalise(tools, first(path.linux));
        else
            throw new Error(
                `normalise() on an unsupported platform: ${process.platform}, or path missing`,
            );
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
            )}${envValue}${path.substring(
                index_of_closing_slash,
                path.length,
            )}`;
        }
        return path;
    }
}

export async function startServer(context: ExtensionContext) {
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
        const buildVersion = config.buildVersion || 'Stable';
        const homePath = homedir();
        // Viper extension v3.0.1
        if (
            viperTools ===
                path.resolve(homePath, 'Library/Application Support/Viper') ||
            viperTools === path.resolve(homePath, '.config/Viper')
        ) {
            // Rewrite default directory
            viperTools = path.resolve(
                context.globalStorageUri.fsPath,
                `../viper-admin.viper/${buildVersion}/ViperTools`,
            );
        }
        // Rewrite default LS path
        else if (viperTools.endsWith('/Local/ViperTools')) {
            // Replace 'Local' directory with current build version
            viperTools = viperTools.replace(
                /\/Local\/ViperTools$/,
                `/${buildVersion}/ViperTools`,
            );
        }
        // Codium tweak
        if (process.execPath.includes('/VSCodium.app/Contents/')) {
            viperTools = viperTools.replace(
                /\/Application Support\/Code\//,
                '/Application Support/VSCodium/',
            );
        }
    }
    if (config.javaSettings.javaBinary) {
        java = normalise(viperTools, config.javaSettings.javaBinary);
    } else {
        const javaHomes = await getJavaHomes();
        if (javaHomes.length === 0) {
            console.error('Java home directory not found');
        } else if (javaHomes.length > 1) {
            console.error('Found more than one Java home directory');
        } else {
            java = javaHomes[0].executables.java;
        }
    }
    if (config.viperServerSettings.serverJars) {
        serverJar = normalise(
            viperTools,
            config.viperServerSettings.serverJars,
        );
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

// https://github.com/viperproject/viper-ide/blob/147ba0cd4b1fbbb15437b6581e66c2105fa537fa/client/src/Settings.ts#L890-L915
async function getJavaHomes(): Promise<IJavaHomeInfo[]> {
    return new Promise((resolve, reject) => {
        try {
            const minJavaVersion = 11;
            const options = {
                version: `>=${minJavaVersion}`,
                mustBe64Bit: true,
            };
            locateJavaHome(options, (err, javaHomes) => {
                if (err) {
                    reject(err.message);
                } else {
                    if (!Array.isArray(javaHomes) || javaHomes.length === 0) {
                        const msg =
                            `Could not find a 64-bit Java installation with at least version ${minJavaVersion}. ` +
                            'Please install one and/or manually specify it in the Viper-IDE settings.';
                        reject(msg);
                    } else {
                        resolve(javaHomes);
                    }
                }
            });
        } catch (err) {
            // @ts-ignore
            reject(err?.message);
        }
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
