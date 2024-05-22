import { spawn } from 'child_process';
import * as rpc from 'vscode-jsonrpc/node';
import { connect } from 'net';
import { resolveFilePath, resolveVirtualPath } from './utils';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { existsSync, unlinkSync, writeFileSync } from 'fs';
import { sendDiagnostics } from './server';
import { getContext } from './context';

let java = 'java';
let jar = '';
let z3 = '';

process.argv.forEach((val) => {
    const m = val.match(/--java="(.+)"/);
    if (m) {
        java = m[1];
    }
    const n = val.match(/--jar="(.+)"/);
    if (n) {
        jar = n[1];
    }
    const z = val.match(/--z3="(.+)"/);
    if (z) {
        z3 = z[1];
    }
});
console.log('java: ', java);
console.log('jar: ', jar);
console.log('z3: ', z3);

const verificationDebounce = 500; // TODO: config

// Viper LSP server connection
let connection: rpc.MessageConnection | undefined;

try {
    const server = spawn(
        java,
        [
            '-Xmx2048m',
            '-Xss16m',
            '-jar',
            jar,
            '--singleClient',
            '--serverMode',
            'LSP',
        ],
        {
            env: {
                Z3_EXE: z3,
            },
        },
    ).on('error', console.error);

    const dataListener = (data: Buffer) => {
        const s = data.toString();
        console.log(`[Viper LS] ${s}`);
        const m = s.match(/<ViperServerPort:([0-9]+)>/);
        if (!m) {
            return;
        } else {
            server.stdout.off('data', dataListener); // Unsubscribe listener
            const port = Number(m[1]);
            const socket = connect(port);
            connection = rpc.createMessageConnection(
                new rpc.SocketMessageReader(socket),
                new rpc.SocketMessageWriter(socket),
            );
            connection.listen();

            console.log(`Listening to Viper LSP (port: ${port})`);

            connection.sendNotification(
                new rpc.NotificationType('initialize'),
                {
                    processId: null,
                },
            );

            connection.onRequest(
                new rpc.RequestType('GetViperFileEndings'),
                () => {
                    return {
                        fileEndings: ['*.mo.vpr'],
                    };
                },
            );

            connection.onNotification(
                new rpc.NotificationType<
                    object & {
                        uri: string;
                        diagnostics: Diagnostic[];
                        newState: number;
                        verificationCompleted: number;
                        time: number;
                    }
                >('StateChange'),
                ({
                    uri,
                    diagnostics,
                    newState,
                    verificationCompleted,
                    time,
                }) => {
                    console.log(
                        '[Viper] state change:',
                        diagnostics,
                        newState,
                        verificationCompleted,
                        time,
                    );
                    try {
                        if (!uri) {
                            return;
                        }
                        const motokoPath = resolveVirtualPath(
                            getMotokoUri(uri),
                        );
                        const defaultRange: Range = {
                            start: { line: 0, character: 0 },
                            end: { line: 0, character: 100 }, // Highlight the `// @verify` comment by default
                        };
                        if (
                            diagnostics &&
                            newState === 6 &&
                            verificationCompleted === 1 &&
                            time > 0 // Filter initial parse warnings
                        ) {
                            const viperDiagnostics = diagnostics
                                .filter(
                                    (d) =>
                                        d.message !==
                                        'Verification aborted exceptionally',
                                )
                                .map((diagnostic) => {
                                    const range: Range =
                                        getMotokoSourceRange(
                                            motokoPath,
                                            diagnostic.range,
                                        ) || defaultRange;
                                    const message =
                                        resolveViperMessage(diagnostic);
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
                                });
                            const success = !!viperDiagnostics.length;
                            const allDiagnostics: Diagnostic[] = [
                                ...(mocViperCache.get(uri)?.diagnostics.filter(
                                    // Only update type checking diagnostics for the original file
                                    (d) => !d.source || d.source === motokoPath,
                                ) || []),
                                ...(success
                                    ? viperDiagnostics
                                    : [
                                          {
                                              message: '✅',
                                              source: motokoPath,
                                              severity:
                                                  DiagnosticSeverity.Information,
                                              range: defaultRange,
                                          },
                                      ]),
                            ];
                            sendDiagnostics(motokoPath, allDiagnostics);
                        }
                    } catch (err) {
                        console.error(
                            `Error while sending Viper diagnostics: ${err}`,
                        );
                    }
                },
            );

            connection.onNotification(
                new rpc.NotificationType<{ data: string; logLevel: number }>(
                    'Log',
                ),
                ({ data }) => {
                    console.log(data);
                },
            );
        }
    };
    server.stdout.on('data', dataListener);
    server.stderr.on('data', (data) => {
        console.error(`child stderr:\n${data}`);
    });
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
        const result = getContext(motokoUri).motoko.compiler.viper([
            motokoPath,
        ]);
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
                            // await connection.sendNotification(
                            //     new rpc.NotificationType(
                            //         'textDocument/didSave',
                            //     ),
                            //     {
                            //         textDocument: { uri: viperUri },
                            //     },
                            // );
                            await connection.sendNotification(
                                new rpc.NotificationType('Verify'),
                                {
                                    uri: viperUri,
                                    backend: 'silicon',
                                    customArgs: [
                                        '--logLevel ERROR',
                                        `"${resolveFilePath(viperUri)}"`,
                                    ].join(' '),
                                    manuallyTriggered: true,
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
        console.error(
            `Error while lifting error information from Viper: ${err}`,
        );
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
    if (message.startsWith('Exhale might fail. Assertion ')) {
        return 'Canister invariant violated by async block';
    }
    const match = /^Postcondition of ([a-zA-Z0-9_]+) might not hold/.exec(
        message,
    );
    if (match) {
        const [, method] = match;
        return `Canister specification violated by method '${method}'`;
    }
    if (message.startsWith('Exhale might fail. Assertion ')) {
        return 'Canister invariant violated by async block';
    }
    return message;
}
