/* eslint-disable jest/expect-expect */
import { URI } from 'vscode-uri';
import { join } from 'node:path';
import { cwd } from 'node:process';
import {
    TextDocument,
    defaultBeforeAll,
    defaultAfterAll,
    openTextDocuments,
} from './helpers';
import { Connection, Location, Position, Range } from 'vscode-languageserver';

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

type LocationWithMetadata = {
    location: Location;
    isDefinition: boolean;
};

jest.setTimeout(60000);

describe('references', () => {
    let client: Connection;
    let server: Connection;

    const rootUri = URI.parse(join(cwd(), 'test', 'definition'));

    function location(
        path: string,
        line: number,
        startCharacter: number,
        endCharacter: number,
        isDefinition = true,
    ): LocationWithMetadata {
        const location = Location.create(
            URI.parse(join(rootUri.fsPath, path)).toString(),
            Range.create(
                Position.create(line, startCharacter),
                Position.create(line, endCharacter),
            ),
        );
        return { location, isDefinition };
    }

    const textDocuments = new Map<string, TextDocument>();

    async function testReferences(
        expected: LocationWithMetadata[],
    ): Promise<void> {
        // Open all files that we plan to test. This is to avoid opening and
        // reading documents multiple times.
        await openTextDocuments(
            client,
            textDocuments,
            rootUri,
            expected.map((l) => l.location.uri),
        );
        // Test that finding all references from every expected reference will
        // be equal.
        await Promise.all(
            expected.map(async (loc) => {
                const textDocument = textDocuments.get(loc.location.uri);
                for (const includeDeclaration of [false, true]) {
                    const locations = await client.sendRequest<Location[]>(
                        'textDocument/references',
                        {
                            textDocument,
                            position: loc.location.range.start,
                            context: { includeDeclaration },
                        },
                    );
                    const expected2 = includeDeclaration
                        ? expected
                        : expected.filter((l) => !l.isDefinition);
                    expect(locations.sort(compareLocations)).toStrictEqual(
                        expected2.map((l) => l.location).sort(compareLocations),
                    );
                }
            }),
        );
    }

    beforeAll(async () => {
        [client, server] = await defaultBeforeAll(rootUri, true);
    });

    afterAll(async () => {
        await defaultAfterAll(client, server);
    });

    test('Can find all references from definition', () =>
        testReferences([
            location('B.mo', 3, 25, 30, false), // C.other
            location('C.mo', 2, 15, 20, true), // definition of other
        ]));

    test('Can find all references in nested path', () =>
        testReferences([
            location('A.mo', 6, 30, 35, false), // C.Inner.inner
            location('B.mo', 10, 31, 36, false), // C.Inner.inner
            location('C.mo', 8, 19, 24, true), // definition of inner
        ]));

    test('Can find all references of nested path', () =>
        testReferences([
            location('A.mo', 6, 24, 29, false), // C.Inner
            location('B.mo', 10, 25, 30, false), // C.Inner
            location('C.mo', 7, 18, 23, true), // definition of Inner (lab)
        ]));

    test('Can find all function references', () =>
        testReferences([
            location('B.mo', 5, 17, 20, false), // C.inc
            location('C.mo', 3, 16, 19, true), // definition of inc (lab)
        ]));

    test('Can find all object method references', () =>
        testReferences([
            location('A.mo', 6, 17, 21, false), // a.meth
            location('B.mo', 9, 20, 24, true), // definition of meth
        ]));

    test('Can find all references of circular chain', () => {
        const refs = [12, 14, 16, 18, 20, 22].map(
            (column) => location('circular.mo', 5, column, column + 1, false), // /\.o\.?/
        );
        return testReferences([
            ...refs,
            location('circular.mo', 2, 19, 20, true), // definition of o
        ]);
    }, 20000);

    test('Can find all references of method (subtype and supertype)', () =>
        testReferences([
            location('sub.mo', 15, 6, 10, false), // c.meth
            location('sub.mo', 2, 16, 20, true), // definition of Class1.meth
            location('sub.mo', 8, 16, 20, true), // definition of Class2.meth
        ]));

    test('Can find all references of record (type definition)', () =>
        testReferences([
            location('record.mo', 1, 17, 20, true), // type definition of bar (type Foo)
            location('record.mo', 4, 26, 29, true), // expression definition of bar (field assignment)
            location('record.mo', 5, 12, 15, false), // bar in foo.bar (test1)
        ]));

    test('Can find all references of record (annotation expression)', () =>
        testReferences([
            location('record.mo', 9, 20, 23, true), // type definition of bar (expression type annotation)
            location('record.mo', 9, 36, 39, true), // expression definition of bar (field assignment)
            location('record.mo', 10, 12, 15, false), // bar in foo.bar (test2)
        ]));

    test('Can find all references of record (switch/case)', () =>
        testReferences([
            location('record.mo', 14, 18, 21, true), // expression definition of bar (field assignment)
            location('record.mo', 15, 26, 29, true), // type definition of bar (pattern type annotation)
            location('record.mo', 15, 43, 46, false), // bar in foo.bar (test3)
        ]));
});
