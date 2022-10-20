// Load custom `moc.js` with Viper integration
import { Span } from 'motoko/lib/ast';
import mo from './motoko';
import { spawn } from 'child_process';
import * as rpc from 'vscode-jsonrpc/node';
import { resolve } from 'path';
import { connect } from 'net';
import { resolveFilePath } from './utils';

const serverPort = 54816; // TODO: config

let connection: rpc.MessageConnection | undefined;

try {
    spawn('java', [
        '-Xmx2048m',
        '-Xss16m',
        '-jar',
        resolve(__dirname, '../generated/viperserver.jar'),
        '--singleClient',
        '--serverMode',
        'LSP',
        '--port',
        String(serverPort),
    ]).on('error', console.error);

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

    // connection.onProgress(
    //     new rpc.ProgressType('StateChange'),
    //     (params) => {
    //         console.log('StateChange:', params); ///
    //     },
    // );

    socket.on('data', (data) => {
        console.log('DATA:', data.toString('utf8'));
    });
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

export function compileViper(motokoPath: string, uri: string) {
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
                    '--z3Exe',
                    `"${'/nix/store/3dpbapw0ia9q835pqbf7khdi9rps2rm2-z3-4.8.15/bin/z3'}"`, // TODO
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
