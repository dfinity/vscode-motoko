import icCandid from '../generated/aaaaa-aa.did';
import { Hover } from 'vscode';
import { InitializeResult } from 'vscode-languageclient/node';
import { Connection } from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import * as fs from 'node:fs';
import { clientInitParams, setupClientServer, wait } from './bench/helpers';
import { join } from 'node:path';

describe('server', () => {
    test('generated IC Candid file has expected format', () => {
        expect(icCandid).toContain('service ic : {\n');
    });
});

describe('cache', () => {
    beforeAll(() => {
        jest.mock('ic-mops/commands/add');
        jest.setTimeout(10 * 1000);
    });

    const rootUri = URI.parse(join(__dirname, '..', '..', 'test', 'cache'));

    function makeTextDocument(
        file: string,
        version: number = 1,
    ): {
        uri: string;
        version: number;
        text: string;
        languageId: string;
    } {
        const uri = join(rootUri.fsPath, file);
        return {
            uri,
            version,
            text: fs.readFileSync(uri, 'utf-8'),
            languageId: 'motoko',
        };
    }

    async function runTest<T>(test: (client: Connection) => Promise<T>) {
        const [client, _server] = setupClientServer();
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

    test('Top.mo has correct hover', async () => {
        const hover = await runTest(async (client) => {
            const textDocument = makeTextDocument('Top.mo');
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 5, character: 21 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\nmodule { top : { foo : () -> () } }\n\n```',
        });
    });

    test('Top.mo has correct hover after changing value', async () => {
        const hover = await runTest(async (client) => {
            const textDocument = makeTextDocument('Top.mo');
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            await client.sendNotification('textDocument/didChange', {
                textDocument,
                contentChanges: [
                    {
                        text: textDocument.text
                            .replace(': ()', ': Nat')
                            .replace('Bottom.bottom.bar()', '42'),
                    },
                ],
            });
            return await client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 5, character: 21 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\nmodule { top : { foo : () -> () } }\n\n```',
        });
    });

    test('Top.mo has correct hover for changed dependency', async () => {
        // Hover will get the typed AST
        const hover = await runTest(async (client) => {
            const textDocumentTop = makeTextDocument('Top.mo');
            await client.sendNotification('textDocument/didOpen', {
                textDocument: textDocumentTop,
            });
            const textDocumentBottom = makeTextDocument('Bottom.mo');
            await client.sendNotification('textDocument/didOpen', {
                textDocument: textDocumentBottom,
            });
            await client.sendNotification('textDocument/didChange', {
                textDocument: textDocumentBottom,
                contentChanges: [
                    {
                        text: textDocumentBottom.text
                            .replace(': ()', ': Nat')
                            .replace('return ()', 'return 42'),
                    },
                ],
            });
            await client.sendNotification('textDocument/didChange', {
                textDocument: textDocumentTop,
                contentChanges: [
                    {
                        text: textDocumentTop.text.replace(': ()', ': Nat'),
                    },
                ],
            });
            await wait(1); // wait for changes to complete
            return await client.sendRequest<Hover>('textDocument/hover', {
                textDocument: textDocumentTop,
                position: { line: 5, character: 21 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\nmodule { top : { foo : () -> Nat } }\n\n```',
        });
    });

    test('Top.mo has correct hover for changed dependency without changing itself', async () => {
        // Hover will get the typed AST
        const hover = await runTest(async (client) => {
            const textDocumentTop = makeTextDocument('Top.mo');
            await client.sendNotification('textDocument/didOpen', {
                textDocument: textDocumentTop,
            });
            const textDocumentBottom = makeTextDocument('Bottom.mo');
            await client.sendNotification('textDocument/didOpen', {
                textDocument: textDocumentBottom,
            });
            await client.sendNotification('textDocument/didChange', {
                textDocument: textDocumentBottom,
                contentChanges: [
                    {
                        text: textDocumentBottom.text.replace(
                            'bottom {',
                            'bottom { public let foo : Nat = 42;',
                        ),
                    },
                ],
            });
            await wait(1); // wait for changes to complete
            return await client.sendRequest<Hover>('textDocument/hover', {
                textDocument: textDocumentTop,
                position: { line: 4, character: 49 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\n{ bar : () -> (); foo : Nat }\n\n```',
        });
    });
});
