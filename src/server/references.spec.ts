/* eslint-disable jest/expect-expect */
import { URI } from 'vscode-uri';
import { basename, join } from 'node:path';
import { TextDocument, makeTextDocument, wait } from './test/helpers';
import { Connection, Location, Position, Range } from 'vscode-languageserver';
import { clientInitParams, setupClientServer } from './test/mock';

function compareLocations(a: Location, b: Location): number {
    if (a.uri < b.uri) return -1;
    if (a.uri > b.uri) return 1;

    if (a.range.start.line !== b.range.start.line) {
        return a.range.start.line - b.range.start.line;
    }

    if (a.range.start.character !== b.range.start.character) {
        return a.range.start.character - b.range.start.character;
    }

    if (a.range.end.line !== b.range.end.line) {
        return a.range.end.line - b.range.end.line;
    }

    return a.range.end.character - b.range.end.character;
}

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

    // Note: the definition is expected to be the last element.
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
                for (const includeDeclaration of [false, true]) {
                    const locations = await client.sendRequest<Location[]>(
                        'textDocument/references',
                        {
                            textDocument,
                            position: loc.range.start,
                            context: { includeDeclaration },
                        },
                    );
                    if (includeDeclaration) {
                        expect(locations.sort(compareLocations)).toStrictEqual(
                            expected.sort(compareLocations),
                        );
                    } else {
                        // Remove the last element (expected to be the
                        // definition).
                        expect(locations.sort(compareLocations)).toStrictEqual(
                            expected.slice(0, -1).sort(compareLocations),
                        );
                    }
                }
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
        await wait(2); // wait for shutdown
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
            location('C.mo', 7, 18, 23), // definition of Inner (lab)
        ]));

    test('Can find all function references', () =>
        testReferences([
            location('B.mo', 5, 17, 20), // C.inc
            location('C.mo', 3, 16, 19), // definition of inc (lab)
        ]));

    test('Can find all object method references', () =>
        testReferences([
            location('A.mo', 6, 17, 21), // a.meth
            location('B.mo', 9, 20, 24), // definition of meth
        ]));

    test('Can find all references of circular chain', () => {
        const refs = [12, 14, 16, 18, 20, 22].map(
            (column) => location('circular.mo', 5, column, column + 1), // /\.o\.?/
        );
        return testReferences([
            ...refs,
            location('circular.mo', 2, 19, 20), // definition of o
        ]);
    }, 20000);
});
