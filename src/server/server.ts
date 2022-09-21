import {
    createConnection,
    TextDocuments,
    InitializeResult,
    Diagnostic,
    ProposedFeatures,
    TextDocumentPositionParams,
    CompletionItem,
    Location,
    SignatureHelp,
    TextDocumentSyncKind,
    // VersionedTextDocumentIdentifier,
    WorkspaceFolder,
} from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import { TextDocument } from 'vscode-languageserver-textdocument';
// import { FileChangeType } from 'vscode-languageclient';
import mo from 'motoko';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as glob from 'fast-glob';
import { execSync } from 'child_process';

interface Settings {
    motoko: MotokoSettings;
}

interface MotokoSettings {
    hideWarningRegex: string;
    maxNumberOfProblems: number;
}

/**
 * Resolves the absolute file system path from the given URI.
 */
function resolveFilePath(uri: string, ...parts: string[]): string {
    return join(URI.parse(uri).fsPath, ...parts);
}

/**
 * Resolves the virtual compiler path from the given URI.
 */
function resolveVirtualPath(uri: string, ...parts: string[]): string {
    return join(URI.parse(uri).path, ...parts).replace(/\\/g, '/');
}

interface DfxCanister {
    type?: string;
    alias?: string;
}

interface DfxConfig {
    canisters: { [name: string]: DfxCanister };
}

async function loadDfxConfig(): Promise<DfxConfig | undefined> {
    // if (!workspaceFolders) {
    //     return;
    // }
    // for (const folder of workspaceFolders) {
    //     const basePath = resolveFilePath(folder.uri);
    //     const dfxPath = join(basePath, 'dfx.json');
    //     if (existsSync(dfxPath)) {
    //         const dfxJson = JSON.parse(
    //             readFileSync(dfxPath, 'utf8'),
    //         ) as DfxConfig;
    //         if (dfxJson.canisters) {
    //             // Configure actor aliases
    //             const aliases: Record<string, string> = {};
    //             for (const [name, canister] of Object.entries(
    //                 dfxJson.canisters,
    //             )) {
    //                 if (
    //                     (!canister.type || canister.type === 'motoko') &&
    //                     canister.main
    //                 ) {
    //                     aliases[name] = ''// TODO
    //                 }
    //             }
    //             // @ts-ignore
    //             mo.setAliases(aliases);
    //         }
    //         return dfxJson;
    //     }
    // }
    return;
}

async function loadPackages() {
    function getVesselArgs():
        | { workspaceFolder: WorkspaceFolder; args: string[] }
        | undefined {
        try {
            for (const folder of workspaceFolders || []) {
                const uri = folder.uri;
                if (!uri) {
                    continue;
                }
                const ws = resolveFilePath(uri);
                if (
                    !existsSync(join(ws, 'vessel.dhall')) &&
                    !existsSync(join(ws, 'vessel.json'))
                ) {
                    continue;
                }
                const flags = execSync('vessel sources', {
                    cwd: ws,
                }).toString('utf8');
                return {
                    workspaceFolder: folder,
                    args: flags.split(' '),
                };
            }
        } catch (err) {
            console.warn(err);
        }
        return;
    }

    mo.clearPackages();

    const vesselArgs = getVesselArgs();
    if (vesselArgs) {
        const { workspaceFolder, args } = vesselArgs;
        // Load packages from Vessel
        let nextArg;
        while ((nextArg = args.shift())) {
            if (nextArg === '--package') {
                const name = args.shift()!;
                const path = resolveVirtualPath(
                    workspaceFolder.uri,
                    args.shift()!,
                );
                console.log('Package:', name, '->', path);
                mo.addPackage(name, path);
            }
        }
    } else {
        await mo.loadPackages({
            base: 'dfinity/motoko-base/master/src',
        });
    }

    try {
        const dfxConfig = await loadDfxConfig();
        // @ts-ignore
        dfxConfig;
    } catch (err) {
        console.error('Error while loading dfx.json:');
        console.error(err);
    }
}

// Create a connection for the language server
const connection = createConnection(ProposedFeatures.all);

const forwardMessage =
    (send: (message: string) => void) =>
    (...args: string[]): void => {
        send(args.join(' '));
    };

console.log = forwardMessage(connection.console.log.bind(connection.console));
console.warn = forwardMessage(connection.console.warn.bind(connection.console));
console.error = forwardMessage(
    connection.console.error.bind(connection.console),
);

const documents = new TextDocuments(TextDocument);

let settings: MotokoSettings | undefined;
let workspaceFolders: WorkspaceFolder[] | undefined;

connection.onInitialize((event): InitializeResult => {
    workspaceFolders = event.workspaceFolders || undefined;

    const result: InitializeResult = {
        capabilities: {
            completionProvider: {
                resolveProvider: false,
                triggerCharacters: ['.'],
            },
            // definitionProvider: true,
            // codeActionProvider: true,
            // declarationProvider: true,
            // hoverProvider: true,
            // diagnosticProvider: {
            //     documentSelector: ['motoko'],
            //     interFileDependencies: true,
            //     workspaceDiagnostics: false,
            // },
            textDocumentSync: TextDocumentSyncKind.Full,
            workspace: {
                workspaceFolders: {
                    supported: !!workspaceFolders,
                },
            },
        },
    };
    return result;
});

connection.onInitialized(() => {
    connection.workspace?.onDidChangeWorkspaceFolders((event) => {
        const folders = workspaceFolders;
        if (!folders) {
            return;
        }
        event.removed.forEach((workspaceFolder) => {
            const index = folders.findIndex(
                (folder) => folder.uri === workspaceFolder.uri,
            );
            if (index !== -1) {
                folders.splice(index, 1);
            }
        });
        event.added.forEach((workspaceFolder) => {
            folders.push(workspaceFolder);
        });

        notifyWorkspace();
    });

    notifyWorkspace();

    loadPackages()
        .catch((err) => {
            console.error('Error while loading Motoko packages:');
            console.error(err);
        })
        .then(() => checkWorkspace());
});

connection.onDidChangeWatchedFiles((event) => {
    event.changes.forEach((change) => {
        try {
            if (change.type === 3 /* FileChangeType.Deleted */) {
                const path = resolveVirtualPath(change.uri);
                mo.delete(path);
            } else {
                notify(change.uri);
                // check(document);
            }
        } catch (err) {
            console.error('Error while handling Motoko file change:');
            console.error(err);
        }
    });

    validateOpenDocuments();
});

connection.onDidChangeConfiguration((event) => {
    settings = (<Settings>event.settings).motoko;
    checkWorkspace();
});

/**
 * Registers or updates all Motoko files in the current workspace.
 */
function notifyWorkspace() {
    if (!workspaceFolders) {
        return;
    }
    workspaceFolders.forEach((folder) => {
        const folderPath = resolveFilePath(folder.uri);
        glob.sync('**/*.mo', { cwd: folderPath, dot: true }).forEach(
            (relativePath) => {
                const path = join(folderPath, relativePath);
                const virtualPath = resolveVirtualPath(
                    folder.uri,
                    relativePath,
                );
                try {
                    console.log('*', virtualPath);
                    mo.write(virtualPath, readFileSync(path, 'utf8'));
                } catch (err) {
                    console.error(`Error while adding Motoko file ${path}:`);
                    console.error(err);
                }
            },
        );
    });
}

/**
 * Type-checks all Motoko files in the current workspace.
 */
function checkWorkspace() {
    if (!workspaceFolders) {
        return;
    }
    workspaceFolders.forEach((folder) => {
        const folderPath = resolveFilePath(folder.uri);
        glob.sync('**/*.mo', {
            cwd: folderPath,
            dot: false /* exclude directories such as `.vessel` */,
        }).forEach((relativePath) => {
            const path = join(folderPath, relativePath);
            try {
                check(URI.file(path).toString());
            } catch (err) {
                console.error(`Error while checking Motoko file ${path}:`);
                console.error(err);
            }
        });
    });
    validateOpenDocuments(); // TODO: remove or debounce
}

/**
 * Validates all Motoko files which are currently open in the editor.
 */
function validateOpenDocuments() {
    // TODO: validate all tabs
    documents.all().forEach((document) => notify(document));
    documents.all().forEach((document) => check(document));
}

function validate(document: TextDocument) {
    notify(document);
    check(document);
}

/**
 * Registers or updates the URI or document in the compiler's virtual file system.
 */
function notify(uri: string | TextDocument): boolean {
    try {
        const document = typeof uri === 'string' ? documents.get(uri) : uri;
        if (document) {
            const virtualPath = resolveVirtualPath(document.uri);
            mo.write(virtualPath, document.getText());
        } else if (typeof uri === 'string') {
            const virtualPath = resolveVirtualPath(uri);
            const filePath = resolveFilePath(uri);
            mo.write(virtualPath, readFileSync(filePath, 'utf8'));
        }
    } catch (err) {
        console.error(`Error while updating Motoko file: ${err}`);
    }
    return false;
}

/**
 * Generates errors and warnings for a document.
 */
function check(uri: string | TextDocument): boolean {
    try {
        let virtualPath: string;
        const document = typeof uri === 'string' ? documents.get(uri) : uri;
        if (document) {
            // if (document.languageId !== 'motoko') {
            //     return false;
            // }
            virtualPath = resolveVirtualPath(document.uri);
        } else if (typeof uri === 'string') {
            virtualPath = resolveVirtualPath(uri);
        } else {
            return false;
        }

        console.log('~', virtualPath);
        let diagnostics = mo.check(virtualPath) as any as Diagnostic[];

        if (settings) {
            if (settings.maxNumberOfProblems > 0) {
                diagnostics = diagnostics.slice(
                    0,
                    settings.maxNumberOfProblems,
                );
            }
            if (settings.hideWarningRegex?.trim()) {
                diagnostics = diagnostics.filter(
                    ({ message, severity }) =>
                        severity === 1 /* Error */ ||
                        // @ts-ignore
                        !new RegExp(settings.hideWarningRegex).test(message),
                );
            }
        }
        const diagnosticMap: Record<string, Diagnostic[]> = {
            [virtualPath]: [], // Start with empty diagnostics for the main file
        };
        diagnostics.forEach((diagnostic) => {
            const key = diagnostic.source || virtualPath;
            (diagnosticMap[key] || (diagnosticMap[key] = [])).push({
                ...diagnostic,
                source: 'motoko',
            });
        });

        Object.entries(diagnosticMap).forEach(([path, diagnostics]) => {
            connection.sendDiagnostics({
                uri: URI.file(path).toString(),
                diagnostics: diagnostics,
            });
        });
        return true;
    } catch (err) {
        console.error(`Error while compiling Motoko file: ${err}`);
        connection.sendDiagnostics({
            uri: typeof uri === 'string' ? uri : uri.uri,
            diagnostics: [
                {
                    message: 'Unexpected error while compiling Motoko file.',
                    range: {
                        start: { line: 0, character: 0 },
                        end: { line: 0, character: 0 },
                    },
                },
            ],
        });
    }
    return false;
}

connection.onSignatureHelp((): SignatureHelp | null => {
    return null;
});

connection.onCompletion(
    (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
        let completionItems: CompletionItem[] = [];
        // const document = documents.get(textDocumentPosition.textDocument.uri);
        // const service = new CompletionService(rootPath);

        // completionItems = completionItems.concat(
        //     service.getAllCompletionItems(
        //         packageDefaultDependenciesDirectory,
        //         packageDefaultDependenciesContractsDirectory,
        //         remappings,
        //         document,
        //         textDocumentPosition.position,
        //     ),
        // );
        return completionItems;
    },
);

connection.onDefinition(
    async (
        _handler: TextDocumentPositionParams,
    ): Promise<Location | Location[]> => {
        // const provider = new SolidityDefinitionProvider(
        //     rootPath,
        //     packageDefaultDependenciesDirectory,
        //     packageDefaultDependenciesContractsDirectory,
        //     remappings,
        // );
        // return provider.provideDefinition(
        //     documents.get(handler.textDocument.uri),
        //     handler.position,
        // );

        return [];
    },
);

let validatingTimeout: ReturnType<typeof setTimeout>;
documents.onDidChangeContent((event) => {
    const document = event.document;
    clearTimeout(validatingTimeout);
    validatingTimeout = setTimeout(() => validate(document), 300);
    validate(document);
});

// documents.onDidClose((event) =>
//     connection.sendDiagnostics({
//         diagnostics: [],
//         uri: event.document.uri,
//     }),
// );

documents.listen(connection);
connection.listen();
