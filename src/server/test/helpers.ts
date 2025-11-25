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
    redirectConsole: boolean = true,
    initializationOptions?: Record<string, unknown>,
): Promise<T> {
    const [client, _server] = setupClientServer(redirectConsole);
    const serverInitialized = waitForNotification('custom/initialized', client);
    await client.sendRequest<InitializeResult>(
        'initialize',
        clientInitParams(rootUri, initializationOptions),
    );
    await client.sendNotification('initialized', {});
    await serverInitialized;
    const result = await test(client);
    await client.sendRequest('shutdown');
    await wait(1); // wait for shutdown
    return result;
}

// Use if you don't care about having server state between tests.
export async function defaultBeforeAll(
    rootUri: URI,
    redirectConsole: boolean = true,
    initializationOptions?: Record<string, unknown>,
): Promise<[Connection, Connection]> {
    const [client, server] = setupClientServer(redirectConsole);

    const serverInitialized = waitForNotification('custom/initialized', client);

    await client.sendRequest<InitializeResult>(
        'initialize',
        clientInitParams(rootUri, initializationOptions),
    );

    await client.sendNotification('initialized', {});

    await serverInitialized;

    return [client, server];
}

export async function defaultAfterAll(
    client: Connection,
    _server: Connection,
): Promise<void> {
    await client.sendRequest('shutdown');
}

export async function openTextDocuments(
    client: Connection,
    textDocuments: Map<string, TextDocument>,
    rootUri: URI,
    uris: string[],
): Promise<void> {
    await Promise.all(
        uris.map(async (uri) => {
            if (!textDocuments.has(uri)) {
                const basename = uri.startsWith(rootUri.toString())
                    ? uri.slice(rootUri.toString().length)
                    : uri;
                const textDocument = makeTextDocument(rootUri, basename);
                textDocuments.set(uri, textDocument);
                await client.sendNotification('textDocument/didOpen', {
                    textDocument,
                });
            }
        }),
    );
}
