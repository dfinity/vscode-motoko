// Load custom `moc.js` with Viper integration
import { Span } from 'motoko/lib/ast';
import mo from './motoko';
import { spawn } from 'child_process';
import * as rpc from 'vscode-jsonrpc/node';
import { resolve } from 'path';
import { connect } from 'net';
import { resolveFilePath } from './utils';
import { createConnection, Diagnostic } from 'vscode-languageserver';

const serverPort = 54816; // TODO: config
const z3Path = '/nix/store/3dpbapw0ia9q835pqbf7khdi9rps2rm2-z3-4.8.15/bin/z3'; // TODO: detect

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
        new rpc.NotificationType('StateChange'),
        (params) => {
            console.log('StateChange:', params); ///
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

type Range = { start: Span; end: Span };
type CompilerRange = [number, number, number, number];
export type Lookup = (pos: CompilerRange) => CompilerRange;

// Viper -> Motoko source map cache
const sourceLookupMap = new Map<string, Lookup>();

export function getMotokoSourceRange(
    virtualPath: string,
    { start: [a, b], end: [c, d] }: Range,
): Range | undefined {
    const lookup = sourceLookupMap.get(virtualPath);
    if (!lookup) {
        return;
    }
    const result = lookup([a, b, c, d]);
    if (!result) {
        return;
    }
    return {
        start: [result[0], result[1]],
        end: [result[2], result[3]],
    };
}

export function compileViper(
    _motokoUri: string,
    motokoPath: string,
    uri: string,
    _serverConnection: ReturnType<typeof createConnection>,
) {
    const result = mo.compiler.viper([motokoPath]);
    const lookup = result?.code?.[1];
    if (lookup) {
        sourceLookupMap.set(motokoPath, lookup);
    }
    if (connection) {
        // TODO
        connection.sendNotification(
            new rpc.NotificationType('textDocument/didOpen'),
            {
                textDocument: {
                    languageId: 'viper',
                    version: 0,
                    uri: uri,
                },
            },
        );
        connection.sendNotification(
            new rpc.NotificationType('textDocument/didSave'),
            {
                textDocument: { uri: uri },
            },
        );
        connection
            ?.sendRequest(new rpc.RequestType('Verify'), {
                uri: uri,
                backend: 'silicon',
                customArgs: [
                    // '--z3Exe',
                    // `"${z3Path}"`, // TODO
                    '--logLevel WARN',
                    `"${resolveFilePath(uri)}"`,
                ].join(' '),
                manuallyTriggered: false,
            })
            .then((result) => {
                console.log('RESULT:', result);
            })
            .catch((err) => {
                console.error(`Error while verifying Motoko file: ${err}`);
                console.error(err.data);
            });
    }

    return result;
}

export function invalidateViper(motokoPath: string) {
    sourceLookupMap.delete(motokoPath);
}
