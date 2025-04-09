/* eslint-disable jest/expect-expect */
import { URI } from 'vscode-uri';
import { basename, join } from 'node:path';
import { TextDocument, makeTextDocument, wait } from './test/helpers';
import { Connection, Location, Position, Range } from 'vscode-languageserver';
import { clientInitParams, setupClientServer } from './test/mock';

describe('definitions', () => {
    let client: Connection;

    const rootUri = URI.parse(
        join(__dirname, '..', '..', 'test', 'definitions'),
    );

    function location(
        path: string,
        line: number,
        startCharacter: number,
        endCharacter: number,
    ): Location {
        return Location.create(
            URI.parse(join(rootUri.fsPath, path)).toString(),
            Range.create(
                Position.create(line, startCharacter),
                Position.create(line, endCharacter),
            ),
        );
    }

    async function testDefinition(
        reference: Location,
        expected: Location[],
    ): Promise<void> {
        // Open all files that we plan to test. This is to avoid opening and
        // reading documents multiple times.
        const textDocuments = new Map<string, TextDocument>();
        await Promise.all(
            [reference, ...expected].map(async (loc) => {
                const uri = loc.uri;
                if (!textDocuments.has(uri)) {
                    const textDocument = makeTextDocument(
                        rootUri,
                        basename(uri),
                    );
                    await client.sendNotification('textDocument/didOpen', {
                        textDocument,
                    });
                    textDocuments.set(uri, textDocument);
                }
            }),
        );
        // Wait for everything to open.
        await wait(1);
        // Test that finding all references from every expected reference will
        // be equal.
        const textDocument = textDocuments.get(reference.uri);
        const locations = await client.sendRequest<Location[]>(
            'textDocument/definition',
            {
                textDocument,
                position: reference.range.start,
            },
        );
        expect(locations).toStrictEqual(expected);
    }

    beforeAll(async () => {
        // We don't care about having server state between reference tests.
        client = setupClientServer(true)[0];
        await client.sendRequest('initialize', clientInitParams(rootUri));
        await client.sendNotification('initialized');
        await wait(1); // wait for initialization
    });

    afterAll(async () => {
        await client.sendRequest('shutdown');
        await wait(1); // wait for shutdown
    });

    test('Can find object method definition', () =>
        testDefinition(
            location('A.mo', 6, 17, 21), // a.meth
            [location('B.mo', 9, 20, 24)], // definition of meth
        ));

    test('Definition of value points to itself', () =>
        testDefinition(
            location('chain.mo', 7, 27, 28), // definition of x
            [location('chain.mo', 7, 27, 28)], // definition of x
        ));

    test('Can find nested value definition', () =>
        testDefinition(
            location('chain.mo', 12, 31, 32), // x in a.b.c.x
            [location('chain.mo', 7, 27, 28)], // definition of x
        ));

    test('Can find nested object definition (left)', () =>
        testDefinition(
            location('chain.mo', 12, 25, 26), // a in a.b.c.x
            [location('chain.mo', 2, 18, 19)], // definition of a
        ));

    test('Can find nested object definition (middle)', () =>
        testDefinition(
            location('chain.mo', 12, 27, 28), // b in a.b.c.x
            [location('chain.mo', 4, 22, 23)], // definition of b
        ));

    test('Can find nested object definition (right)', () =>
        testDefinition(
            location('chain.mo', 12, 29, 30), // c in a.b.c.x
            [location('chain.mo', 6, 26, 27)], // definition of c
        ));

    test('Can find circular object definition', async () => {
        await testDefinition(
            location('circular.mo', 2, 19, 20), // definition of o
            [location('circular.mo', 2, 19, 20)], // definition of o
        );
        for (const column of [12, 14, 16, 18, 20, 22]) {
            await testDefinition(
                location('circular.mo', 5, column, column + 1), // /\.o\.?/
                [location('circular.mo', 2, 19, 20)], // definition of o
            );
        }
    }, 20000);
});
