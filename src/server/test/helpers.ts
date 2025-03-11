import { Connection } from 'vscode-languageserver/node';
import { InitializeResult } from 'vscode-languageclient/node';
import { URI } from 'vscode-uri';
import { clientInitParams, setupClientServer } from './mock';
import * as fs from 'node:fs';
import { join } from 'node:path';

export type TextDocument = {
    uri: string;
    version: number;
    text: string;
    languageId: string;
};

export const wait = (s: number) =>
    new Promise((resolve) => setTimeout(resolve, s * 1000));

export function waitForNotification<T>(
    name: string,
    conn: Connection,
): Promise<T> {
    return new Promise<T>((resolve) => {
        conn.onNotification(name, (message: T) => {
            resolve(message);
        });
    });
}

export function makeTextDocument(
    rootUri: URI,
    file: string,
    version: number = 1,
): TextDocument {
    const uri = join(rootUri.fsPath, file);
    return {
        uri: URI.parse(uri).toString(),
        version,
        text: fs.readFileSync(uri, 'utf-8'),
        languageId: 'motoko',
    };
}

export async function runTest<T>(
    rootUri: URI,
    test: (client: Connection) => Promise<T>,
): Promise<T> {
    const [client, _server] = setupClientServer(true);
    await client.sendRequest<InitializeResult>(
        'initialize',
        clientInitParams(rootUri),
    );
    await client.sendNotification('initialized', {});
    await wait(1); // wait for initialization
    const result = await test(client);
    await client.sendRequest('shutdown');
    await wait(1); // wait for shutdown
    return result;
}
