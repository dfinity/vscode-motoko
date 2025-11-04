import {
    Connection,
    SymbolKind,
    InitializeResult,
    WorkspaceSymbol,
} from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import { clientInitParams, setupClientServer } from './mock';
import { cwd } from 'node:process';
import { wait, waitForNotification } from './helpers';
import { readFileSync } from 'node:fs';

jest.setTimeout(60000);

const filePath = `${cwd()}/test/workspaceSymbol`;
const rootUri = URI.file(filePath);
const text = readFileSync(`${filePath}/main.mo`, 'utf-8');

const file = {
    uri: `${rootUri}/main.mo`,
    textDocument: {
        uri: `${rootUri}/main.mo`,
        languageId: 'motoko',
        version: 1,
        text: text,
    },
};

describe('workspace symbol', () => {
    let client: Connection;
    let server: Connection;

    beforeAll(async () => {
        [client, server] = setupClientServer(true);

        const serverInitialized = waitForNotification(
            'custom/initialized',
            client,
        );

        await client.sendRequest<InitializeResult>(
            'initialize',
            clientInitParams(rootUri),
        );

        await client.sendNotification('initialized', {});

        await serverInitialized;

        await client.sendNotification('textDocument/didOpen', {
            textDocument: file.textDocument,
        });
        await wait(0.5);
    });
    afterAll(async () => {
        await client.sendRequest('shutdown');
        await wait(2);
        client.dispose();
        server.dispose();
    });

    test('get relevant workspace symbol list', async () => {
        const workspaceSymbols = await client.sendRequest<WorkspaceSymbol[]>(
            'workspace/symbol',
            {
                query: 'wss',
            },
        );

        const expected = [
            {
                name: 'wss_func',
                kind: SymbolKind.Variable, // TODO: Should be SymbolKind.Function
                location: {
                    uri: `${rootUri}/lib.mo`,
                    range: {
                        start: {
                            line: 3,
                            character: 9,
                        },
                        end: {
                            line: 5,
                            character: 3,
                        },
                    },
                },
            },
            {
                name: 'wss_var',
                kind: SymbolKind.Variable,
                location: {
                    uri: `${rootUri}/lib.mo`,
                    range: {
                        start: {
                            line: 7,
                            character: 9,
                        },
                        end: {
                            line: 7,
                            character: 31,
                        },
                    },
                },
            },
            {
                name: 'Classwss',
                kind: SymbolKind.Class,
                location: {
                    uri: `${rootUri}/lib.mo`,
                    range: {
                        start: {
                            line: 9,
                            character: 9,
                        },
                        end: {
                            line: 11,
                            character: 3,
                        },
                    },
                },
            },
            {
                name: 'wss_method',
                kind: SymbolKind.Variable, // TODO: Should be SymbolKind.Method
                location: {
                    uri: `${rootUri}/lib.mo`,
                    range: {
                        start: {
                            line: 10,
                            character: 11,
                        },
                        end: {
                            line: 10,
                            character: 31,
                        },
                    },
                },
                containerName: 'Classwss',
            },
        ];
        expect(
            workspaceSymbols.sort((a, b) => a.name.localeCompare(b.name)),
        ).toEqual(expected.sort((a, b) => a.name.localeCompare(b.name)));
    });
});
