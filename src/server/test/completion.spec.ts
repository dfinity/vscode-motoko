jest.mock('ic-mops/commands/add');
import {
    CompletionItem,
    CompletionList,
    Connection,
    InitializeResult,
} from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import { clientInitParams, setupClientServer } from '../test/mock';
import { cwd } from 'node:process';
import { wait, waitForNotification } from './helpers';

jest.setTimeout(60000);

const initText = `
import A = "a";
import B = "b";
import Blob = "mo:base/Blob";
`;

const workText =
    initText +
    `
let a =     A.
let b =     B.
let c =     C.
let d =  Blob.
let e = Array.
let f =     B.g
let g =     B.f
let h =     C.Cell
let i =     C
             .
              // comment to avoid trailing line
let j =     A.(B.)
let k =     A
             .(
            B.)
}

module Local {
  public let foo : Int = 5;
  public let bar : Text = "test";
  public type Foo = Nat;

  public module Nested {
    public let baz : Text = "nested";
  };
};

let l = Local.;
let m = Local.Nested.;
`;

const rootUri = URI.file(`${cwd()}/test/completion`);

const file = {
    uri: `${rootUri}/not-exist.mo`,
    textDocument: {
        uri: `${rootUri}/not-exist.mo`,
        languageId: 'motoko',
        version: 1,
        text: initText,
    },
};

describe('completion', () => {
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

        await client.sendNotification('textDocument/didChange', {
            textDocument: {
                uri: file.uri,
                version: 2,
            },
            contentChanges: [
                {
                    text: workText,
                },
            ],
        });

        await wait(0.5);
    });
    afterAll(async () => {
        await client.sendRequest('shutdown');
        await wait(2);
        client.dispose();
        server.dispose();
    });
    test('local module completion with import 1', async () => {
        const completion = await client.sendRequest<CompletionList>(
            'textDocument/completion',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                position: {
                    line: 5,
                    character: 14,
                },
                context: {
                    triggerKind: 2,
                    triggerCharacter: '.',
                },
            },
        );

        const expected = [{ label: 'new', detail: 'a.mo', kind: 3 }];

        expect(completion.items).toEqual(expected);
    });

    test('local module completion with import 2', async () => {
        const completion = await client.sendRequest<CompletionList>(
            'textDocument/completion',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                position: {
                    line: 6,
                    character: 14,
                },
                context: {
                    triggerKind: 2,
                    triggerCharacter: '.',
                },
            },
        );

        const expected = [
            { label: 'foo', detail: 'b.mo', kind: 3 },
            { label: 'foobar', detail: 'b.mo', kind: 3 },
            { label: 'a', detail: 'b.mo', kind: 6 },
            { label: 'Age', detail: 'b.mo', kind: 8 },
            { label: 'D', detail: 'b.mo', kind: 7 },
        ];

        expect(completion.items).toEqual(expected);
    });

    test('local module completion without import', async () => {
        const completion = await client.sendRequest<CompletionList>(
            'textDocument/completion',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                position: {
                    line: 7,
                    character: 14,
                },
                context: {
                    triggerKind: 2,
                    triggerCharacter: '.',
                },
            },
        );

        const expected = [
            { label: 'Cell', detail: 'c.mo', kind: 8 },
            { label: 'State', detail: 'c.mo', kind: 8 },
            { label: 'new', detail: 'c.mo', kind: 3 },
        ];

        expect(completion.items).toEqual(expected);
    });

    test('Blob stdlib module completion with import', async () => {
        const completion = await client.sendRequest<CompletionList>(
            'textDocument/completion',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                position: {
                    line: 8,
                    character: 14,
                },
                context: {
                    triggerKind: 2,
                    triggerCharacter: '.',
                },
            },
        );

        // NOTE: relying on concrete completion items is brittle
        // since they may change over time
        expect(completion.items.length).toBeGreaterThanOrEqual(1);
        expect(
            completion.items.every(
                (item: CompletionItem) => item.detail === 'mo:base/Blob.mo',
            ),
        ).toBe(true);
    });

    test('Array stdlib module completion without import', async () => {
        const completion = await client.sendRequest<CompletionList>(
            'textDocument/completion',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                position: {
                    line: 9,
                    character: 14,
                },
                context: {
                    triggerKind: 2,
                    triggerCharacter: '.',
                },
            },
        );

        // NOTE: relying on concrete completion items is brittle
        // since they may change over time
        expect(completion.items.length).toBeGreaterThanOrEqual(1);
        expect(
            completion.items.every(
                (item: CompletionItem) => item.detail === 'mo:base/Array.mo',
            ),
        ).toBe(true);
    });

    test('local module completion with non-matchable prefix', async () => {
        const completion = await client.sendRequest<CompletionList>(
            'textDocument/completion',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                position: {
                    line: 10,
                    character: 15,
                },
                context: {
                    triggerKind: 2,
                    triggerCharacter: '.',
                },
            },
        );

        expect(completion.items.length).toBe(5);
    });

    test('local module completion with matchable prefix', async () => {
        const completion = await client.sendRequest<CompletionList>(
            'textDocument/completion',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                position: {
                    line: 11,
                    character: 15,
                },
                context: {
                    triggerKind: 2,
                    triggerCharacter: '.',
                },
            },
        );

        const expected = [
            { label: 'foo', detail: 'b.mo', kind: 3 },
            { label: 'foobar', detail: 'b.mo', kind: 3 },
            { label: 'a', detail: 'b.mo', kind: 6 },
            { label: 'Age', detail: 'b.mo', kind: 8 },
            { label: 'D', detail: 'b.mo', kind: 7 },
        ];

        expect(completion.items).toEqual(expected);
    });

    test('local module completion with full ident', async () => {
        const completion = await client.sendRequest<CompletionList>(
            'textDocument/completion',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                position: {
                    line: 12,
                    character: 18,
                },
                context: {
                    triggerKind: 2,
                    triggerCharacter: '.',
                },
            },
        );

        const expected = [
            { label: 'Cell', detail: 'c.mo', kind: 8 },
            { label: 'State', detail: 'c.mo', kind: 8 },
            { label: 'new', detail: 'c.mo', kind: 3 },
        ];

        expect(completion.items).toEqual(expected);
    });

    test('multiline completions work', async () => {
        // let i = ...
        const completion = await client.sendRequest<CompletionList>(
            'textDocument/completion',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                position: {
                    line: 15,
                    character: 14,
                },
                context: {
                    triggerKind: 2,
                    triggerCharacter: '.',
                },
            },
        );

        const expected = [
            { label: 'Cell', detail: 'c.mo', kind: 8 },
            { label: 'State', detail: 'c.mo', kind: 8 },
            { label: 'new', detail: 'c.mo', kind: 3 },
        ];

        expect(completion.items).toEqual(expected);
    });

    test('two dots in one line work -- first dot', async () => {
        // let j = ...
        const completion = await client.sendRequest<CompletionList>(
            'textDocument/completion',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                position: {
                    line: 16,
                    character: 14,
                },
                context: {
                    triggerKind: 2,
                    triggerCharacter: '.',
                },
            },
        );

        const expected = [{ label: 'new', detail: 'a.mo', kind: 3 }];

        expect(completion.items).toEqual(expected);
    });

    test('two dots in one line work -- second dot', async () => {
        // let j = ...
        const completion = await client.sendRequest<CompletionList>(
            'textDocument/completion',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                position: {
                    line: 16,
                    character: 17,
                },
                context: {
                    triggerKind: 2,
                    triggerCharacter: '.',
                },
            },
        );

        const expected = [
            { label: 'foo', detail: 'b.mo', kind: 3 },
            { label: 'foobar', detail: 'b.mo', kind: 3 },
            { label: 'a', detail: 'b.mo', kind: 6 },
            { label: 'Age', detail: 'b.mo', kind: 8 },
            { label: 'D', detail: 'b.mo', kind: 7 },
        ];

        expect(completion.items).toEqual(expected);
    });

    test('two dots in multiple lines work -- first dot', async () => {
        // let k = ...
        const completion = await client.sendRequest<CompletionList>(
            'textDocument/completion',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                position: {
                    line: 18,
                    character: 14,
                },
                context: {
                    triggerKind: 2,
                    triggerCharacter: '.',
                },
            },
        );

        const expected = [{ label: 'new', detail: 'a.mo', kind: 3 }];

        expect(completion.items).toEqual(expected);
    });

    test('two dots in multiple lines work -- second dot', async () => {
        // let k = ...
        const completion = await client.sendRequest<CompletionList>(
            'textDocument/completion',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                position: {
                    line: 19,
                    character: 14,
                },
                context: {
                    triggerKind: 2,
                    triggerCharacter: '.',
                },
            },
        );

        const expected = [
            { label: 'foo', detail: 'b.mo', kind: 3 },
            { label: 'foobar', detail: 'b.mo', kind: 3 },
            { label: 'a', detail: 'b.mo', kind: 6 },
            { label: 'Age', detail: 'b.mo', kind: 8 },
            { label: 'D', detail: 'b.mo', kind: 7 },
        ];

        expect(completion.items).toEqual(expected);
    });

    test('Local module', async () => {
        // let l = ...
        const completion = await client.sendRequest<CompletionList>(
            'textDocument/completion',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                position: {
                    line: 32,
                    character: 14,
                },
                context: {
                    triggerKind: 2,
                    triggerCharacter: '.',
                },
            },
        );

        const expected = [
            { label: 'foo', detail: 'not-exist.mo', kind: 6 },
            { label: 'bar', detail: 'not-exist.mo', kind: 6 },
            { label: 'Foo', detail: 'not-exist.mo', kind: 8 },
            { label: 'Nested', detail: 'not-exist.mo', kind: 6 },
        ];

        expect(completion.items).toEqual(expected);
    });

    test('Nested module', async () => {
        // let m = ...
        const completion = await client.sendRequest<CompletionList>(
            'textDocument/completion',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                position: {
                    line: 33,
                    character: 21,
                },
                context: {
                    triggerKind: 2,
                    triggerCharacter: '.',
                },
            },
        );

        const expected = [{ label: 'baz', detail: 'not-exist.mo', kind: 6 }];

        expect(completion.items).toEqual(expected);
    });
});
