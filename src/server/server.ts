'use strict';
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
 * Resolves the absolute file path from the given URI.
 */
function resolveFilePath(uri: string): string {
    return URI.parse(uri).fsPath;
}

/**
 * Resolves the virtual file system path from the given URI.
 */
function resolveVirtualPath(uri: string): string {
    return URI.parse(uri).path;
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
    //     const basePath = resolvePath(folder.uri);
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
    //                     aliases[name] = // TODO
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
                    join(workspaceFolder.uri, args.shift()!),
                );
                console.log('Package:', name, '->', path);
                mo.addPackage(name, path);
            }
        }
    } else {
        const defaultPackages = {
            base: 'dfinity/motoko-base/master/src',
        };
        await mo.loadPackages(defaultPackages);
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
            definitionProvider: true,
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

    const dfxPromise = loadDfxConfig().catch((err) => {
        console.error('Error while loading dfx.json:');
        console.error(err);
    });

    const packagePromise = loadPackages().catch((err) => {
        console.error('Error while loading Motoko packages:');
        console.error(err);
    });

    Promise.all([dfxPromise, packagePromise])
        .catch(console.error)
        .then(() => validateOpenDocuments());
});

connection.onDidChangeWatchedFiles((event) => {
    event.changes.forEach((change) => {
        try {
            const path = resolveVirtualPath(change.uri);
            if (change.type === 3 /* FileChangeType.Deleted */) {
                mo.delete(path);
            } else {
                mo.write(path, documents.get(change.uri)?.getText() || '');
            }
        } catch (err) {
            console.error(`Error while handling Motoko file change: ${err}`); ///
        }
    });

    validateOpenDocuments();
});

connection.onDidChangeConfiguration((event) => {
    settings = (<Settings>event.settings).motoko;
    validateOpenDocuments();
});

/**
 * Registers or updates all Motoko files in the current workspace.
 */
function notifyWorkspace() {
    if (workspaceFolders) {
        workspaceFolders.forEach((folder) => {
            const folderPath = resolveFilePath(folder.uri);
            const virtualFolderPath = resolveVirtualPath(folder.uri);
            glob.sync('**/*.mo', { cwd: folderPath, dot: true }).forEach(
                (relativePath) => {
                    const path = join(folderPath, relativePath);
                    const virtualPath = join(virtualFolderPath, relativePath);
                    try {
                        console.log('*', virtualPath);
                        mo.write(virtualPath, readFileSync(path, 'utf8'));
                    } catch (err) {
                        console.error(
                            `Error while adding Motoko file ${path}: ${err}`,
                        );
                    }
                },
            );
        });
    }
}

/**
 * Validates all Motoko files which are currently open in the editor.
 */
function validateOpenDocuments() {
    documents.all().forEach((document) => notify(document));
    documents.all().forEach((document) => check(document));
}

function validate(document: TextDocument) {
    notify(document);
    check(document);
}

/**
 * Registers or updates the document in the compiler's virtual file system.
 */
function notify(document: TextDocument) {
    try {
        const path = resolveVirtualPath(document.uri);
        mo.write(path, document.getText());
    } catch (err) {
        console.error(`Error while updating Motoko file: ${err}`);
    }
}

/**
 * Generates errors and warnings for the document.
 */
function check(document: TextDocument) {
    if (document.languageId === 'motoko') {
        const path = resolveVirtualPath(document.uri);
        try {
            let diagnostics = mo
                .check(path)
                .filter(
                    (diagnostic) =>
                        !diagnostic.source || diagnostic.source === path,
                ) as any as Diagnostic[]; // temp

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
                            !new RegExp(settings.hideWarningRegex).test(
                                message,
                            ),
                    );
                }
            }
            connection.sendDiagnostics({
                uri: document.uri,
                diagnostics: diagnostics.map((diagnostic) => ({
                    ...diagnostic,
                    source: 'motoko',
                })),
            });
        } catch (err) {
            console.error(`Error while compiling Motoko file: ${err}`);
            connection.sendDiagnostics({
                uri: document.uri,
                diagnostics: [
                    {
                        message:
                            'Unexpected error while compiling Motoko file.',
                        range: {
                            start: { line: 0, character: 0 },
                            end: { line: 0, character: 0 },
                        },
                    },
                ],
            });
        }
    }
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
