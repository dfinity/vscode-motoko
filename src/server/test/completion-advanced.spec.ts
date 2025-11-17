/**
 * The following tests check advanced completion features:
 *
 * 1. Completion list contains only items relevant to the current scope.
 * 2. Items are ordered by distance to the current cursor position.
 * 3. Completion item kind corresponds to the item.
 * 4. The item detail contains the corresponding item type.
 * 5. If documentation exists it is added to completion item.
 * */
jest.mock('ic-mops/commands/add');
import {
    CompletionItemKind,
    CompletionList,
    Connection,
    InitializeResult,
} from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import { clientInitParams, setupClientServer } from '../test/mock';
import { cwd } from 'node:process';
import { readFileSync } from 'node:fs';
import { EditorState } from '@codemirror/state';
import { wait, waitForNotification } from './helpers';

jest.setTimeout(60000);

const filePath = `${cwd()}/test/completion`;
const rootUri = URI.file(filePath);
const text = readFileSync(`${filePath}/d.mo`, 'utf-8');
const code = EditorState.create({ doc: text });

const file = {
    uri: `${rootUri}/d.mo`,
    textDocument: {
        uri: `${rootUri}/d.mo`,
        languageId: 'motoko',
        version: 1,
        text: text,
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

        await wait(0.5);
    });
    afterAll(async () => {
        await client.sendRequest('shutdown');
        await wait(2);
        client.dispose();
        server.dispose();
    });
    test('global scope items', async () => {
        await client.sendNotification('textDocument/didChange', {
            textDocument: {
                uri: file.uri,
                version: 2,
            },
            contentChanges: [
                {
                    //
                    // module {
                    //     let globalVar = 1;
                    //     /// Documentation to class A
                    //     public class A(constructorParam: Int) {
                    //         var state = "state";
                    //         /// Documentation to method
                    //         public func method(methodParam: Text) {
                    //
                    //         };
                    //     };
                    //     glo  // <=== INSERTED TEXT
                    //     /// Documentation to f
                    //     public func f(functionParam: Int) {
                    //         if (functionParam == 1) {
                    //             let definedInIfBlock = functionParam;
                    //
                    //         };
                    //
                    //         for (counter in [1,2,3].vals()) {
                    //             let definedInForBlock = counter;
                    //         };
                    //     };
                    // };
                    text: code
                        .update({
                            changes: {
                                from: code.doc.line(11).to,
                                insert: '    glo',
                            },
                        })
                        .state.doc.toString(),
                },
            ],
        });

        const completion = await client.sendRequest<CompletionList>(
            'textDocument/completion',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                position: {
                    line: 10,
                    character: 7,
                },
                context: {
                    triggerKind: 2,
                    triggerCharacter: 'o',
                },
            },
        );

        const expected = [
            {
                label: 'f',
                detail: '(functionParam : Int) -> ()',
                kind: CompletionItemKind.Function,
                documentation: 'Documentation to f',
            },
            {
                label: 'A',
                detail: 'A',
                kind: CompletionItemKind.Class,
                documentation: 'Documentation to class A',
            },
            {
                label: 'globalVar',
                detail: 'Nat',
                kind: CompletionItemKind.Variable,
            },
        ];

        expect(completion.items).toEqual(expected);
    });

    test('scope of class method', async () => {
        await client.sendNotification('textDocument/didChange', {
            textDocument: {
                uri: file.uri,
                version: 3,
            },
            contentChanges: [
                {
                    //
                    // module {
                    //     let globalVar = 1;
                    //     /// Documentation to class A
                    //     public class A(constructorParam: Int) {
                    //         var state = "state";
                    //         /// Documentation to method
                    //         public func method(methodParam: Text) {
                    //           glo  // <=== INSERTED TEXT
                    //         };
                    //     };
                    //
                    //     /// Documentation to f
                    //     public func f(functionParam: Int) {
                    //         if (functionParam == 1) {
                    //             let definedInIfBlock = functionParam;
                    //
                    //         };
                    //
                    //         for (counter in [1,2,3].vals()) {
                    //             let definedInForBlock = counter;
                    //         };
                    //     };
                    // };
                    text: code
                        .update({
                            changes: {
                                from: code.doc.line(8).to,
                                insert: '          glo',
                            },
                        })
                        .state.doc.toString(),
                },
            ],
        });

        const completion = await client.sendRequest<CompletionList>(
            'textDocument/completion',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                position: {
                    line: 7,
                    character: 13,
                },
                context: {
                    triggerKind: 2,
                    triggerCharacter: 'o',
                },
            },
        );

        const expected = [
            {
                label: 'methodParam',
                detail: 'Text',
                kind: CompletionItemKind.Variable,
            },
            {
                label: 'method',
                detail: '(methodParam : Text) -> ()',
                kind: CompletionItemKind.Function,
                documentation: 'Documentation to method',
            },
            {
                label: 'f',
                detail: '(functionParam : Int) -> ()',
                kind: CompletionItemKind.Function,
                documentation: 'Documentation to f',
            },
            { label: 'state', kind: CompletionItemKind.Variable },
            {
                label: 'constructorParam',
                detail: 'Int',
                kind: CompletionItemKind.Variable,
            },
            {
                label: 'A',
                detail: 'A',
                kind: CompletionItemKind.Class,
                documentation: 'Documentation to class A',
            },
            {
                label: 'globalVar',
                detail: 'Nat',
                kind: CompletionItemKind.Variable,
            },
        ];

        expect(completion.items).toEqual(expected);
    });

    test('scope of if-block', async () => {
        await client.sendNotification('textDocument/didChange', {
            textDocument: {
                uri: file.uri,
                version: 4,
            },
            contentChanges: [
                {
                    //
                    // module {
                    //     let globalVar = 1;
                    //     /// Documentation to class A
                    //     public class A(constructorParam: Int) {
                    //         var state = "state";
                    //         /// Documentation to method
                    //         public func method(methodParam: Text) {
                    //
                    //         };
                    //     };
                    //
                    //     /// Documentation to f
                    //     public func f(functionParam: Int) {
                    //         if (functionParam == 1) {
                    //             let definedInIfBlock = functionParam;
                    //             glo  // <=== INSERTED TEXT
                    //         };
                    //
                    //         for (counter in [1,2,3].vals()) {
                    //             let definedInForBlock = counter;
                    //         };
                    //     };
                    // };
                    text: code
                        .update({
                            changes: {
                                from: code.doc.line(16).to,
                                insert: '            glo',
                            },
                        })
                        .state.doc.toString(),
                },
            ],
        });

        const completion = await client.sendRequest<CompletionList>(
            'textDocument/completion',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                position: {
                    line: 15,
                    character: 15,
                },
                context: {
                    triggerKind: 2,
                    triggerCharacter: 'o',
                },
            },
        );

        const expected = [
            {
                label: 'definedInIfBlock',
                detail: 'Int',
                kind: CompletionItemKind.Variable,
            },
            {
                label: 'functionParam',
                detail: 'Int',
                kind: CompletionItemKind.Variable,
            },
            {
                label: 'f',
                detail: '(functionParam : Int) -> ()',
                kind: CompletionItemKind.Function,
                documentation: 'Documentation to f',
            },
            {
                label: 'A',
                detail: 'A',
                kind: CompletionItemKind.Class,
                documentation: 'Documentation to class A',
            },
            {
                label: 'globalVar',
                detail: 'Nat',
                kind: CompletionItemKind.Variable,
            },
        ];

        expect(completion.items).toEqual(expected);
    });

    test('scope of for-block', async () => {
        await client.sendNotification('textDocument/didChange', {
            textDocument: {
                uri: file.uri,
                version: 5,
            },
            contentChanges: [
                {
                    //
                    // module {
                    //     let globalVar = 1;
                    //     /// Documentation to class A
                    //     public class A(constructorParam: Int) {
                    //         var state = "state";
                    //         /// Documentation to method
                    //         public func method(methodParam: Text) {
                    //
                    //         };
                    //     };
                    //
                    //     /// Documentation to f
                    //     public func f(functionParam: Int) {
                    //         if (functionParam == 1) {
                    //             let definedInIfBlock = functionParam;
                    //
                    //         };
                    //
                    //         for (counter in [1,2,3].vals()) {
                    //             let definedInForBlock = counter;
                    //             glo  // <=== INSERTED TEXT
                    //         };
                    //     };
                    // };
                    text: code
                        .update({
                            changes: {
                                from: code.doc.line(21).to,
                                insert: '            glo',
                            },
                        })
                        .state.doc.toString(),
                },
            ],
        });

        const completion = await client.sendRequest<CompletionList>(
            'textDocument/completion',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                position: {
                    line: 20,
                    character: 15,
                },
                context: {
                    triggerKind: 2,
                    triggerCharacter: 'o',
                },
            },
        );

        const expected = [
            {
                label: 'definedInForBlock',
                detail: 'Nat',
                kind: CompletionItemKind.Variable,
            },
            {
                label: 'counter',
                detail: 'Nat',
                kind: CompletionItemKind.Variable,
            },
            {
                label: 'functionParam',
                detail: 'Int',
                kind: CompletionItemKind.Variable,
            },
            {
                label: 'f',
                detail: '(functionParam : Int) -> ()',
                kind: CompletionItemKind.Function,
                documentation: 'Documentation to f',
            },
            {
                label: 'A',
                detail: 'A',
                kind: CompletionItemKind.Class,
                documentation: 'Documentation to class A',
            },
            {
                label: 'globalVar',
                detail: 'Nat',
                kind: CompletionItemKind.Variable,
            },
        ];

        expect(completion.items).toEqual(expected);
    });
});
