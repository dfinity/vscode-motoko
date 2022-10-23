// Load custom `moc.js` with Viper integration
import { existsSync, unlinkSync, writeFileSync } from 'fs';
import * as rpc from 'vscode-jsonrpc/node';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import connection from './connection';
import mo from './motoko';
import { sendDiagnostics } from './server';
import { resolveFilePath, resolveVirtualPath } from './utils';

const verificationDebounce = 500;

try {
    connection.onNotification(
        new rpc.NotificationType<
            object & {
                uri: string;
                diagnostics: Diagnostic[];
                verificationCompleted: number;
                success: number;
            }
        >('motoko-viper/StateChange'),
        ({ uri, diagnostics, verificationCompleted, success }) => {
            try {
                console.log('AAA:', uri, diagnostics); //////
                if (!uri) {
                    return;
                }
                const motokoPath = resolveVirtualPath(getMotokoUri(uri));
                const defaultRange: Range = {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 100 }, // Highlight the `// @verify` comment by default
                };
                if (
                    diagnostics &&
                    verificationCompleted === 1 &&
                    success === 4
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
                                      message: 'Verification succeeded',
                                      source: motokoPath,
                                      severity: DiagnosticSeverity.Information,
                                      range: defaultRange,
                                  },
                              ]),
                    ];
                    sendDiagnostics(motokoPath, allDiagnostics);
                }
            } catch (err) {
                console.error(`Error while sending Viper diagnostics: ${err}`);
            }
        },
    );

    connection.onNotification(
        new rpc.NotificationType<{ uri: string }>(
            'motoko-viper/VerificationNotStarted',
        ),
        () => {
            console.log('(Verification not started)');
        },
    );

    connection.onNotification(
        new rpc.NotificationType<{ data: string; logLevel: number }>(
            'motoko-viper/Log',
        ),
        ({ data }) => {
            console.log(data);
        },
    );

    const showMessageTypes = [
        'warnings_during_parsing',
        'ast_construction_result',
    ];
    connection.onNotification(
        new rpc.NotificationType<{
            msgType: string;
            msg: string;
            logLevel: number;
        }>('motoko-viper/UnhandledViperServerMessageType'),
        ({ msgType, msg }) => {
            if (showMessageTypes.includes(msgType)) {
                console.log(msg);
            }
            // else {
            //     console.log(`[${msgType}]`);
            // }
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
                console.log('VERIFY!!!')/////
                connection
                    .sendNotification('motoko-viper/VerifyDocument', {
                        uri: viperUri,
                        path: resolveFilePath(viperUri),
                    })
                    .catch((err) =>
                        console.error(
                            `Error while communicating with Viper LSP: ${err}`,
                        ),
                    );
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
        return `Canister invariant violated by method '${method}'`;
    }
    return message;
}
