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

// import { Uri } from 'vscode';
// import { DocumentUri } from 'vscode-languageclient';

import mo from 'motoko';

interface Settings {
    motoko: MotokoSettings;
}

interface MotokoSettings {
    // TODO
}

// Create a connection for the language server
const connection = createConnection(ProposedFeatures.all);

console.log = connection.console.log.bind(connection.console);
console.error = connection.console.error.bind(connection.console);

const documents = new TextDocuments(TextDocument);

let workspaceFolders: WorkspaceFolder[] | undefined;
connection.onInitialize((params): InitializeResult => {
    workspaceFolders = params.workspaceFolders || undefined;

    const result: InitializeResult = {
        capabilities: {
            completionProvider: {
                resolveProvider: false,
                triggerCharacters: ['.'],
            },
            definitionProvider: true,
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

// connection.onInitialized(() => {
//     if (workspaceFolders) {
//         connection.workspace.onDidChangeWorkspaceFolders((_event) => {
//                 connection.workspace?.onDidChangeWorkspaceFolders((event) => {
//                     event.removed.forEach((workspaceFolder) => {
//                         const index = workspaceFolders.findIndex(
//                             (folder) => folder.uri === workspaceFolder.uri,
//                         );
//                         if (index !== -1) {
//                             workspaceFolders.splice(index, 1);
//                         }
//                     });
//                     event.added.forEach((workspaceFolder) => {
//                         workspaceFolders.push(workspaceFolder);
//                     });
//                 });
//         });
//     }
// });

connection.onDidChangeWatchedFiles((_change) => {
    validateAllDocuments();
});

connection.onDidChangeConfiguration((_change) => {
    // const settings = <Settings>change.settings;
    startValidation();
});

// let rootPath: string;

// function initWorkspaceRootFolder(uri: string) {
//     if (rootPath !== 'undefined') {
//         const fullUri = Uri.parse(uri);
//         if (!fullUri.fsPath.startsWith(rootPath)) {
//             if (workspaceFolders) {
//                 const newRootFolder = workspaceFolders.find((x) =>
//                     uri.startsWith(x.uri),
//                 );
//                 if (newRootFolder !== undefined) {
//                     rootPath = URI.parse(newRootFolder.uri).fsPath;
//                     solcCompiler.rootPath = rootPath;
//                     if (linter !== null) {
//                         linter.loadFileConfig(rootPath);
//                     }
//                 }
//             }
//         }
//     }
// }

let validatingDocument = false;
function validate(document: TextDocument) {
    if (!validatingDocument) {
        try {
            validatingDocument = true;

            // const result = mo.check();
        } finally {
            validatingDocument = false;
        }
    }
}

let validatingAllDocuments = false;
function validateAllDocuments() {
    if (!validatingAllDocuments) {
        try {
            validatingAllDocuments = true;
            documents.all().forEach((document) => validate(document));
        } finally {
            validatingAllDocuments = false;
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
        handler: TextDocumentPositionParams,
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

function startValidation() {
    validateAllDocuments();
}

let validatingTimeout: ReturnType<typeof setTimeout>;
documents.onDidChangeContent((event) => {
    const document = event.document;
    if (!validatingDocument && !validatingAllDocuments) {
        validatingDocument = true;
        clearTimeout(validatingTimeout);
        validatingTimeout = setTimeout(() => validate(document), 1000);
    }
});

documents.onDidClose((event) =>
    connection.sendDiagnostics({
        diagnostics: [],
        uri: event.document.uri,
    }),
);

documents.listen(connection);
connection.listen();
