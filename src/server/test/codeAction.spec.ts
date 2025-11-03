import {
    Connection,
    InitializeResult,
    CodeAction,
} from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import { clientInitParams, setupClientServer } from './mock';
import { cwd } from 'node:process';
import { wait, waitForNotification } from './helpers';
import { readFileSync } from 'node:fs';

jest.setTimeout(60000);

describe('code actions', () => {
    let client: Connection;
    let server: Connection;

    const filePath = `${cwd()}/test/codeActions`;
    const rootUri = URI.file(filePath);
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

        await wait(0.5);
    });
    afterAll(async () => {
        await client.sendRequest('shutdown');
        await wait(2);
        client.dispose();
        server.dispose();
    });

    test('organize imports', async () => {
        const text = readFileSync(
            `${filePath}/organizeImports/main.mo`,
            'utf-8',
        );

        const file = {
            uri: `${rootUri}/organizeImports/main.mo`,
            textDocument: {
                uri: `${rootUri}/organizeImports/main.mo`,
                languageId: 'motoko',
                version: 1,
                text: text,
            },
        };

        await client.sendNotification('textDocument/didOpen', {
            textDocument: file.textDocument,
        });

        const codeActions = await client.sendRequest<CodeAction[]>(
            'textDocument/codeAction',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                range: {
                    start: {
                        line: 0,
                        character: 0,
                    },
                    end: {
                        line: 5,
                        character: 17,
                    },
                },
                context: {
                    diagnostics: [
                        {
                            range: {
                                start: {
                                    line: 2,
                                    character: 7,
                                },
                                end: {
                                    line: 2,
                                    character: 11,
                                },
                            },
                            message:
                                'unused identifier Blob (delete or rename to wildcard `_` or `_Blob`)',
                            code: 'M0194',
                            severity: 2,
                            source: 'Motoko',
                        },
                    ],
                    only: ['source'],
                    triggerKind: 1,
                },
            },
        );

        const expected = [
            {
                title: 'Organize imports',
                kind: 'source.organizeImports',
                isPreferred: true,
                edit: {
                    changes: {
                        [file.uri]: [
                            {
                                range: {
                                    start: {
                                        line: 0,
                                        character: 0,
                                    },
                                    end: {
                                        line: 6,
                                        character: 0,
                                    },
                                },
                                newText:
                                    'import Blob "mo:base/Blob";\nimport Int "mo:base/Int";\nimport Text "mo:base/Text";\n\nimport Lib "lib";\nimport Lib1 "lib1";\n',
                            },
                        ],
                    },
                },
            },
        ];

        expect(codeActions).toEqual(expected);
    });

    test('quick fix standard library import', async () => {
        const text = readFileSync(`${filePath}/quickFixImport/lib.mo`, 'utf-8');

        const file = {
            uri: `${rootUri}/quickFixImport/lib.mo`,
            textDocument: {
                uri: `${rootUri}/quickFixImport/lib.mo`,
                languageId: 'motoko',
                version: 1,
                text: text,
            },
        };

        await client.sendNotification('textDocument/didOpen', {
            textDocument: file.textDocument,
        });

        const codeActions = await client.sendRequest<CodeAction[]>(
            'textDocument/codeAction',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                range: {
                    start: {
                        line: 3,
                        character: 15,
                    },
                    end: {
                        line: 3,
                        character: 18,
                    },
                },
                context: {
                    diagnostics: [
                        {
                            range: {
                                start: {
                                    line: 3,
                                    character: 15,
                                },
                                end: {
                                    line: 3,
                                    character: 18,
                                },
                            },
                            message: 'unbound variable Int',
                            code: 'M0057',
                            severity: 1,
                            source: 'Motoko',
                        },
                    ],
                    only: ['quickfix'],
                    triggerKind: 1,
                },
            },
        );

        const expected = {
            title: 'Import "mo:base/Int"',
            kind: 'quickfix',
            isPreferred: true,
            diagnostics: [
                {
                    range: {
                        start: {
                            line: 3,
                            character: 15,
                        },
                        end: {
                            line: 3,
                            character: 18,
                        },
                    },
                    message: 'unbound variable Int',
                    code: 'M0057',
                    severity: 1,
                    source: 'Motoko',
                },
            ],
            edit: {
                changes: {
                    [`${file.uri}`]: [
                        {
                            range: {
                                start: {
                                    line: 0,
                                    character: 0,
                                },
                                end: {
                                    line: 0,
                                    character: 0,
                                },
                            },
                            newText: 'import Int "mo:base/Int";\n',
                        },
                    ],
                },
            },
        };
        expect(codeActions).toContainEqual(expected);
    });

    test('quick fix custom library import', async () => {
        const text = readFileSync(
            `${filePath}/quickFixImport/main.mo`,
            'utf-8',
        );

        const file = {
            uri: `${rootUri}/quickFixImport/main.mo`,
            textDocument: {
                uri: `${rootUri}/quickFixImport/main.mo`,
                languageId: 'motoko',
                version: 1,
                text: text,
            },
        };

        await client.sendNotification('textDocument/didOpen', {
            textDocument: file.textDocument,
        });

        const codeActions = await client.sendRequest<CodeAction[]>(
            'textDocument/codeAction',
            {
                textDocument: {
                    uri: `${file.uri}`,
                },
                range: {
                    start: {
                        line: 4,
                        character: 10,
                    },
                    end: {
                        line: 4,
                        character: 13,
                    },
                },
                context: {
                    diagnostics: [
                        {
                            range: {
                                start: {
                                    line: 4,
                                    character: 10,
                                },
                                end: {
                                    line: 4,
                                    character: 13,
                                },
                            },
                            message: 'unbound variable Lib',
                            code: 'M0057',
                            severity: 1,
                            source: 'Motoko',
                        },
                    ],
                    only: ['quickfix'],
                    triggerKind: 1,
                },
            },
        );

        const expected = {
            title: 'Import "lib"',
            kind: 'quickfix',
            isPreferred: true,
            diagnostics: [
                {
                    range: {
                        start: {
                            line: 4,
                            character: 10,
                        },
                        end: {
                            line: 4,
                            character: 13,
                        },
                    },
                    message: 'unbound variable Lib',
                    code: 'M0057',
                    severity: 1,
                    source: 'Motoko',
                },
            ],
            edit: {
                changes: {
                    [`${file.uri}`]: [
                        {
                            range: {
                                start: {
                                    line: 2,
                                    character: 0,
                                },
                                end: {
                                    line: 2,
                                    character: 0,
                                },
                            },
                            newText: 'import Lib "lib";\n',
                        },
                    ],
                },
            },
        };
        expect(codeActions).toContainEqual(expected);
    });
});
