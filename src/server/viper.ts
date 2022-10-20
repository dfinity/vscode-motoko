// Load custom `moc.js` with Viper integration
import { Span } from 'motoko/lib/ast';
import mo from './motoko';
import { spawn } from 'child_process';
import * as rpc from 'vscode-jsonrpc/node';
import { resolve } from 'path';
import { connect } from 'net';

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

    connection.sendNotification(new rpc.NotificationType('initialize'));
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

export function compileViper(uri: string, virtualPath: string) {
    const result = mo.compiler.viper([virtualPath]);
    const lookup = result?.code?.[1];
    if (lookup) {
        sourceLookupMap.set(virtualPath, lookup);
    }
    if (connection) {
        // TODO
        connection.sendNotification(
            new rpc.NotificationType('textDocument/didOpen'),
            {
                textDocument: { languageId: 'viper', version: 0, uri },
            },
        );
    }

    return result;
}

export function invalidateViper(virtualPath: string) {
    sourceLookupMap.delete(virtualPath);
}
