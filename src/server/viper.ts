// Load custom `moc.js` with Viper integration
import mo from './motoko';
import { spawn } from 'child_process';
import * as rpc from 'vscode-jsonrpc/node';
import { resolve } from 'path';
import { connect } from 'net';
import { resolveFilePath, resolveVirtualPath } from './utils';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { existsSync, unlinkSync, writeFileSync } from 'fs';
import { sendDiagnostics } from './server';

const serverPort = 54816; // TODO: choose automatically, or reuse server from Viper extension
const viperServerPath = resolve(__dirname, '../generated/viperserver.jar'); // TODO: detect from Viper extension
const z3Path = resolve(__dirname, '../generated/z3'); // TODO: detect from Viper extension
const verificationDebounce = 500; // TODO: config

// Viper LSP server connection
let connection: rpc.MessageConnection | undefined;

try {
    spawn(
        'java',
        [
            '-Xmx2048m',
            '-Xss16m',
            '-jar',
            viperServerPath,
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
            try {
                if (diagnostics) {
                    const motokoPath = resolveVirtualPath(getMotokoUri(uri));
                    const allDiagnostics = [
                        ...(mocViperCache.get(uri)?.diagnostics.filter(
                            // Only update type checking diagnostics for the original file
                            (d) => !d.source || d.source === motokoPath,
                        ) || []),
                        ...diagnostics
                            .filter(
                                (d) =>
                                    d.message !==
                                    'Verification aborted exceptionally',
                            )
                            .map((diagnostic) => {
                                const range: Range = getMotokoSourceRange(
                                    motokoPath,
                                    diagnostic.range,
                                ) || {
                                    start: { line: 0, character: 0 },
                                    end: { line: 0, character: 100 }, // Highlight the `// @viper` comment by default
                                };
                                const message = resolveViperMessage(diagnostic);
                                return <Diagnostic>{
                                    ...diagnostic,
                                    message,
                                    range,
                                    source: motokoPath,
                                    relatedInformation: [
                                        {
                                            // Viper source location
                                            location: {
                                                uri,
                                                range: diagnostic.range,
                                            },
                                            message: 'view in context',
                                        },
                                    ],
                                };
                            }),
                    ];
                    sendDiagnostics(motokoPath, allDiagnostics);
                }
            } catch (err) {
                console.error(`Error while sending Viper diagnostics: ${err}`);
            }
        },
    );

    // connection.onNotification(
    //     new rpc.NotificationType<{
    //         uri: string;
    //         diagnostics: Diagnostic[];
    //     }>('textDocument/publishDiagnostics'),
    //     ({ uri, diagnostics }) => {
    //         console.log('Diagnostics:', uri, diagnostics);
    //     },
    // );

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
        // 'configuration_confirmation',
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
                console.log(`[${msgType}]`);
            }
        },
    );
} catch (err) {
    console.error(`Error while initializing Viper LSP: ${err}`);
}

// Temporary range input format for `moc.js`
type FlattenedRange = [number, number, number, number];

// Viper -> Motoko source map cache
interface ViperResult {
    source: string;
    lookup(motokoPath: string, pos: FlattenedRange): Range;
    diagnostics: Diagnostic[];
}
const mocViperCache = new Map<string, ViperResult>();

function getMotokoSourceRange(
    motokoPath: string,
    { start: { line: a, character: b }, end: { line: c, character: d } }: Range,
): Range | undefined {
    const result = mocViperCache.get(motokoPath);
    if (!result) {
        return;
    }
    const range = result.lookup(/* motokoPath */ '', [a, b, c, d]); // TODO: directly pass range
    if (!range || (!range.end.line && !range.end.character)) {
        return;
    }
    return range;
}

export function getViperUri(motokoUri: string) {
    // Ensure a `.vpr` extension
    return `${motokoUri /* .replace(/\.mo$/, '') */}.vpr`;
}

export function getMotokoUri(viperUri: string) {
    // Reversible from `getViperUri()`
    return viperUri.replace(/\.vpr$/, '');
}

let verifyTimeout: ReturnType<typeof setTimeout>;
export function compileViper(motokoUri: string): Diagnostic[] {
    const viperUri = getViperUri(motokoUri);
    const viperFile = resolveFilePath(viperUri);
    const motokoPath = resolveVirtualPath(motokoUri);
    try {
        const result = mo.compiler.viper([motokoPath]);
        if (result.code) {
            const { viper: source, lookup } = result.code;
            mocViperCache.set(motokoPath, {
                source,
                lookup,
                diagnostics: result.diagnostics || [],
            });
            writeFileSync(viperFile, source, 'utf8');

            // Debounce verification
            clearTimeout(verifyTimeout);
            verifyTimeout = setTimeout(() => {
                if (connection) {
                    // Ensure `connection !== undefined` for all callbacks
                    Promise.resolve(connection)
                        .then(async (connection) => {
                            await connection.sendNotification(
                                new rpc.NotificationType(
                                    'textDocument/didOpen',
                                ),
                                {
                                    textDocument: {
                                        languageId: 'viper',
                                        version: 0,
                                        uri: viperUri,
                                    },
                                },
                            );
                            await connection.sendNotification(
                                new rpc.NotificationType(
                                    'textDocument/didSave',
                                ),
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
            }, verificationDebounce);
        } else if (existsSync(viperFile)) {
            unlinkSync(viperFile);
        }
        return result.diagnostics;
    } catch (err) {
        console.error(`Error while translating to Viper: ${err}`);
        if (existsSync(viperFile)) {
            unlinkSync(viperFile);
        }
        // writeFileSync(viperFile, err?.toString() || '', 'utf8');
        return [
            {
                message: String(err),
                source: 'Motoko',
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 100 }, // First line
                },
            },
        ];
    }
}

export function invalidateViper(motokoPath: string) {
    mocViperCache.delete(motokoPath);
}

export function resolveViperMessage(diagnostic: Diagnostic): string {
    const { message } = diagnostic;
    if (message.startsWith('Postcondition of __init__ might not hold')) {
        return 'Canister invariant could not be established after initializing private fields';
    }
    const match = /^Postcondition of ([a-zA-Z0-9_]+) might not hold/.exec(
        message,
    );
    if (match) {
        const [, method] = match;
        return `Canister invariant violated by method '${method}'`;
    }
    return message;
}
