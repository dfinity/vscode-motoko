import { WASI, init as initWASI } from '@wasmer/wasi';
import { pascalCase } from 'change-case';
import { exec, execSync } from 'child_process';
import * as semver from 'semver';
import * as glob from 'fast-glob';
import { existsSync, readFileSync } from 'fs';
import { add as mopsAdd } from 'ic-mops/commands/add';
import { Node } from 'motoko/lib/ast';
import { keywords } from 'motoko/lib/keywords';
import * as baseLibrary from 'motoko/packages/latest/base.json';
import { join, resolve } from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
    CodeAction,
    CodeActionKind,
    CompletionItemKind,
    CompletionList,
    Diagnostic,
    DiagnosticSeverity,
    DocumentSymbol,
    FileChangeType,
    InitializeResult,
    Location,
    MarkupKind,
    Position,
    Range,
    ReferenceParams,
    SignatureHelp,
    SymbolKind,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    TextDocuments,
    TextEdit,
    WorkspaceFolder,
    WorkspaceSymbol,
    Connection,
} from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import {
    DEPLOY_PLAYGROUND,
    DEPLOY_PLAYGROUND_MESSAGE,
    ERROR_MESSAGE,
    IMPORT_MOPS_PACKAGE,
    TEST_FILE_REQUEST,
    TestResult,
} from '../common/connectionTypes';
import {
    ignoreGlobPatterns,
    watchGlob as virtualFilePattern,
} from '../common/watchConfig';
import icCandid from '../generated/aaaaa-aa.did';
import { globalASTCache } from './ast';
import {
    Context,
    addContext,
    allContexts,
    getContext,
    resetContexts,
} from './context';
import DfxResolver from './dfx';
import { organizeImports } from './imports';
import { getAstInformation } from './information';
import {
    defaultRange,
    findDefinition,
    findMostSpecificNodeForPosition,
    locationFromDefinition,
    rangeFromNode,
} from './navigation';
import { deployPlayground } from './playground';
import {
    Class,
    Field,
    Import,
    ObjBlock,
    Program,
    SyntaxWithFields,
    Type,
    asNode,
    findNodes,
} from './syntax';
import {
    formatMotoko,
    forwardMessage,
    getFileText,
    getRelativeUri,
    rangeContainsPosition,
    resolveFilePath,
    resolveVirtualPath,
} from './utils';

import execa = require('execa');

const errorCodes: Record<
    string,
    string
> = require('motoko/contrib/generated/errorCodes.json');

interface Settings {
    motoko: MotokoSettings;
}

interface MotokoSettings {
    hideWarningRegex: string;
    maxNumberOfProblems: number;
    debugHover: boolean;
}

const shouldHideWarnings = (uri: string) =>
    uri.includes('/.vessel/') || uri.includes('/.mops/');

export const documents = new TextDocuments(TextDocument);

export const addHandlers = (connection: Connection, redirectConsole = true) => {
    const packageSourceCache = new Map();
    async function getPackageSources(
        directory: string,
    ): Promise<[string, string][]> {
        async function sourcesFromCommand(command: string) {
            console.log(`Running \`${command}\` in directory: ${directory}`);
            const result = await new Promise<string>((resolve, reject) =>
                exec(command, { cwd: directory }, (err, stdout) =>
                    // @ts-ignore
                    err ? reject(err) : resolve(stdout.toString('utf8')),
                ),
            );
            const args = result.split(/\s/); // TODO: account for quoted strings
            console.log('Received:', args);
            if (!args) {
                return [];
            }
            const sources: [string, string][] = [];
            let nextArg: string | undefined;
            while ((nextArg = args.shift())) {
                if (nextArg === '--package') {
                    const name = args.shift()!;
                    const relativePath = args.shift();
                    if (!relativePath) {
                        continue;
                    }
                    sources.push([name, relativePath]);
                }
            }
            return sources;
        }

        // Prioritize cached sources
        const cached = packageSourceCache.get(directory);
        if (cached) {
            return cached;
        }

        let sources: [string, string][] = [];

        // Prioritize `defaults.build.packtool`
        const dfxPath = join(directory, 'dfx.json');
        if (existsSync(dfxPath)) {
            try {
                const dfxConfig = JSON.parse(
                    getFileText(URI.file(dfxPath).path),
                );
                const command = dfxConfig?.defaults?.build?.packtool;
                if (command) {
                    sources = await sourcesFromCommand(command);
                }
            } catch (err: any) {
                throw new Error(
                    `Error while running \`defaults.build.packtool\` in \`dfx.json\` config file:\n${
                        err?.message || err
                    }`,
                );
            }
        }

        if (!sources.length) {
            // Prioritize MOPS over Vessel
            if (existsSync(join(directory, 'mops.toml'))) {
                // let command = 'mops sources';
                let command = 'npx --no ic-mops sources';
                try {
                    const mopsVersion = execSync(
                        'npx --no ic-mops -- --version',
                    )
                        .toString()
                        .split(/\s/)[1];
                    if (semver.gte(mopsVersion, '0.45.3')) {
                        command += ' --no-install';
                    }
                    sources = await sourcesFromCommand(command);
                } catch (err: any) {
                    // try {
                    //     const sources = await mopsSources(directory);
                    //     if (!sources) {
                    //         throw new Error('Unexpected output');
                    //     }
                    //     return Object.entries(sources);
                    // } catch (fallbackError) {
                    //     console.error(
                    //         `Error in fallback Mops implementation:`,
                    //         fallbackError,
                    //     );
                    //     // Provide a verbose error message for Mops command
                    //     throw new Error(
                    //         `Error while running \`${command}\`: ${
                    //             err?.message || err
                    //         }`,
                    //     );
                    // }

                    throw new Error(
                        `Error while finding Mops packages.\nMake sure the latest version of Mops is installed locally or globally (https://docs.mops.one/quick-start).\n${
                            err?.message || err
                        }`,
                    );
                }
            } else if (existsSync(join(directory, 'vessel.dhall'))) {
                const command = 'vessel sources';
                try {
                    sources = await sourcesFromCommand(command);
                } catch (err: any) {
                    throw new Error(
                        `Error while running \`${command}\`.\nMake sure Vessel is installed (https://github.com/dfinity/vessel/#getting-started).\n${
                            err?.message || err
                        }`,
                    );
                    // return vesselSources(directory);
                }
            }
        }

        packageSourceCache.set(directory, sources);
        return sources;
    }

    let loadingPackages = false;
    let packageConfigChangeTimeout: ReturnType<typeof setTimeout>;
    function notifyPackageConfigChange(reuseCached = false) {
        isWorkspaceReady = false;
        if (!reuseCached) {
            packageSourceCache.clear();
        }
        loadingPackages = true;
        clearTimeout(packageConfigChangeTimeout);
        packageConfigChangeTimeout = setTimeout(async () => {
            try {
                resetContexts();

                const directories: string[] = [];
                try {
                    workspaceFolders?.forEach((workspaceFolder) => {
                        const filenames = [
                            'mops.toml',
                            'vessel.dhall',
                            'dfx.json',
                        ];
                        const cwd = resolveFilePath(workspaceFolder.uri);
                        const paths = glob.sync(`**/{${filenames.join(',')}}`, {
                            cwd,
                            ignore: ignoreGlobPatterns,
                            dot: false,
                            followSymbolicLinks: false,
                        });
                        paths.forEach((path) => {
                            path = join(cwd, path);
                            filenames.forEach((filename) => {
                                if (path.endsWith(filename)) {
                                    const dir = resolve(
                                        path.slice(0, -filename.length),
                                    );
                                    if (!directories.includes(dir)) {
                                        directories.push(dir);
                                    }
                                }
                            });
                        });
                    });
                } catch (err) {
                    console.error(
                        `Error while resolving package config directories: ${err}`,
                    );
                }

                await Promise.all(
                    directories.map(async (dir) => {
                        try {
                            console.log('Loading packages for directory:', dir);

                            let overrideMotokoVersion: string | undefined;
                            try {
                                const result = await execa(
                                    'dfx',
                                    ['--version'],
                                    {
                                        cwd: dir,
                                    },
                                );
                                const match = /dfx 0\.(\d+)/.exec(
                                    result.stdout,
                                );
                                if (match) {
                                    // TODO: generalize to all Motoko versions
                                    const dfxMinorVersion = +match[1];
                                    if (dfxMinorVersion < 18) {
                                        overrideMotokoVersion = '0.10.4';
                                    }
                                }
                            } catch (err) {
                                console.warn(
                                    'Error while checking for custom Motoko version:',
                                );
                                console.warn(err);
                            }
                            if (overrideMotokoVersion) {
                                console.log(
                                    'Using Motoko version:',
                                    overrideMotokoVersion,
                                );
                            }

                            const uri = URI.file(dir).toString();
                            const context = addContext(
                                uri,
                                overrideMotokoVersion,
                            );

                            try {
                                context.packages = await getPackageSources(dir);
                                context.packages.forEach(
                                    ([name, relativePath]) => {
                                        const path = resolveVirtualPath(
                                            uri,
                                            relativePath,
                                        );
                                        console.log(
                                            'Package:',
                                            name,
                                            '->',
                                            path,
                                            `(${uri})`,
                                        );
                                        context.motoko.usePackage(name, path);
                                    },
                                );
                            } catch (err) {
                                connection.sendNotification(ERROR_MESSAGE, {
                                    message: `Error while resolving Motoko packages:`,
                                    detail: String(err).replace(/^Error: /, ''),
                                });
                                context.error = String(err);
                                console.warn(err);
                                return;
                            }
                        } catch (err: any) {
                            connection.sendNotification(ERROR_MESSAGE, {
                                message: `Error while loading Motoko packages:`,
                                detail: String(err).replace(/^Error: /, ''),
                            });
                            console.error(
                                `Error while reading packages for directory (${dir}): ${err}`,
                            );
                            return;
                        }
                    }),
                );

                // Add base library autocompletions
                // TODO: possibly refactor into `context.ts`
                Object.entries(baseLibrary.files).forEach(
                    ([path, { content }]: [string, { content: string }]) => {
                        notifyWriteUri(`mo:base/${path}`, content);
                    },
                );

                loadingPackages = false;
                notifyWorkspace(); // Update virtual file system
                notifyDfxChange(); // Reload dfx.json
                // NOTE: Useful for tests and benchmarks.
                // Unknown notifications are ignored by the vscode lsp client.
                connection.sendNotification('custom/initialized', {});
            } catch (err: any) {
                loadingPackages = false;
                console.error(
                    `Error while loading packages: ${err?.message || err}`,
                );
            }
        }, 1000);
    }

    let dfxResolver: DfxResolver | undefined;
    let dfxChangeTimeout: ReturnType<typeof setTimeout>;
    function notifyDfxChange() {
        isWorkspaceReady = false;
        clearTimeout(dfxChangeTimeout);
        dfxChangeTimeout = setTimeout(async () => {
            try {
                dfxResolver = new DfxResolver(() => {
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
                            const candidPath = join(
                                projectDir,
                                '.dfx/local/lsp',
                            );
                            const candidUri = URI.file(candidPath).toString();

                            // Add management canister Candid file
                            const icPath = join(candidPath, 'aaaaa-aa.did');
                            if (!existsSync(icPath)) {
                                const icUri = URI.file(icPath).toString();
                                writeVirtual(
                                    resolveVirtualPath(icUri),
                                    icCandid,
                                );
                            }

                            const idsPath = join(
                                projectDir,
                                '.dfx/local/canister_ids.json',
                            );
                            const aliases: Record<string, string> = {};
                            if (existsSync(idsPath)) {
                                const canisterIds = JSON.parse(
                                    readFileSync(idsPath, 'utf8'),
                                );
                                Object.entries(canisterIds).forEach(
                                    ([name, ids]: [string, any]) => {
                                        const keys = Object.keys(ids);
                                        // Choose the only principal (or 'local' if multiple are defined)
                                        const key =
                                            keys.length === 1
                                                ? keys[0]
                                                : 'local';
                                        if (key && key in ids) {
                                            aliases[name] = ids[key];
                                        }
                                    },
                                );
                            }
                            const depsPath = join(
                                projectDir,
                                'deps/pulled.json',
                            );
                            if (existsSync(depsPath)) {
                                const pulledDeps = JSON.parse(
                                    readFileSync(depsPath, 'utf8'),
                                );
                                Object.entries(pulledDeps.canisters).forEach(
                                    ([id, { name }]: [string, any]) => {
                                        aliases[name] = id;
                                        // Add Candid as virtual file in LSP directory
                                        const candid = readFileSync(
                                            join(
                                                projectDir,
                                                `deps/candid/${id}.did`,
                                            ),
                                            'utf8',
                                        );
                                        writeVirtual(
                                            resolveVirtualPath(
                                                candidUri,
                                                `${id}.did`,
                                            ),
                                            candid,
                                        );
                                    },
                                );
                            }
                            Object.entries(dfxConfig.canisters).forEach(
                                ([name, canister]) => {
                                    if (!aliases.hasOwnProperty(name)) {
                                        const id = canister.remote?.id?.local;
                                        if (id) {
                                            aliases[name] = id;
                                            const candidPath =
                                                canister.remote?.candid;
                                            if (candidPath) {
                                                // Add Candid as virtual file in LSP directory
                                                const candid = readFileSync(
                                                    resolve(
                                                        projectDir,
                                                        candidPath,
                                                    ),
                                                    'utf8',
                                                );
                                                writeVirtual(
                                                    resolveVirtualPath(
                                                        candidUri,
                                                        `${id}.did`,
                                                    ),
                                                    candid,
                                                );
                                            }
                                        }
                                    }
                                },
                            );
                            allContexts().forEach(({ motoko }) => {
                                console.log('Actor aliases:', aliases);
                                motoko.setAliases(
                                    resolveVirtualPath(candidUri),
                                    aliases,
                                );
                            });
                        } catch (err) {
                            console.error(
                                `Error while resolving canister aliases: ${err}`,
                            );
                        }
                    }
                }
            } catch (err) {
                console.error('Error while loading dfx.json:');
                console.error(err);
            }

            checkWorkspace();
        }, 1000);
    }

    // TODO: refactor
    function findNewImportPosition(
        uri: string,
        context: Context,
        importPath: string,
    ): Position {
        const imports = context.astResolver.request(uri)?.program?.imports;
        if (imports?.length) {
            let lastImport = imports[imports.length - 1];

            // add after last import from the same package
            if (importPath.startsWith('mo:')) {
                const importsReversed = imports.slice().reverse();
                importPath = importPath.split('/')[0];

                const lastSamePackageImport: Import | undefined =
                    importsReversed.find((imprt) => {
                        return (
                            imprt.path === importPath ||
                            imprt.path.startsWith(`${importPath}/`)
                        );
                    });
                if (lastSamePackageImport) {
                    lastImport = lastSamePackageImport;
                } else {
                    // add after last package import
                    const lastPackageImport = importsReversed.find((imprt) => {
                        return imprt.path.startsWith('mo:');
                    });
                    if (lastPackageImport) {
                        lastImport = lastPackageImport;
                    }
                }
            }

            const end = (lastImport.ast as Node)?.end;
            if (end) {
                return Position.create(end[0], 0);
            }
        }
        return Position.create(0, 0);
    }

    if (redirectConsole) {
        console.log = forwardMessage(
            connection.console.log.bind(connection.console),
        );
        console.warn = forwardMessage(
            connection.console.warn.bind(connection.console),
        );
        console.error = forwardMessage(
            connection.console.error.bind(connection.console),
        );
    }

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
                // declarationProvider: true,
                // referencesProvider: true,
                codeActionProvider: {
                    codeActionKinds: [
                        CodeActionKind.QuickFix,
                        CodeActionKind.SourceOrganizeImports,
                    ],
                },
                hoverProvider: true,
                // executeCommandProvider: { commands: [] },
                workspaceSymbolProvider: true,
                documentSymbolProvider: true,
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

        notifyPackageConfigChange();
    });

    connection.onDidChangeWatchedFiles((event) => {
        event.changes.forEach((change) => {
            try {
                if (change.type === FileChangeType.Deleted) {
                    const path = resolveVirtualPath(change.uri);
                    deleteVirtual(path);
                    notifyDeleteUri(change.uri);
                    sendDiagnostics({
                        uri: change.uri,
                        diagnostics: [],
                    });
                } else {
                    notify(change.uri);
                }

                if (
                    change.uri.endsWith('.did') ||
                    change.uri.endsWith('/dfx.json')
                ) {
                    notifyDfxChange();
                    if (change.uri.endsWith('/dfx.json')) {
                        notifyPackageConfigChange(); // `defaults.build.packtool`
                    }
                } else if (
                    change.uri.endsWith('.dhall') ||
                    change.uri.endsWith('/mops.toml')
                ) {
                    notifyPackageConfigChange();
                }
            } catch (err) {
                console.error(
                    `Error while handling Motoko file change: ${err}`,
                );
            }
        });

        checkWorkspace();
    });

    connection.onDidChangeConfiguration((event) => {
        settings = (<Settings>event.settings).motoko;
        notifyPackageConfigChange();
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
                ignore: ignoreGlobPatterns,
                followSymbolicLinks: false,
            }).forEach((relativePath) => {
                const path = join(folderPath, relativePath);
                try {
                    const virtualPath = resolveVirtualPath(
                        folder.uri,
                        relativePath,
                    );
                    // console.log('*', virtualPath, `(${allContexts().length})`);
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
    function processQueue() {
        clearTimeout(checkTimeout);
        clearTimeout(checkWorkspaceTimeout);
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
        if (loadingPackages) {
            return;
        }
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

    let isWorkspaceReady = false;
    let previousCheckedFiles: string[] = [];
    let checkWorkspaceTimeout: ReturnType<typeof setTimeout>;
    /**
     * Type-checks all Motoko files in the current workspace.
     */
    function checkWorkspace() {
        clearTimeout(checkWorkspaceTimeout);
        checkWorkspaceTimeout = setTimeout(async () => {
            try {
                console.log('Checking workspace');

                // workspaceFolders?.forEach((folder) => {
                //     const folderPath = resolveFilePath(folder.uri);
                //     glob.sync('**/*.mo', {
                //         cwd: folderPath,
                //         dot: false, // exclude directories such as `.vessel`
                //         ignore: ignoreGlobs,
                //         followSymbolicLinks: false,
                //     }).forEach((relativePath) => {
                //         const path = join(folderPath, relativePath);
                //         try {
                //             const uri = URI.file(path).toString();
                //             scheduleCheck(uri);
                //         } catch (err) {
                //             // console.error(`Error while checking Motoko file ${path}:`);
                //             console.error(`Error while notifying Motoko file ${path}:`);
                //             console.error(err);
                //         }
                //     });
                // });

                const checkedFiles = documents
                    .all()
                    .map((document) => document.uri)
                    .filter((uri) => uri.endsWith('.mo'));

                // Include entry points from 'dfx.json'
                const projectDir = await dfxResolver?.getProjectDirectory();
                const dfxConfig = await dfxResolver?.getConfig();
                if (projectDir && dfxConfig) {
                    for (const [_name, canister] of Object.entries(
                        dfxConfig.canisters,
                    )) {
                        if (
                            (!canister.type || canister.type === 'motoko') &&
                            canister.main?.endsWith('.mo')
                        ) {
                            const uri = URI.file(
                                join(projectDir, canister.main),
                            ).toString();
                            if (!checkedFiles.includes(uri)) {
                                checkedFiles.push(uri);
                            }
                        }
                    }
                }
                previousCheckedFiles.forEach((uri) => {
                    if (!checkedFiles.includes(uri)) {
                        sendDiagnostics({ uri, diagnostics: [] });
                    }
                });
                checkedFiles.forEach((uri) => notify(uri));
                checkedFiles.forEach((uri) => scheduleCheck(uri));
                previousCheckedFiles = checkedFiles;
                isWorkspaceReady = true;
            } catch (err) {
                console.error('Error while finding dfx canister paths');
                console.error(err);
            }
        }, 1000);
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
                sendDiagnostics({
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

            const { uri: contextUri, motoko, error } = getContext(resolvedUri);
            console.log('~', virtualPath, `(${contextUri || 'default'})`);
            let diagnostics = motoko.check(virtualPath) as Diagnostic[];
            if (error) {
                // Context initialization error
                // diagnostics.length = 0;
                diagnostics.push({
                    source: virtualPath,
                    message: error,
                    severity: DiagnosticSeverity.Information,
                    range: {
                        start: { line: 0, character: 0 },
                        end: { line: 0, character: 100 },
                    },
                });
            }

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
                            !new RegExp(settings!.hideWarningRegex).test(
                                message,
                            ),
                    );
                }
                if (resolvedUri && shouldHideWarnings(resolvedUri)) {
                    diagnostics = diagnostics.filter(
                        ({ severity }) => severity === DiagnosticSeverity.Error,
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
                            message: `${diagnostic.message}. This is usually fixed by running \`dfx deploy\` or adding \`dependencies\` in your dfx.json file`,
                        };
                    }

                    (diagnosticMap[key] || (diagnosticMap[key] = [])).push({
                        ...diagnostic,
                        source: 'Motoko',
                    });
                }
            });

            Object.entries(diagnosticMap).forEach(([path, diagnostics]) => {
                sendDiagnostics({
                    uri: URI.file(path).toString(),
                    diagnostics,
                });
            });
            return true;
        } catch (err) {
            console.error(`Error while compiling Motoko file: ${err}`);
            sendDiagnostics({
                uri: typeof uri === 'string' ? uri : uri.uri,
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
        return false;
    }

    function notifyWriteUri(uri: string, content: string) {
        if (uri.endsWith('.mo')) {
            // Apply package URIs to all contexts
            const contexts = uri.startsWith('mo:')
                ? allContexts()
                : [getContext(uri)];

            contexts.forEach((context) => {
                const { astResolver, importResolver } = context;
                let program: Program | undefined;
                try {
                    astResolver.notify(uri, content);
                    // program = astResolver.request(uri)?.program; // TODO: re-enable for field imports
                } catch (err) {
                    console.error(`Error while parsing (${uri}): ${err}`);
                }
                importResolver.update(uri, program);
            });
        }
    }

    function notifyDeleteUri(uri: string) {
        if (uri.endsWith('.mo')) {
            const { astResolver, importResolver } = getContext(uri);
            astResolver.delete(uri);
            importResolver.delete(uri);
        }
    }

    function writeVirtual(path: string, content: string) {
        allContexts().forEach(({ motoko }) => motoko.write(path, content));
    }

    function deleteVirtual(path: string) {
        allContexts().forEach(({ motoko }) => motoko.delete(path));
    }

    connection.onCodeAction((event) => {
        const uri = event.textDocument.uri;
        const results: CodeAction[] = [];

        // Organize imports
        const status = getContext(uri).astResolver.request(uri);
        const imports = status?.program?.imports;
        if (imports?.length) {
            const start = rangeFromNode(asNode(imports[0].ast))?.start;
            const end = rangeFromNode(
                asNode(imports[imports.length - 1].ast),
            )?.end;
            if (!start || !end) {
                console.warn('Unexpected import AST range format');
                return;
            }
            const range = Range.create(
                Position.create(start.line, 0),
                Position.create(end.line + 1, 0),
            );
            const source = organizeImports(imports).trim() + '\n';
            results.push({
                title: 'Organize imports',
                kind: CodeActionKind.SourceOrganizeImports,
                isPreferred: true,
                edit: {
                    changes: {
                        [uri]: [TextEdit.replace(range, source)],
                    },
                },
            });
        }

        // Import quick-fix actions
        event.context?.diagnostics?.forEach((diagnostic) => {
            const name = /unbound variable ([a-z0-9_]+)/i.exec(
                diagnostic.message,
            )?.[1];
            if (name) {
                const context = getContext(uri);
                context.importResolver
                    .getImportPaths(name, uri)
                    .forEach((path) => {
                        // Add import suggestion
                        results.push({
                            title: `Import "${path}"`,
                            kind: CodeActionKind.QuickFix,
                            isPreferred: true,
                            diagnostics: [diagnostic],
                            edit: {
                                changes: {
                                    [uri]: [
                                        TextEdit.insert(
                                            findNewImportPosition(
                                                uri,
                                                context,
                                                path,
                                            ),
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
            const context = getContext(uri);
            const program = context.astResolver.request(uri)?.program;

            const [dot, identStart] = /(\s*\.\s*)?([a-zA-Z_]?[a-zA-Z0-9_]*)$/
                .exec(lines[position.line].substring(0, position.character))
                ?.slice(1) ?? ['', ''];

            if (!dot) {
                let hadError = false;
                context.importResolver
                    .getNameEntries()
                    .forEach(([name, importPath]) => {
                        if (name.startsWith(identStart)) {
                            try {
                                const path = importPath.startsWith('mo:')
                                    ? importPath
                                    : getRelativeUri(uri, importPath);

                                const status = context.astResolver.request(uri);
                                const existingImport =
                                    status?.program?.imports.find(
                                        (i) =>
                                            i.name === name ||
                                            i.fields.some(
                                                ([, alias]) => alias === name,
                                            ),
                                    );
                                if (existingImport || !status?.program) {
                                    // Skip alternatives with already imported name
                                    return;
                                }
                                const edits: TextEdit[] = [
                                    TextEdit.insert(
                                        findNewImportPosition(
                                            uri,
                                            context,
                                            path,
                                        ),
                                        `import ${name} "${path}";\n`,
                                    ),
                                ];
                                list.items.push({
                                    label: name,
                                    detail: path,
                                    insertText: name,
                                    kind: path.startsWith('mo:')
                                        ? CompletionItemKind.Module
                                        : CompletionItemKind.Class, // TODO: resolve actors, classes, etc.
                                    additionalTextEdits: edits,
                                });
                            } catch (err) {
                                if (!hadError) {
                                    hadError = true;
                                    console.error(
                                        'Error during autocompletion:',
                                    );
                                    console.error(err);
                                }
                            }
                        }
                    });

                if (identStart) {
                    keywords.forEach((keyword) => {
                        if (keyword.startsWith(identStart)) {
                            list.items.push({
                                label: keyword,
                                // detail: , // TODO: explanation for each keyword
                                insertText: keyword,
                                kind: CompletionItemKind.Keyword,
                            });
                        }
                    });
                }

                if (program) {
                    // TODO: only show relevant identifiers
                    const idents = new Set<string>();
                    findNodes(
                        program.ast,
                        (node) => node.name === 'VarP' || node.name === 'VarD',
                    ).forEach((node) => {
                        const ident = node.args?.[0]; // First arg for both `VarP` and `VarD`
                        if (typeof ident === 'string') {
                            idents.add(ident);
                        }
                    });
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

    connection.onHover((event) => {
        function findDocComment(node: Node): string | undefined {
            const definition = findDefinition(uri, event.position, true);
            let docNode: Node | undefined = definition?.cursor || node;
            let depth = 0; // Max AST depth to display doc comment
            while (
                !docNode.doc &&
                docNode.parent &&
                // Unresolved import
                !(
                    docNode.name === 'LetD' &&
                    asNode(docNode.args?.[1])?.name === 'ImportE'
                ) &&
                depth < 2
            ) {
                docNode = docNode.parent;
                depth++;
            }
            if (docNode.name === 'Prog' && !docNode.doc) {
                // Get doc comment at top of file
                const doc = asNode(docNode.args?.[0])?.doc;
                if (doc) {
                    return doc;
                }
            }
            return docNode.doc;
        }

        const { position } = event;
        const { uri } = event.textDocument;
        const { astResolver } = getContext(uri);

        const text = getFileText(uri);
        const lines = text.split(/\r?\n/g);
        const docs: string[] = [];
        let range: Range | undefined;

        // Error code explanations
        const codes: string[] = [];
        diagnosticMap.get(uri)?.forEach((diagnostic) => {
            if (rangeContainsPosition(diagnostic.range, position)) {
                const code = diagnostic.code;
                if (typeof code === 'string' && !codes.includes(code)) {
                    codes.push(code);
                    if (errorCodes.hasOwnProperty(code)) {
                        // Show explanation without Markdown heading
                        docs.push(
                            errorCodes[code].replace(/^# M[0-9]+\s+/, ''),
                        );
                    }
                }
            }
        });

        const status = astResolver.requestTyped(uri);
        if (status && !status.outdated && status.ast) {
            // Find AST nodes which include the cursor position
            const node = findMostSpecificNodeForPosition(
                status.ast,
                position,
                (node) => !!node.type,
                true, // Mouse cursor
            );
            if (node) {
                range = rangeFromNode(node, true);

                const startLine = lines[node.start[0] - 1];
                const isSameLine = node.start[0] === node.end[0];

                const codeSnippet = (source: string) =>
                    `\`\`\`motoko\n${source}\n\`\`\``;
                const source = (
                    isSameLine
                        ? startLine.substring(node.start[1], node.end[1])
                        : startLine
                ).trim();

                // Doc comments
                const doc = findDocComment(node);
                if (doc) {
                    const typeInfo = node.type
                        ? formatMotoko(node.type).trim()
                        : '';
                    const lineIndex = typeInfo.indexOf('\n');
                    if (typeInfo) {
                        if (lineIndex === -1) {
                            docs.push(codeSnippet(typeInfo));
                        }
                    } else if (!isSameLine) {
                        docs.push(codeSnippet(source));
                    }
                    docs.push(doc);
                    if (lineIndex !== -1) {
                        docs.push(
                            `*Type definition:*\n${codeSnippet(typeInfo)}`,
                        );
                    }
                } else if (node.type) {
                    docs.push(codeSnippet(formatMotoko(node.type)));
                } else if (!isSameLine) {
                    docs.push(codeSnippet(source));
                }

                // Syntax explanations
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
            }
        }

        if (!docs.length) {
            return;
        }
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: docs.join('\n\n---\n\n'),
            },
            range,
        };
    });

    connection.onDefinition(
        async (
            event: TextDocumentPositionParams,
        ): Promise<Location | Location[]> => {
            console.log('[Definition]');
            try {
                const definition = findDefinition(
                    event.textDocument.uri,
                    event.position,
                );
                return definition ? locationFromDefinition(definition) : [];
            } catch (err) {
                console.error('Error while finding definition:');
                console.error(err);
                // throw err;
                return [];
            }
        },
    );

    // connection.onDeclaration(
    //     async (
    //         event: TextDocumentPositionParams,
    //     ): Promise<Location | Location[]> => {
    //         console.log('[Declaration]');
    //         return findDefinition(event.textDocument.uri, event.position) || [];
    //     },
    // );

    connection.onWorkspaceSymbol((event) => {
        if (!event.query.length) {
            return [];
        }
        const results: WorkspaceSymbol[] = [];
        const visitDocumentSymbol = (
            uri: string,
            symbol: DocumentSymbol,
            parent?: DocumentSymbol,
        ) => {
            results.push({
                name: symbol.name,
                kind: symbol.kind,
                location: Location.create(uri, symbol.range),
                containerName: parent?.name,
            });
            symbol.children?.forEach((s) =>
                visitDocumentSymbol(uri, s, symbol),
            );
        };
        globalASTCache.forEach((status) => {
            status.program?.exportFields.forEach((field) => {
                getDocumentSymbols(field, true).forEach((symbol) =>
                    visitDocumentSymbol(status.uri, symbol),
                );
            });
        });
        return results;
    });

    connection.onDocumentSymbol((event) => {
        const { uri } = event.textDocument;
        const results: DocumentSymbol[] = [];
        const status = getContext(uri).astResolver.request(uri);
        status?.program?.exportFields.forEach((field) => {
            results.push(...getDocumentSymbols(field, false));
        });
        return results;
    });

    function getDocumentSymbols(
        field: Field,
        skipUnnamed: boolean,
    ): DocumentSymbol[] {
        const range = rangeFromNode(asNode(field.ast)) || defaultRange();
        const kind =
            field.exp instanceof ObjBlock
                ? SymbolKind.Module
                : field.exp instanceof Class
                ? SymbolKind.Class
                : field.exp instanceof Type
                ? SymbolKind.Interface
                : SymbolKind.Variable;
        const children: DocumentSymbol[] = [];
        if (field.exp instanceof SyntaxWithFields) {
            field.exp.fields.forEach((field) => {
                children.push(...getDocumentSymbols(field, skipUnnamed));
            });
        }
        if (skipUnnamed && !field.name) {
            return children;
        }
        return [
            {
                name:
                    field.name ||
                    (field.exp instanceof ObjBlock
                        ? field.exp.sort.toLowerCase()
                        : '(unknown)'), // Default field name
                kind,
                range,
                selectionRange: rangeFromNode(asNode(field.pat?.ast)) || range,
                children,
            },
        ];
    }

    connection.onReferences(
        async (_event: ReferenceParams): Promise<Location[]> => {
            console.log('[References]');
            return [];
        },
    );

    // Run a file which is recognized as a unit test
    connection.onRequest(
        TEST_FILE_REQUEST,
        async (event): Promise<TestResult> => {
            while (!isWorkspaceReady) {
                // Load all packages before running tests
                await new Promise((resolve) => setTimeout(resolve, 500));
            }

            try {
                const { uri } = event;

                const context = getContext(uri);
                const { motoko } = context;

                // TODO: optimize @testmode check
                const source = getFileText(uri);
                const mode =
                    /\/\/[^\S\n]*@testmode[^\S\n]*([a-zA-Z]+)/.exec(
                        source,
                    )?.[1] || 'interpreter';
                const virtualPath = resolveVirtualPath(uri);

                console.log('Running test:', uri, `(${mode})`);

                if (mode === 'interpreter') {
                    // Run tests via moc.js interpreter
                    motoko.setRunStepLimit(100_000_000);
                    const output = motoko.run(virtualPath);
                    return {
                        passed: output.result
                            ? !output.result.error
                            : !output.stderr.includes('error'), // fallback for previous moc.js versions
                        stdout: output.stdout,
                        stderr: output.stderr,
                    };
                } else if (mode === 'wasi') {
                    // Run tests via Wasmer
                    const start = Date.now();
                    const wasiResult = motoko.wasm(virtualPath, 'wasi');
                    console.log('Compile time:', Date.now() - start);

                    const WebAssembly = (global as any).WebAssembly;
                    const module = await (
                        WebAssembly.compileStreaming || WebAssembly.compile
                    )(wasiResult.wasm);
                    await initWASI();
                    const wasi = new WASI({});
                    await wasi.instantiate(module, {});
                    const exitCode = wasi.start();
                    const stdout = wasi.getStdoutString();
                    const stderr = wasi.getStderrString();
                    wasi.free();
                    if (exitCode !== 0) {
                        console.log(stdout);
                        console.error(stderr);
                        console.log('Exit code:', exitCode);
                    }
                    return {
                        passed: exitCode === 0,
                        stdout,
                        stderr,
                    };
                } else {
                    throw new Error(`Invalid test mode: '${mode}'`);
                }
            } catch (err) {
                console.error(err);
                return {
                    passed: false,
                    stdout: '',
                    stderr: (err as any)?.message || String(err),
                };
            }
        },
    );

    // Deploy to Motoko Playground
    connection.onRequest(DEPLOY_PLAYGROUND, async (params) => {
        const notify = (message: string) => {
            console.log(message);
            connection.sendNotification(DEPLOY_PLAYGROUND_MESSAGE, { message });
        };
        try {
            if (!isWorkspaceReady) {
                notify('Loading workspace...');
                while (!isWorkspaceReady) {
                    await new Promise((resolve) => setTimeout(resolve, 200));
                }
            }
            return deployPlayground(params, notify);
        } catch (err) {
            console.error(err);
            throw err;
        }
    });

    // Install and import mops package
    connection.onRequest(IMPORT_MOPS_PACKAGE, async (params) => {
        mopsAdd(params.name);

        const context = getContext(params.uri);

        if (params.uri.endsWith('.mo')) {
            return [
                TextEdit.insert(
                    findNewImportPosition(
                        params.uri,
                        context,
                        `mo:${params.name}`,
                    ),
                    `import ${pascalCase(params.name)} "mo:${params.name}";\n`,
                ),
            ];
        } else {
            return [];
        }
    });

    const diagnosticMap = new Map<string, Diagnostic[]>();
    async function sendDiagnostics(params: {
        uri: string;
        diagnostics: Diagnostic[];
    }) {
        const { uri, diagnostics } = params;
        diagnosticMap.set(uri, diagnostics);
        return connection.sendDiagnostics(params);
    }

    let validatingTimeout: ReturnType<typeof setTimeout>;
    let validatingUri: string | undefined;
    documents.onDidChangeContent((event) => {
        const document = event.document;
        const { uri } = document;
        if (uri === validatingUri) {
            clearTimeout(validatingTimeout);
        }
        validatingUri = uri;
        validatingTimeout = setTimeout(() => {
            notify(document);
            scheduleCheck(document);
            // const { astResolver } = getContext(uri);
            // astResolver.update(uri, true); // TODO: also use for type checking?
        }, 500);
    });

    documents.onDidOpen((event) => scheduleCheck(event.document.uri));
    documents.onDidClose(async (event) => {
        await sendDiagnostics({
            uri: event.document.uri,
            diagnostics: [],
        });
        checkWorkspace();
    });

    documents.listen(connection);
};
