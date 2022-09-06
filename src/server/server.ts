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
import { TextDocument } from 'vscode-languageserver-textdocument';
// import { FileChangeType } from 'vscode-languageclient';
import mo from 'motoko';

mo.loadPackages({
    base: 'dfinity/motoko-base/master/src',
}).then(() => {
    revalidate();
});

interface Settings {
    motoko: MotokoSettings;
}

interface MotokoSettings {
    hideWarningRegex: string;
    maxNumberOfProblems: number;
}

let settings: MotokoSettings | undefined;

function resolvePath(uri: string): string {
    const prefix = 'file://';
    return uri.startsWith(prefix) ? uri.substring(prefix.length) : uri;
}

// Create a connection for the language server
const connection = createConnection(ProposedFeatures.all);

console.log = connection.console.log.bind(connection.console);
console.warn = connection.console.warn.bind(connection.console);
console.error = connection.console.error.bind(connection.console);

const documents = new TextDocuments(TextDocument);

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
    });

    revalidate();
});

connection.onDidChangeWatchedFiles((event) => {
    event.changes.forEach((change) => {
        try {
            const path = resolvePath(change.uri);
            if (change.type === 3 /* FileChangeType.Deleted */) {
                mo.delete(path);
            } else {
                mo.write(path, documents.get(change.uri)?.getText() || '');
            }
        } catch (err) {
            console.error(`Error while handling Motoko file change: ${err}`); ///
        }
    });

    revalidate();
});

connection.onDidChangeConfiguration((event) => {
    settings = (<Settings>event.settings).motoko;
    revalidate();
});

function revalidate() {
    documents.all().forEach((document) => notify(document));
    documents.all().forEach((document) => check(document));
}

function validate(document: TextDocument) {
    notify(document);
    check(document);
}

/**
 * Updates the document in the compiler's virtual file system.
 */
function notify(document: TextDocument) {
    try {
        const path = resolvePath(document.uri);
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
        const path = resolvePath(document.uri);
        try {
            let diagnostics: Diagnostic[] = mo.check(
                path,
            ) as any as Diagnostic[]; //

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
                            new RegExp(settings.hideWarningRegex).test(message),
                    );
                }
            }
            connection.sendDiagnostics({
                uri: document.uri,
                diagnostics: diagnostics,
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
