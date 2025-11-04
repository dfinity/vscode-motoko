import {
    Connection,
    SymbolKind,
    InitializeResult,
    DocumentSymbol,
} from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import { clientInitParams, setupClientServer } from './mock';
import { cwd } from 'node:process';
import { wait, waitForNotification } from './helpers';
import { readFileSync } from 'node:fs';

jest.setTimeout(60000);

const filePath = `${cwd()}/test/documentSymbol`;
const rootUri = URI.file(filePath);
const text = readFileSync(`${filePath}/lib.mo`, 'utf-8');

const file = {
    uri: `${rootUri}/lib.mo`,
    textDocument: {
        uri: `${rootUri}/lib.mo`,
        languageId: 'motoko',
        version: 1,
        text: text,
    },
};

describe('document symbol', () => {
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

    test('get relevant document symbol list', async () => {
        const documentSymbols = await client.sendRequest<DocumentSymbol[]>(
            'textDocument/documentSymbol',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
            },
        );

        const expected = [
            {
                name: 'module',
                kind: SymbolKind.Module,
                range: {
                    start: {
                        line: 2,
                        character: 0,
                    },
                    end: {
                        line: 12,
                        character: 1,
                    },
                },
                selectionRange: {
                    start: {
                        line: 2,
                        character: 0,
                    },
                    end: {
                        line: 12,
                        character: 1,
                    },
                },
                children: [
                    {
                        name: 'wss_func',
                        kind: SymbolKind.Variable, // TODO: Should be SymbolKind.Function
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
                        selectionRange: {
                            start: {
                                line: 3,
                                character: 14,
                            },
                            end: {
                                line: 3,
                                character: 22,
                            },
                        },
                        children: [],
                    },
                    {
                        name: 'wss_var',
                        kind: SymbolKind.Variable,
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
                        selectionRange: {
                            start: {
                                line: 7,
                                character: 13,
                            },
                            end: {
                                line: 7,
                                character: 20,
                            },
                        },
                        children: [],
                    },
                    {
                        name: 'Classwss',
                        kind: SymbolKind.Class,
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
                        selectionRange: {
                            start: {
                                line: 9,
                                character: 9,
                            },
                            end: {
                                line: 11,
                                character: 3,
                            },
                        },
                        children: [
                            {
                                name: 'wss_method',
                                kind: SymbolKind.Variable, // TODO: Should be SymbolKind.Method
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
                                selectionRange: {
                                    start: {
                                        line: 10,
                                        character: 16,
                                    },
                                    end: {
                                        line: 10,
                                        character: 26,
                                    },
                                },
                                children: [],
                            },
                        ],
                    },
                ],
            },
        ];

        expect(documentSymbols).toEqual(expected);
    });
});
