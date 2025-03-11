/* eslint-disable jest/expect-expect */
import { URI } from 'vscode-uri';
import { basename, join } from 'node:path';
import { TextDocument, makeTextDocument, wait } from './test/helpers';
import { Connection, Location, Position, Range } from 'vscode-languageserver';
import { clientInitParams, setupClientServer } from './test/mock';

describe('references', () => {
    let client: Connection;

    const rootUri = URI.parse(
        join(__dirname, '..', '..', 'test', 'references'),
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

    async function testReferences(expected: Location[]): Promise<void> {
        // Open all files that we plan to test. This is to avoid opening and
        // reading documents multiple times.
        const textDocuments = new Map<string, TextDocument>();
        await Promise.all(
            expected.map(async (loc) => {
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
        await Promise.all(
            expected.map(async (loc) => {
                const textDocument = textDocuments.get(loc.uri);
                const locations = await client.sendRequest<Location[]>(
                    'textDocument/references',
                    {
                        textDocument,
                        position: loc.range.start,
                        context: { includeDeclaration: true },
                    },
                );
                expect(locations).toStrictEqual(expected);
            }),
        );
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

    test('Can find all references from definition', () =>
        testReferences([
            location('B.mo', 3, 25, 30), // C.other
            location('C.mo', 2, 15, 20), // definition of other
        ]));

    test('Can find all references in nested path', () =>
        testReferences([
            location('A.mo', 6, 30, 35), // C.Inner.inner
            location('B.mo', 10, 31, 36), // C.Inner.inner
            location('C.mo', 8, 19, 24), // definition of inner
        ]));

    test('Can find all references of nested path', () =>
        testReferences([
            location('A.mo', 6, 24, 29), // C.Inner
            location('B.mo', 10, 25, 30), // C.Inner
            location('C.mo', 7, 11, 11), // definition of Inner
        ]));

    test('Can find all function references', () =>
        testReferences([
            location('B.mo', 5, 17, 20), // C.inc
            location('C.mo', 3, 11, 11), // definition of inc
        ]));

    test('Can find all object method references', () =>
        testReferences([
            location('A.mo', 6, 17, 21), // a.meth
            location('B.mo', 9, 20, 20), // definition of meth
        ]));
});
