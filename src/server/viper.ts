// Load custom `moc.js` with Viper integration
import mo from './motoko';
import { spawn } from 'child_process';
import * as rpc from 'vscode-jsonrpc/node';
import { resolve } from 'path';
import { connect } from 'net';
import { resolveFilePath, resolveVirtualPath } from './utils';
import { Diagnostic, Range } from 'vscode-languageserver';
import { existsSync, unlinkSync, writeFileSync } from 'fs';
import { sendDiagnostics } from './server';

const serverPort = 54816; // TODO: config
const z3Path = '/nix/store/3dpbapw0ia9q835pqbf7khdi9rps2rm2-z3-4.8.15/bin/z3'; // TODO: detect

// Viper LSP server connection
let connection: rpc.MessageConnection | undefined;

try {
    spawn(
        'java',
        [
            '-Xmx2048m',
            '-Xss16m',
            '-jar',
            resolve(__dirname, '../generated/viperserver.jar'),
            '--singleClient',
            '--serverMode',
            'LSP',
            '--port',
            String(serverPort),
        ],
        {
            env: {
                Z3_EXE: z3Path,
            },
        },
    ).on('error', console.error);

    const socket = connect(serverPort);
    connection = rpc.createMessageConnection(
        new rpc.SocketMessageReader(socket),
        new rpc.SocketMessageWriter(socket),
    );
    connection.listen();

    console.log('Listening to Viper LSP');

    connection.sendNotification(new rpc.NotificationType('initialize'), {
        processId: null,
    });

    connection.onRequest(new rpc.RequestType('GetViperFileEndings'), () => {
        return {
            fileEndings: ['*.vpr'],
        };
    });

    connection.onNotification(
        new rpc.NotificationType<
            object & { uri: string; diagnostics: Diagnostic[] }
        >('StateChange'),
        ({ uri, diagnostics }) => {
            if (diagnostics) {
                const allDiagnostics = [
                    ...(mocViperCache.get(uri)?.diagnostics || []),
                    ...diagnostics.map((diagnostic) => {
                        const range: Range = getMotokoSourceRange(
                            uri,
                            diagnostic.range,
                        ) || {
                            start: { line: 0, character: 0 },
                            end: { line: 0, character: 0 },
                        };
                        return {
                            ...diagnostic,
                            range,
                        };
                    }),
                ];
                sendDiagnostics(
                    resolveVirtualPath(getMotokoUri(uri)),
                    allDiagnostics,
                    true,
                );
            }
        },
    );

    connection.onNotification(
        new rpc.NotificationType<{
            uri: string;
            diagnostics: Diagnostic[];
        }>('textDocument/publishDiagnostics'),
        ({ uri, diagnostics }) => {
            console.log('DIAGNOTICS:', uri, diagnostics);
        },
    );

    connection.onNotification(
        new rpc.NotificationType<{
            uri: string;
            diagnostics: Diagnostic[];
        }>('textDocument/publishDiagnostics'),
        ({ uri, diagnostics }) => {
            console.log('DIAGNOTICS:', uri, diagnostics);
        },
    );

    connection.onNotification(
        new rpc.NotificationType<{ uri: string }>('VerificationNotStarted'),
        () => {
            console.log('(Verification not started)');
        },
    );

    connection.onNotification(
        new rpc.NotificationType<{ data: string; logLevel: number }>('Log'),
        ({ data }) => {
            console.log(data);
        },
    );

    const showMessageTypes = [
        'warnings_during_parsing',
        'configuration_confirmation',
        'ast_construction_result',
    ];
    connection.onNotification(
        new rpc.NotificationType<{
            msgType: string;
            msg: string;
            logLevel: number;
        }>('UnhandledViperServerMessageType'),
        ({ msgType, msg }) => {
            if (showMessageTypes.includes(msgType)) {
                console.log(msg);
            } else {
                console.log('[Unhandled]', msgType);
            }
        },
    );

    // socket.on('data', (data) => {
    //     console.log('DATA:', data.toString('utf8'));
    // });
} catch (err) {
    console.error(`Error while initializing Viper LSP: ${err}`);
}

type CompilerRange = [number, number, number, number];
export type Lookup = (pos: CompilerRange) => CompilerRange;

// Viper -> Motoko source map cache
const mocViperCache = new Map<
    string,
    { source: string; lookup: Lookup; diagnostics: Diagnostic[] }
>();

function getMotokoSourceRange(
    virtualPath: string,
    { start: { line: a, character: b }, end: { line: c, character: d } }: Range,
): Range | undefined {
    const result = mocViperCache.get(virtualPath);
    if (!result) {
        return;
    }
    const { lookup } = result;
    const compilerRange = lookup([a, b, c, d]);
    if (!compilerRange) {
        return;
    }
    return {
        start: { line: compilerRange[0], character: compilerRange[1] },
        end: { line: compilerRange[2], character: compilerRange[3] },
    };
}

export function getViperUri(motokoUri: string) {
    // Ensure a `.vpr` extension
    return `${motokoUri /* .replace(/\.mo$/, '') */}.vpr`;
}

export function getMotokoUri(viperUri: string) {
    // Reversible from `getViperUri()`
    return viperUri.replace(/\.vpr$/, '');
}

export function compileViper(motokoUri: string): Diagnostic[] | undefined {
    const viperUri = getViperUri(motokoUri);
    const viperFile = resolveFilePath(viperUri);
    const motokoPath = resolveVirtualPath(motokoUri);
    let diagnostics: Diagnostic[] | undefined;
    try {
        const result = mo.compiler.viper([motokoPath]);
        if (result?.diagnostics) {
            diagnostics = result.diagnostics;
        }
        if (result?.code) {
            const [source, lookup] = result.code;
            mocViperCache.set(motokoPath, {
                source,
                lookup,
                diagnostics: result.diagnostics || [],
            });
            writeFileSync(viperFile, source, 'utf8');

            if (connection) {
                Promise.resolve(connection)
                    .then(async (connection) => {
                        await connection.sendNotification(
                            new rpc.NotificationType('textDocument/didOpen'),
                            {
                                textDocument: {
                                    languageId: 'viper',
                                    version: 0,
                                    uri: viperUri,
                                },
                            },
                        );
                        await connection.sendNotification(
                            new rpc.NotificationType('textDocument/didSave'),
                            {
                                textDocument: { uri: viperUri },
                            },
                        );
                        await connection.sendRequest(
                            new rpc.RequestType('Verify'),
                            {
                                uri: viperUri,
                                backend: 'silicon',
                                customArgs: [
                                    // '--z3Exe',
                                    // `"${z3Path}"`, // TODO
                                    '--logLevel WARN',
                                    `"${resolveFilePath(viperUri)}"`,
                                ].join(' '),
                                manuallyTriggered: false,
                            },
                        );
                    })
                    .catch((err) =>
                        console.error(
                            `Error while communicating with Viper LSP: ${err}`,
                        ),
                    );
            }
        } else if (existsSync(viperFile)) {
            unlinkSync(viperFile);
        }
        return result.diagnostics;
    } catch (err) {
        console.error(`Error while translating to Viper: ${err}`);
        writeFileSync(viperFile, err?.toString() || '', 'utf8');
    }
    return diagnostics;
}

export function invalidateViper(motokoPath: string) {
    mocViperCache.delete(motokoPath);
}
