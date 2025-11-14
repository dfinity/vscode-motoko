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
        URI.parse(join(rootUri.fsPath, path)).toString(),
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

    beforeAll(async () => {
        [client, server] = await defaultBeforeAll(rootUri, true);
    });

    afterAll(async () => {
        await defaultAfterAll(client, server);
    });

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

    test('Can not prepare rename externally imported function', () =>
        testPrepareRename(
            location('prepare_rename.mo', 10, 39, 42), // new
            false,
        ));
});
