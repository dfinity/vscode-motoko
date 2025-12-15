/* eslint-disable jest/expect-expect */
import { URI } from 'vscode-uri';
import { join } from 'node:path';
import { cwd } from 'node:process';
import {
    Connection,
    Location,
    Position,
    Range,
    TextEdit,
    WorkspaceEdit,
} from 'vscode-languageserver';
import {
    TextDocument,
    defaultBeforeAll,
    defaultAfterAll,
    openTextDocuments,
} from './helpers';
import { compareRanges } from '../utils';

const rootPath = join(cwd(), 'test', 'rename');
const rootUri = URI.parse(rootPath);
jest.setTimeout(60000);

function range(
    line: number,
    startCharacter: number,
    endCharacter: number,
): Range {
    return Range.create(
        Position.create(line, startCharacter),
        Position.create(line, endCharacter),
    );
}

function location(
    path: string,
    line: number,
    startCharacter: number,
    endCharacter: number,
): Location {
    return Location.create(
        URI.parse(join(rootPath, path)).toString(),
        range(line, startCharacter, endCharacter),
    );
}

describe('prepare rename', () => {
    let client: Connection;
    let server: Connection;

    const textDocuments = new Map<string, TextDocument>();

    async function testPrepareRename(
        reference: Location,
        isValid: boolean,
    ): Promise<void> {
        await openTextDocuments(client, textDocuments, rootUri, [
            reference.uri,
        ]);
        const textDocument = textDocuments.get(reference.uri);
        const range = await client.sendRequest<Range | null>(
            'textDocument/prepareRename',
            {
                textDocument,
                position: reference.range.start,
            },
        );
        if (isValid) {
            expect(range).toStrictEqual(reference.range);
        } else {
            expect(range).toBeNull();
        }
    }

    beforeAll(
        async () =>
            ([client, server] = await defaultBeforeAll(rootUri, true, {
                useDefaultMocJs: true,
            })),
    );
    afterAll(async () => await defaultAfterAll(client, server));

    test('Can prepare rename value', () =>
        testPrepareRename(
            location('prepare_rename.mo', 6, 8, 13), // value
            true,
        ));

    test('Can prepare rename function', () =>
        testPrepareRename(
            location('prepare_rename.mo', 5, 5, 10), // _func
            true,
        ));

    test('Can prepare rename type', () =>
        testPrepareRename(
            location('prepare_rename.mo', 6, 16, 22), // record
            true,
        ));

    test('Can prepare rename internally imported function', () =>
        testPrepareRename(
            location('prepare_rename.mo', 6, 44, 56), // reference_me
            true,
        ));

    test('Can not prepare rename "type" keyword', () =>
        testPrepareRename(
            location('prepare_rename.mo', 3, 0, 4), // type
            false,
        ));

    test('Can not prepare rename number', () =>
        testPrepareRename(
            location('import_me.mo', 3, 8, 10), // 42
            false,
        ));

    test('Can not prepare rename "Nat" type keyword', () =>
        testPrepareRename(
            location('prepare_rename.mo', 5, 15, 18), // Nat
            false,
        ));

    // We don't write a corresponding rename test for this because prepare
    // rename is the responsible to check the validity of the rename, not the
    // rename request itself. Rename would happily rename this function, so
    // there is no sense in testing this.
    test('Can not prepare rename externally imported function', () =>
        testPrepareRename(
            location('prepare_rename.mo', 10, 39, 42), // new
            false,
        ));
});

describe('rename', () => {
    let client: Connection;
    let server: Connection;

    const textDocuments = new Map<string, TextDocument>();

    async function testRename(expected: {
        [uri: string]: Range[];
    }): Promise<void> {
        // Open all files that we plan to test. This is to avoid opening and
        // reading documents multiple times.
        await openTextDocuments(
            client,
            textDocuments,
            rootUri,
            Object.keys(expected),
        );

        const newName = 'renamed';
        const expectedEdits: { [uri: string]: TextEdit[] } = {};
        Object.entries(expected).forEach(([filename, ranges]) => {
            const uri = URI.parse(join(rootPath, filename)).toString();
            expectedEdits[uri] = ranges.sort(compareRanges).map((range) => ({
                newText: newName,
                range,
            }));
        });

        // Test that renaming from every expected reference will be equal.
        for (const [uri, ranges] of Object.entries(expected)) {
            const textDocument = textDocuments.get(uri);
            for (const range of ranges) {
                const workspaceEdit = await client.sendRequest<WorkspaceEdit>(
                    'textDocument/rename',
                    {
                        textDocument,
                        position: range.start,
                        newName,
                    },
                );

                expect(workspaceEdit).toStrictEqual({
                    changes: expectedEdits,
                });
            }
        }
    }

    async function testRenameNegative(
        uri: string,
        range: Range,
    ): Promise<void> {
        await openTextDocuments(client, textDocuments, rootUri, [uri]);
        const textDocument = textDocuments.get(uri);
        const workspaceEdit = await client.sendRequest<WorkspaceEdit>(
            'textDocument/rename',
            {
                textDocument,
                position: range.start,
                newName: 'renamed',
            },
        );
        expect(workspaceEdit).toStrictEqual({
            changes: {},
        });
    }

    beforeAll(
        async () =>
            ([client, server] = await defaultBeforeAll(rootUri, true, {
                useDefaultMocJs: true,
            })),
    );
    afterAll(async () => await defaultAfterAll(client, server));

    test('Can rename all references from definition', () =>
        testRename({
            'B.mo': [range(3, 25, 30)], // C.other
            'C.mo': [range(2, 15, 20)], // definition of other
        }));

    test('Can rename all references in nested path', () =>
        testRename({
            'A.mo': [range(6, 30, 35)], // C.Inner.inner
            'B.mo': [range(10, 31, 36)], // C.Inner.inner
            'C.mo': [range(8, 19, 24)], // definition of inner
        }));

    test('Can rename all references of nested path', () =>
        testRename({
            'A.mo': [range(6, 24, 29)], // C.Inner
            'B.mo': [range(10, 25, 30)], // C.Inner
            'C.mo': [range(7, 18, 23)], // definition of Inner (lab)
        }));

    test('Can rename all function references', () =>
        testRename({
            'B.mo': [range(5, 17, 20)], // C.inc
            'C.mo': [range(3, 16, 19)], // definition of inc (lab)
        }));

    test('Can rename all object method references', () =>
        testRename({
            'A.mo': [range(6, 17, 21)], // a.meth
            'B.mo': [range(9, 20, 24)], // definition of meth
        }));

    test('Can rename all references of circular chain', () => {
        const refs = [12, 14, 16, 18, 20, 22].map(
            (column) => range(5, column, column + 1), // /\.o\.?/
        );
        refs.push(range(2, 19, 20)); // definition of o
        return testRename({
            'circular.mo': refs,
        });
    }, 20000);

    test('Can rename all references of method (subtype and supertype)', () =>
        testRename({
            'sub.mo': [
                range(15, 6, 10), // c.meth
                range(2, 16, 20), // definition of Class1.meth
                range(8, 16, 20), // definition of Class2.meth
            ],
        }));

    test('Can rename all references of type', () =>
        testRename({
            'record.mo': [
                range(1, 9, 12), // definition of Foo
                range(4, 18, 21), // Foo in annotation
            ],
        }));

    test('Can rename all references of record (type definition)', () =>
        testRename({
            'record.mo': [
                range(1, 17, 20), // type definition of bar (type Foo)
                range(4, 26, 29), // expression definition of bar (field assignment)
                range(5, 12, 15), // bar in foo.bar (test1)
            ],
        }));

    test('Can rename all references of record (annotation expression)', () =>
        testRename({
            'record.mo': [
                range(9, 20, 23), // type definition of bar (expression type annotation)
                range(9, 36, 39), // expression definition of bar (field assignment)
                range(10, 12, 15), // bar in foo.bar (test2)
            ],
        }));

    test('Can rename all references of record (switch/case)', () =>
        testRename({
            'record.mo': [
                range(14, 18, 21), // expression definition of bar (field assignment)
                range(15, 26, 29), // type definition of bar (pattern type annotation)
                range(15, 43, 46), // bar in foo.bar (test3)
            ],
        }));

    test('Can rename value', () =>
        testRename({
            'prepare_rename.mo': [
                range(6, 8, 13), // definition of value
                range(7, 4, 9), // value in value.field
            ],
        }));

    test('Can rename function', () =>
        testRename({
            'prepare_rename.mo': [range(5, 5, 10)], // _test
        }));

    test('Can rename type', () =>
        testRename({
            'prepare_rename.mo': [
                range(3, 5, 11), // definition of record
                range(6, 16, 22), // record in annotation
            ],
        }));

    test('Can rename internally imported function', () =>
        testRename({
            'import_me.mo': [range(1, 16, 28)], // definition of reference_me
            'prepare_rename.mo': [range(6, 44, 56)], // call of reference_me
        }));

    test('Can not rename "type" keyword', () =>
        testRenameNegative('prepare_rename.mo', range(3, 0, 4))); // type

    test('Can not rename number', () =>
        testRenameNegative('import_me.mo', range(3, 8, 10))); // 42

    test('Can not rename "Nat" type keyword', () =>
        testRenameNegative('prepare_rename.mo', range(5, 15, 18))); // Nat
});
