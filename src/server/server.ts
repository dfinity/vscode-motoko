import { execSync } from 'child_process';
import * as glob from 'fast-glob';
import { existsSync, readFileSync } from 'fs';
import { Node } from 'motoko/lib/ast';
import { keywords } from 'motoko/lib/keywords';
import * as baseLibrary from 'motoko/packages/latest/base.json';
import { join } from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
    CodeAction,
    CodeActionKind,
    CompletionItemKind,
    CompletionList,
    createConnection,
    Diagnostic,
    DiagnosticSeverity,
    FileChangeType,
    InitializeResult,
    Location,
    MarkupKind,
    Position,
    ProposedFeatures,
    SignatureHelp,
    TextDocumentPositionParams,
    TextDocuments,
    TextDocumentSyncKind,
    TextEdit,
    WorkspaceFolder,
} from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import { watchGlob as virtualFilePattern } from '../common/watchConfig';
import AstResolver from './ast';
import DfxResolver from './dfx';
import ImportResolver from './imports';
import { getAstInformation } from './information';
import { findNodes, Program } from './syntax';
import { allMotokoInstances, getMotokoInstance } from './motoko';
import {
    formatMotoko,
    getFileText,
    resolveFilePath,
    resolveVirtualPath,
} from './utils';

interface Settings {
    motoko: MotokoSettings;
}

interface MotokoSettings {
    hideWarningRegex: string;
    maxNumberOfProblems: number;
    debugHover: boolean;
}

// Always ignore `node_modules/` (often used in frontend canisters)
const ignoreGlobs = ['**/node_modules/**/*'];

// const moFileSet = new Set();

// Set up import suggestions
const importResolver = new ImportResolver();
const astResolver = new AstResolver();

Object.entries(baseLibrary.files).forEach(
    ([path, { content }]: [string, { content: string }]) => {
        notifyWriteUri(`mo:base/${path}`, content);
    },
);

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
                args: flags.split(' '), // TODO: account for quoted arguments
            };
        }
    } catch (err) {
        console.warn(err);
    }
    return;
}

async function loadPackages() {
    try {
        mo.clearPackages();

        try {
            // Load default base library
            mo.loadPackage(baseLibrary);
        } catch (err) {
            console.error(`Error while loading base library: ${err}`);
        }

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
                    mo.usePackage(name, path);
                }
            }
        }

        notifyDfxChange();
    } catch (err) {
        console.error('Error while loading Motoko packages:');
        console.error(err);
    }
}

let dfxChangeTimeout: ReturnType<typeof setTimeout>;
function notifyDfxChange() {
    clearTimeout(dfxChangeTimeout);
    setTimeout(async () => {
        try {
            const dfxResolver = new DfxResolver(() => {
                if (!workspaceFolders?.length) {
                    return null;
                }
                const folder = workspaceFolders[0];
                // for (const folder of workspaceFolders) {
                const basePath = resolveFilePath(folder.uri);
                const dfxPath = join(basePath, 'dfx.json');
                if (existsSync(dfxPath)) {
                    return dfxPath;
                }
                return null;
                // }
            });

            const projectDir = await dfxResolver.getProjectDirectory();
            const dfxConfig = await dfxResolver.getConfig();
            if (projectDir && dfxConfig) {
                if (dfxConfig.canisters) {
                    try {
                        const idsPath = join(
                            projectDir,
                            '.dfx/local/canister_ids.json',
                        );
                        if (existsSync(idsPath)) {
                            const canisterIds = JSON.parse(
                                readFileSync(idsPath, 'utf8'),
                            );
                            const aliases: Record<string, string> = {};
                            Object.entries(canisterIds).forEach(
                                ([name, ids]: [string, any]) => {
                                    const keys = Object.keys(ids);
                                    // Choose the only principal (or 'local' if multiple are defined)
                                    const key =
                                        keys.length === 1 ? keys[0] : 'local';
                                    if (key && key in ids) {
                                        aliases[name] = ids[key];
                                    }
                                },
                            );
                            const path = join(projectDir, `.dfx/local/lsp`);
                            const uri = URI.file(path).toString();
                            allMotokoInstances().forEach((mo) => {
                                mo.setAliases(resolveVirtualPath(uri), aliases);
                            });
                        }
                    } catch (err) {
                        console.error(
                            `Error while resolving canister aliases: ${err}`,
                        );
                    }

                    for (const [_name, _canister] of Object.entries(
                        dfxConfig.canisters,
                    )) {
                        // try {
                        //     if (
                        //         (!canister.type || canister.type === 'motoko') &&
                        //         canister.main
                        //     ) {
                        //         const uri = URI.file(
                        //             dirname(join(projectDir, canister.main)),
                        //         ).toString();
                        //         mo.usePackage(
                        //             `canister:${name}`,
                        //             resolveVirtualPath(uri),
                        //         );
                        //     }
                        // } catch (err) {
                        //     console.error(
                        //         `Error while adding sibling Motoko canister '${name}' as a package: ${err}`,
                        //     );
                        // }
                    }
                }
            }
        } catch (err) {
            console.error('Error while loading dfx.json:');
            console.error(err);
        }

        checkWorkspace();
    }, 100);
}

// Create a connection for the language server
const connection = createConnection(ProposedFeatures.all);

const forwardMessage =
    (send: (message: string) => void) =>
    (...args: any[]): void => {
        const toString = (value: any) => {
            try {
                return typeof value === 'string'
                    ? value
                    : value instanceof Promise
                    ? `<Promise>`
                    : JSON.stringify(value);
            } catch (err) {
                return `<${err}>`;
            }
        };
        send(args.map(toString).join(' '));
    };

console.log = forwardMessage(connection.console.log.bind(connection.console));
console.warn = forwardMessage(connection.console.warn.bind(connection.console));
console.error = forwardMessage(
    connection.console.error.bind(connection.console),
);

export const documents = new TextDocuments(TextDocument);

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
            // declarationProvider: true,
            codeActionProvider: true,
            hoverProvider: true,
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

    // loadPrimaryDfxConfig();

    loadPackages();
});

connection.onDidChangeWatchedFiles((event) => {
    event.changes.forEach((change) => {
        try {
            if (change.type === FileChangeType.Deleted) {
                const path = resolveVirtualPath(change.uri);
                deleteVirtual(path);
                notifyDeleteUri(change.uri);
                connection.sendDiagnostics({
                    uri: change.uri,
                    diagnostics: [],
                });
            } else {
                notify(change.uri);
            }
            if (change.uri.endsWith('.did')) {
                notifyDfxChange();
            }
        } catch (err) {
            console.error(`Error while handling Motoko file change: ${err}`);
        }
    });

    checkWorkspace();
});

connection.onDidChangeConfiguration((event) => {
    settings = (<Settings>event.settings).motoko;
    checkWorkspace();
    notifyDfxChange();
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
        glob.sync(virtualFilePattern, {
            cwd: folderPath,
            dot: true,
        }).forEach((relativePath) => {
            const path = join(folderPath, relativePath);
            try {
                const virtualPath = resolveVirtualPath(
                    folder.uri,
                    relativePath,
                );
                console.log('*', virtualPath);
                const content = readFileSync(path, 'utf8');
                writeVirtual(virtualPath, content);
                const uri = URI.file(
                    resolveFilePath(folder.uri, relativePath),
                ).toString();
                notifyWriteUri(uri, content);
            } catch (err) {
                console.error(`Error while adding Motoko file ${path}:`);
                console.error(err);
            }
        });
    });
}

const checkQueue: string[] = [];
let checkTimeout: ReturnType<typeof setTimeout>;
// function clearCheckQueue() {
//     checkQueue.length = 0;
//     clearTimeout(checkTimeout);
// }
function processQueue() {
    clearTimeout(checkTimeout);
    checkTimeout = setTimeout(() => {
        const uri = checkQueue.shift();
        if (checkQueue.length) {
            processQueue();
        }
        if (uri) {
            checkImmediate(uri);
        }
    }, 0);
}
function scheduleCheck(uri: string | TextDocument) {
    if (checkQueue.length === 0) {
        processQueue();
    }
    uri = typeof uri === 'string' ? uri : uri?.uri;
    if (documents.keys().includes(uri)) {
        // Open document
        unscheduleCheck(uri);
        checkQueue.unshift(uri);
    } else {
        // Workspace file
        if (checkQueue.includes(uri)) {
            return false;
        }
        checkQueue.push(uri);
    }
    return true;
}
function unscheduleCheck(uri: string) {
    let index: number;
    while ((index = checkQueue.indexOf(uri)) !== -1) {
        checkQueue.splice(index, 1);
    }
}

let checkWorkspaceTimeout: ReturnType<typeof setTimeout>;
/**
 * Type-checks all Motoko files in the current workspace.
 */
function checkWorkspace() {
    clearTimeout(checkWorkspaceTimeout);
    checkWorkspaceTimeout = setTimeout(() => {
        console.log('Checking workspace');

        workspaceFolders?.forEach((folder) => {
            const folderPath = resolveFilePath(folder.uri);
            glob.sync('**/*.mo', {
                cwd: folderPath,
                dot: false, // exclude directories such as `.vessel`
                ignore: ignoreGlobs,
            }).forEach((relativePath) => {
                const path = join(folderPath, relativePath);
                try {
                    const uri = URI.file(path).toString();
                    // notify(uri);
                    scheduleCheck(uri);
                } catch (err) {
                    console.error(`Error while checking Motoko file ${path}:`);
                    console.error(err);
                }
            });
        });

        // validateOpenDocuments();

        // loadPrimaryDfxConfig()
        //     .then((dfxConfig) => {
        //         if (!dfxConfig) {
        //             return;
        //         }
        //         console.log('dfx.json:', JSON.stringify(dfxConfig));
        //         Object.values(dfxConfig.canisters).forEach((canister) => {
        //             if (
        //                 (!canister.type || canister.type === 'motoko') &&
        //                 canister.main
        //             ) {
        //                 const folder = workspaceFolders![0]; // temp
        //                 const filePath = join(
        //                     resolveFilePath(folder.uri),
        //                     canister.main,
        //                 );
        //                 const uri = URI.file(filePath).toString();
        //                 validate(uri);
        //             }
        //         });
        //     })
        //     .catch((err) => console.error(`Error while loading dfx.json: ${err}`));
    }, 500);
}

// /**
//  * Validates all Motoko files which are currently open in the editor.
//  */
// function validateOpenDocuments() {
//     // TODO: validate all tabs
//     documents.all().forEach((document) => notify(document));
//     documents.all().forEach((document) => check(document));
// }

function validate(uri: string | TextDocument) {
    notify(uri);
    scheduleCheck(uri);
}

/**
 * Registers or updates the URI or document in the compiler's virtual file system.
 */
function notify(uri: string | TextDocument): boolean {
    try {
        const document = typeof uri === 'string' ? documents.get(uri) : uri;
        if (document) {
            const virtualPath = resolveVirtualPath(document.uri);
            const content = document.getText();
            writeVirtual(virtualPath, content);
            notifyWriteUri(document.uri, content);
        } else if (typeof uri === 'string') {
            const virtualPath = resolveVirtualPath(uri);
            const filePath = resolveFilePath(uri);
            const content = readFileSync(filePath, 'utf8');
            writeVirtual(virtualPath, content);
            notifyWriteUri(uri, content);
        }
    } catch (err) {
        console.error(`Error while updating Motoko file: ${err}`);
    }
    return false;
}

/**
 * Generates errors and warnings for a document.
 */
function checkImmediate(uri: string | TextDocument): boolean {
    try {
        const skipExtension = '.mo_'; // Skip type checking `*.mo_` files
        const resolvedUri = typeof uri === 'string' ? uri : uri?.uri;
        if (resolvedUri?.endsWith(skipExtension)) {
            connection.sendDiagnostics({
                uri: resolvedUri,
                diagnostics: [],
            });
            return false;
        }

        let virtualPath: string;
        const document = typeof uri === 'string' ? documents.get(uri) : uri;
        if (document) {
            virtualPath = resolveVirtualPath(document.uri);
        } else if (typeof uri === 'string') {
            virtualPath = resolveVirtualPath(uri);
        } else {
            return false;
        }

        console.log('~', virtualPath);
        const mo = getMotokoInstance(virtualPath);
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
                        severity === DiagnosticSeverity.Error ||
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
            if (!key.endsWith(skipExtension)) {
                if (
                    /canister alias "([^"]+)" not defined/.test(
                        diagnostic.message || '',
                    )
                ) {
                    // Extra debugging information for `canister:` import errors
                    diagnostic = {
                        ...diagnostic,
                        message: `${diagnostic.message}. This is usually fixed by running \`dfx deploy\``,
                    };
                }

                (diagnosticMap[key] || (diagnosticMap[key] = [])).push({
                    ...diagnostic,
                    source: 'Motoko',
                });
            }
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

function notifyWriteUri(uri: string, content: string) {
    if (uri.endsWith('.mo')) {
        let program: Program | undefined;
        try {
            astResolver.notify(uri, content);
            // program = astResolver.request(uri)?.program; // TODO: re-enable for field imports
        } catch (err) {
            console.error(`Error while parsing (${uri}): ${err}`);
        }
        importResolver.update(uri, program);
    }
}

function notifyDeleteUri(uri: string) {
    if (uri.endsWith('.mo')) {
        astResolver.delete(uri);
        importResolver.delete(uri);
    }
}

function writeVirtual(path: string, content: string) {
    // if (virtualPath.endsWith('.mo')) {
    //     content = preprocessMotoko(content);
    // }
    allMotokoInstances().map((mo) => mo.write(path, content));
}

function deleteVirtual(path: string) {
    allMotokoInstances().map((mo) => mo.delete(path));
}

connection.onCodeAction((event) => {
    const results: CodeAction[] = [];

    // Automatic imports
    event.context?.diagnostics?.forEach((diagnostic) => {
        const uri = event.textDocument.uri;
        const name = /unbound variable ([a-z0-9_]+)/i.exec(
            diagnostic.message,
        )?.[1];
        if (name) {
            importResolver.getImportPaths(name, uri).forEach((path) => {
                // Add import suggestion
                results.push({
                    kind: CodeActionKind.QuickFix,
                    isPreferred: true,
                    title: `Import "${path}"`,
                    edit: {
                        changes: {
                            [uri]: [
                                TextEdit.insert(
                                    Position.create(0, 0),
                                    `import ${name} "${path}";\n`,
                                ),
                            ],
                        },
                    },
                });
            });
        }
    });
    return results;
});

// connection.onCodeActionResolve((action) => {
//     console.log('Code action resolve');
//     console.log(action.data);
//     return action;
// });

connection.onSignatureHelp((): SignatureHelp | null => {
    return null;
});

connection.onCompletion((event) => {
    const { position } = event;
    const { uri } = event.textDocument;

    const list = CompletionList.create([], true);
    try {
        const text = getFileText(uri);
        const lines = text.split(/\r?\n/g);
        const program = astResolver.request(uri)?.program;

        const [dot, identStart] = /(\s*\.\s*)?([a-zA-Z_]?[a-zA-Z0-9_]*)$/
            .exec(lines[position.line].substring(0, position.character))
            ?.slice(1) ?? ['', ''];

        if (!dot) {
            importResolver.getNameEntries(uri).forEach(([name, path]) => {
                if (name.startsWith(identStart)) {
                    list.items.push({
                        label: name,
                        detail: path,
                        insertText: name,
                        kind: path.startsWith('mo:')
                            ? CompletionItemKind.Module
                            : CompletionItemKind.Class, // TODO: resolve actors, classes, etc.
                        // additionalTextEdits: import
                    });
                }
            });

            if (identStart) {
                keywords.forEach((keyword) => {
                    if (keyword.startsWith(identStart)) {
                        list.items.push({
                            label: keyword,
                            // detail: , // TODO: explanation of each keyword
                            insertText: keyword,
                            kind: CompletionItemKind.Keyword,
                        });
                    }
                });
            }

            if (program) {
                // TODO: only show relevant identifiers
                const idents = new Set<string>();
                findNodes(program.ast, (node) => node.name === 'VarP').forEach(
                    (node) => {
                        const ident = node.args?.[0];
                        if (typeof ident === 'string') {
                            idents.add(ident);
                        }
                    },
                );
                idents.forEach((ident) => {
                    list.items.push({
                        label: ident,
                        insertText: ident,
                        kind: CompletionItemKind.Variable,
                    });
                });
            }
        }
        // else {
        //     // Check for an identifier before the dot (e.g. `Module.abc`)
        //     const end = position.character - dot.length - identStart.length;
        //     const preMatch = /(\s*\.\s*)?([a-zA-Z_][a-zA-Z0-9_]*)$/.exec(
        //         lines[position.line].substring(0, end),
        //     );
        //     if (preMatch) {
        //         const [, preDot, preIdent] = preMatch;
        //         if (!preDot) {
        //             importResolver
        //                 .getNameEntries(preIdent)
        //                 .forEach(([name, uri]) => {
        //                     const importUri = program?.imports.find()?.path;
        //                     importResolver
        //                         .getFields(uri)
        //                         .forEach(([{ name }, path]) => {
        //                             if (name.startsWith(identStart)) {
        //                                 list.items.push({
        //                                     label: name,
        //                                     detail: path,
        //                                     insertText: name,
        //                                     kind: path.startsWith('mo:')
        //                                         ? CompletionItemKind.Module
        //                                         : CompletionItemKind.Class, // TODO: resolve actors, classes, etc.
        //                                     // additionalTextEdits: import
        //                                 });
        //                             }
        //                         });
        //                 });
        //         }
        //     }
        // }
    } catch (err) {
        console.error('Error during autocompletion:');
        console.error(err);
    }
    return list;
});

// const ignoredAstNodes = [];
connection.onHover((event) => {
    const { position } = event;
    const { uri } = event.textDocument;
    const status = astResolver.requestTyped(uri);
    if (!status || status.outdated || !status.ast) {
        return;
    }
    // Find AST nodes which include the cursor position
    const nodes = findNodes(
        status.ast,
        (node) =>
            !node.file &&
            node.start &&
            node.end &&
            position.line >= node.start[0] - 1 &&
            position.line <= node.end[0] - 1 &&
            // position.line == node.start[0] - 1 &&
            (position.line !== node.start[0] - 1 ||
                position.character >= node.start[1]) &&
            (position.line !== node.end[0] - 1 ||
                position.character < node.end[1]),
    );

    // Find the most specific AST node for the cursor position
    let node: Node | undefined;
    let nodeLines: number;
    let nodeChars: number;
    nodes.forEach((n: Node) => {
        // if (ignoredAstNodes.includes(n.name)) {
        //     return;
        // }
        const nLines = n.end![0] - n.start![0];
        const nChars = n.end![1] - n.start![1];
        if (
            !node ||
            (n.type && !node.type) ||
            nLines < nodeLines ||
            (nLines == nodeLines && nChars < nodeChars)
        ) {
            node = n;
            nodeLines = nLines;
            nodeChars = nChars;
        }
    });
    if (!node || !node.start || !node.end) {
        return;
    }

    const text = getFileText(uri);
    const lines = text.split(/\r?\n/g);

    const startLine = lines[node.start[0] - 1];
    const isSameLine = node.start[0] === node.end[0];

    const codeSnippet = (source: string) => `\`\`\`motoko\n${source}\n\`\`\``;
    const docs: string[] = [];
    const source = (
        isSameLine ? startLine.substring(node.start[1], node.end[1]) : startLine
    ).trim();
    if (node.type) {
        docs.push(codeSnippet(formatMotoko(node.type)));
    } else if (!isSameLine) {
        docs.push(codeSnippet(source));
    }
    const info = getAstInformation(node /* , source */);
    if (info) {
        docs.push(info);
    }
    if (settings?.debugHover) {
        let debugText = `\n${node.name}`;
        if (node.args?.length) {
            // Show AST debug information
            debugText += ` [${node.args
                .map(
                    (arg) =>
                        `\n  ${
                            typeof arg === 'object'
                                ? Array.isArray(arg)
                                    ? '[...]'
                                    : arg?.name
                                : JSON.stringify(arg)
                        }`,
                )
                .join('')}\n]`;
        }
        docs.push(codeSnippet(debugText));
    }
    return {
        contents: {
            kind: MarkupKind.Markdown,
            value: docs.join('\n\n---\n\n'),
        },
        range: {
            start: {
                line: node.start[0] - 1,
                character: isSameLine ? node.start[1] : 0,
            },
            end: {
                line: node.end[0] - 1,
                character: node.end[1],
            },
        },
    };
});

connection.onDefinition(
    async (
        _handler: TextDocumentPositionParams,
    ): Promise<Location | Location[]> => {
        return [];
    },
);

let validatingTimeout: ReturnType<typeof setTimeout>;
let validatingUri: string | undefined;
documents.onDidChangeContent((event) => {
    const document = event.document;
    if (document.uri === validatingUri) {
        clearTimeout(validatingTimeout);
    }
    validatingTimeout = setTimeout(() => {
        validate(document);
        astResolver.update(document.uri, true); /// TODO: also use for type checking?
    }, 100);
    validatingUri = document.uri;
});

// documents.onDidClose((event) =>
//     connection.sendDiagnostics({
//         diagnostics: [],
//         uri: event.document.uri,
//     }),
// );

documents.listen(connection);
connection.listen();
