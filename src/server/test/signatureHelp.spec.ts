import {
    Connection,
    InitializeResult,
    SignatureHelp,
} from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import { clientInitParams, setupClientServer } from './mock';
import { cwd } from 'node:process';
import { wait, waitForNotification } from './helpers';
import { readFileSync } from 'node:fs';

jest.setTimeout(60000);

const filePath = `${cwd()}/test/signatureHelp`;
const rootUri = URI.file(filePath);
const text = readFileSync(`${filePath}/signatures.mo`, 'utf-8');

const file = {
    uri: `${rootUri}/signatures.mo`,
    textDocument: {
        uri: `${rootUri}/signatures.mo`,
        languageId: 'motoko',
        version: 1,
        text: text,
    },
};

describe('signanureHelp', () => {
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

    test('triggered signature help with first parameter', async () => {
        const signatureHelp = await client.sendRequest<SignatureHelp>(
            'textDocument/signatureHelp',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                // let x1 = f1(1, "qwerty");
                //             ^
                position: {
                    line: 4,
                    character: 20,
                },
                context: {
                    triggerKind: 2,
                    triggerCharacter: '(',
                    isRetrigger: false,
                },
            },
        );

        const expected = {
            signatures: [
                {
                    label: 'f1(a : Int, b : Text) -> Int',
                    parameters: [{ label: [3, 10] }, { label: [11, 20] }],
                },
            ],
            activeSignature: 0,
            activeParameter: 0,
        };

        expect(signatureHelp).toEqual(expected);
    });

    test('triggered signature help with second parameter', async () => {
        const signatureHelp = await client.sendRequest<SignatureHelp>(
            'textDocument/signatureHelp',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                // let x1 = f1(1, "qwerty");
                //                  ^
                position: {
                    line: 4,
                    character: 25,
                },
                context: {
                    triggerKind: 2,
                    triggerCharacter: ',',
                    isRetrigger: false,
                },
            },
        );

        const expected = {
            signatures: [
                {
                    label: 'f1(a : Int, b : Text) -> Int',
                    parameters: [{ label: [3, 10] }, { label: [11, 20] }],
                },
            ],
            activeSignature: 0,
            activeParameter: 1,
        };

        expect(signatureHelp).toEqual(expected);
    });

    test('invoke signature help with first parameter', async () => {
        const signatureHelp = await client.sendRequest<SignatureHelp>(
            'textDocument/signatureHelp',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                // let x1 = f1(1, "qwerty");
                //             ^
                position: {
                    line: 4,
                    character: 20,
                },
                context: {
                    triggerKind: 1,
                    isRetrigger: false,
                },
            },
        );

        const expected = {
            signatures: [
                {
                    label: 'f1(a : Int, b : Text) -> Int',
                    parameters: [{ label: [3, 10] }, { label: [11, 20] }],
                },
            ],
            activeSignature: 0,
            activeParameter: 0,
        };

        expect(signatureHelp).toEqual(expected);
    });

    test('invoke signature help with second parameter', async () => {
        const signatureHelp = await client.sendRequest<SignatureHelp>(
            'textDocument/signatureHelp',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                // let x1 = f1(1, "qwerty");
                //                  ^
                position: {
                    line: 4,
                    character: 25,
                },
                context: {
                    triggerKind: 1,
                    isRetrigger: false,
                },
            },
        );

        const expected = {
            signatures: [
                {
                    label: 'f1(a : Int, b : Text) -> Int',
                    parameters: [{ label: [3, 10] }, { label: [11, 20] }],
                },
            ],
            activeSignature: 0,
            activeParameter: 1,
        };

        expect(signatureHelp).toEqual(expected);
    });

    test('change signature help with first parameter', async () => {
        const signatureHelp = await client.sendRequest<SignatureHelp>(
            'textDocument/signatureHelp',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                // let x1 = f1(1, "qwerty");
                //             ^
                position: {
                    line: 4,
                    character: 20,
                },
                context: {
                    triggerKind: 3,
                    isRetrigger: true,
                    activeSignatureHelp: {
                        signatures: [
                            {
                                label: 'f1(a : Int, b : Text) -> Int',
                                parameters: [
                                    { label: [3, 10] },
                                    { label: [11, 20] },
                                ],
                            },
                        ],
                        activeSignature: 0,
                        activeParameter: 1,
                    },
                },
            },
        );

        const expected = {
            signatures: [
                {
                    label: 'f1(a : Int, b : Text) -> Int',
                    parameters: [{ label: [3, 10] }, { label: [11, 20] }],
                },
            ],
            activeSignature: 0,
            activeParameter: 0,
        };

        expect(signatureHelp).toEqual(expected);
    });

    test('change signature help with second parameter', async () => {
        const signatureHelp = await client.sendRequest<SignatureHelp>(
            'textDocument/signatureHelp',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                // let x1 = f1(1, "qwerty");
                //               ^
                position: {
                    line: 4,
                    character: 22,
                },
                context: {
                    triggerKind: 3,
                    isRetrigger: true,
                    activeSignatureHelp: {
                        signatures: [
                            {
                                label: 'f1(a : Int, b : Text) -> Int',
                                parameters: [
                                    { label: [3, 10] },
                                    { label: [11, 20] },
                                ],
                            },
                        ],
                        activeSignature: 0,
                        activeParameter: 0,
                    },
                },
            },
        );

        const expected = {
            signatures: [
                {
                    label: 'f1(a : Int, b : Text) -> Int',
                    parameters: [{ label: [3, 10] }, { label: [11, 20] }],
                },
            ],
            activeSignature: 0,
            activeParameter: 1,
        };

        expect(signatureHelp).toEqual(expected);
    });

    test("remove signature help outside function parameters (after ')')", async () => {
        const signatureHelp = await client.sendRequest<SignatureHelp>(
            'textDocument/signatureHelp',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                // let x1 = f1(1, "qwerty");
                //                        ^
                position: {
                    line: 4,
                    character: 31,
                },
                context: {
                    triggerKind: 3,
                    isRetrigger: true,
                    activeSignatureHelp: {
                        signatures: [
                            {
                                label: 'f1(a : Int, b : Text) -> Int',
                                parameters: [
                                    { label: [3, 10] },
                                    { label: [11, 20] },
                                ],
                            },
                        ],
                        activeSignature: 0,
                        activeParameter: 1,
                    },
                },
            },
        );

        const expected = null;

        expect(signatureHelp).toEqual(expected);
    });

    test("remove signature help outside function parameters (before '(')", async () => {
        const signatureHelp = await client.sendRequest<SignatureHelp>(
            'textDocument/signatureHelp',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                // let x1 = f1(1, "qwerty");
                //            ^
                position: {
                    line: 4,
                    character: 19,
                },
                context: {
                    triggerKind: 3,
                    isRetrigger: true,
                    activeSignatureHelp: {
                        signatures: [
                            {
                                label: 'f1(a : Int, b : Text) -> Int',
                                parameters: [
                                    { label: [3, 10] },
                                    { label: [11, 20] },
                                ],
                            },
                        ],
                        activeSignature: 0,
                        activeParameter: 0,
                    },
                },
            },
        );

        const expected = null;

        expect(signatureHelp).toEqual(expected);
    });

    test('remove signature help outside function parameters (move line up)', async () => {
        const signatureHelp = await client.sendRequest<SignatureHelp>(
            'textDocument/signatureHelp',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                position: {
                    line: 3,
                    character: 20,
                },
                context: {
                    triggerKind: 3,
                    isRetrigger: true,
                    activeSignatureHelp: {
                        signatures: [
                            {
                                label: 'f1(a : Int, b : Text) -> Int',
                                parameters: [
                                    { label: [3, 10] },
                                    { label: [11, 20] },
                                ],
                            },
                        ],
                        activeSignature: 0,
                        activeParameter: 0,
                    },
                },
            },
        );

        const expected = null;

        expect(signatureHelp).toEqual(expected);
    });

    test('update signature help after move to another function (move line down)', async () => {
        const signatureHelp = await client.sendRequest<SignatureHelp>(
            'textDocument/signatureHelp',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                // f2((1, "bar"), [1,2,3], {a = 1; b = "baz"});
                //             ^
                position: {
                    line: 5,
                    character: 20,
                },
                context: {
                    triggerKind: 3,
                    isRetrigger: true,
                    activeSignatureHelp: {
                        signatures: [
                            {
                                label: 'f1(a : Int, b : Text) -> Int',
                                parameters: [
                                    { label: [3, 10] },
                                    { label: [11, 20] },
                                ],
                            },
                        ],
                        activeSignature: 0,
                        activeParameter: 0,
                    },
                },
            },
        );

        const expected = {
            signatures: [
                {
                    label: 'f2(a : (Int, Text), b : [Int], c : {a : Int; b : Text}) -> ()',
                    parameters: [
                        { label: [3, 18] },
                        { label: [19, 29] },
                        { label: [30, 54] },
                    ],
                },
            ],
            activeSignature: 0,
            activeParameter: 0,
        };

        expect(signatureHelp).toEqual(expected);
    });

    test('ignore block comments and strings in signature', async () => {
        const signatureHelp = await client.sendRequest<SignatureHelp>(
            'textDocument/signatureHelp',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                // f1(/* first parameter */ 1, /* second parameter */ "f1(1, \"qwerty\")"); // f1(1, "qwerty");
                //                                                        ^
                position: {
                    line: 6,
                    character: 72,
                },
                context: {
                    triggerKind: 1,
                    isRetrigger: false,
                },
            },
        );

        const expected = {
            signatures: [
                {
                    label: 'f1(a : Int, b : Text) -> Int',
                    parameters: [{ label: [3, 10] }, { label: [11, 20] }],
                },
            ],
            activeSignature: 0,
            activeParameter: 1,
        };

        expect(signatureHelp).toEqual(expected);
    });

    test('ignore line comments', async () => {
        const signatureHelp = await client.sendRequest<SignatureHelp>(
            'textDocument/signatureHelp',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                // f1(/* first parameter */ 1, /* second parameter */ "f1(1, \"qwerty\")"); // f1(1, "qwerty");
                //                                                                                    ^
                position: {
                    line: 6,
                    character: 100,
                },
                context: {
                    triggerKind: 1,
                    isRetrigger: false,
                },
            },
        );

        const expected = null;

        expect(signatureHelp).toEqual(expected);
    });

    test('function call with generics as function argument #1', async () => {
        const signatureHelp = await client.sendRequest<SignatureHelp>(
            'textDocument/signatureHelp',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                // f1(f3</* integer(,*/ Int, /* text ,) */ Text>(1, "qwerty"), "qweqwe");
                //          ^
                position: {
                    line: 7,
                    character: 25,
                },
                context: {
                    triggerKind: 3,
                    isRetrigger: false,
                },
            },
        );

        const expected = {
            signatures: [
                {
                    label: 'f1(a : Int, b : Text) -> Int',
                    parameters: [{ label: [3, 10] }, { label: [11, 20] }],
                },
            ],
            activeSignature: 0,
            activeParameter: 0,
        };

        expect(signatureHelp).toEqual(expected);
    });

    test('function call with generics as function argument #2', async () => {
        const signatureHelp = await client.sendRequest<SignatureHelp>(
            'textDocument/signatureHelp',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                // f1(f3</* integer(,*/ Int, /* text ,) */ Text>(1, "qwerty"), "qweqwe");
                //                                               ^
                position: {
                    line: 7,
                    character: 62,
                },
                context: {
                    triggerKind: 3,
                    isRetrigger: false,
                },
            },
        );

        const expected = {
            signatures: [
                {
                    label: 'f3<A, B>(a : A, b : B) -> Int',
                    parameters: [{ label: [9, 14] }, { label: [15, 21] }],
                },
            ],
            activeSignature: 0,
            activeParameter: 0,
        };

        expect(signatureHelp).toEqual(expected);
    });

    test('function as function argument', async () => {
        const signatureHelp = await client.sendRequest<SignatureHelp>(
            'textDocument/signatureHelp',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                // f4(f1, 1, "");
                //     ^
                position: {
                    line: 8,
                    character: 12,
                },
                context: {
                    triggerKind: 3,
                    isRetrigger: false,
                },
            },
        );

        const expected = {
            signatures: [
                {
                    label: 'f4(f : (a : Int, b : Text) -> Int, a : Int, b : Text) -> ()',
                    parameters: [
                        { label: [3, 33] },
                        { label: [34, 42] },
                        { label: [43, 52] },
                    ],
                },
            ],
            activeSignature: 0,
            activeParameter: 0,
        };

        expect(signatureHelp).toEqual(expected);
    });

    test('incomplete signature', async () => {
        const signatureHelp = await client.sendRequest<SignatureHelp>(
            'textDocument/signatureHelp',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                // f2(
                //    ^
                position: {
                    line: 9,
                    character: 11,
                },
                context: {
                    triggerKind: 2,
                    isRetrigger: false,
                },
            },
        );

        const expected = {
            signatures: [
                {
                    label: 'f2(a : (Int, Text), b : [Int], c : {a : Int; b : Text}) -> ()',
                    parameters: [
                        { label: [3, 18] },
                        { label: [19, 29] },
                        { label: [30, 54] },
                    ],
                },
            ],
            activeSignature: 0,
            activeParameter: 0,
        };

        expect(signatureHelp).toEqual(expected);
    });

    test('library function with incomplete signature', async () => {
        const signatureHelp = await client.sendRequest<SignatureHelp>(
            'textDocument/signatureHelp',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                // Lib.ff(
                //        ^
                position: {
                    line: 10,
                    character: 15,
                },
                context: {
                    triggerKind: 2,
                    isRetrigger: false,
                },
            },
        );

        const expected = {
            signatures: [
                {
                    label: 'ff(i : Int, t : Text) -> ()',
                    parameters: [{ label: [3, 10] }, { label: [11, 20] }],
                },
            ],
            activeSignature: 0,
            activeParameter: 0,
        };

        expect(signatureHelp).toEqual(expected);
    });
});
