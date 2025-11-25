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

const rootPath = join(cwd(), 'test', 'definition');
const rootUri = URI.parse(rootPath);
const vectorPath = join('.mops', 'vector@0.4.1', 'src', 'lib.mo');
const arrayPath = join('.mops', 'base@0.13.4', 'src', 'Array.mo');

jest.setTimeout(60000);

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

describe('go to definition', () => {
    let client: Connection;
    let server: Connection;

    const textDocuments = new Map<string, TextDocument>();

    async function testDefinition(
        reference: Location,
        expected: Location[],
    ): Promise<void> {
        await openTextDocuments(client, textDocuments, rootUri, [
            reference.uri,
        ]);
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

    async function testDefinitionSimple({
        pos,
        declPos,
    }: {
        pos: Position;
        declPos: Location;
    }): Promise<void> {
        const filePath = join(rootPath, 'simple.mo');
        const fileUri = URI.parse(filePath).toString();
        await openTextDocuments(client, textDocuments, rootUri, [fileUri]);
        const textDocument = textDocuments.get(fileUri);
        const response = await client.sendRequest('textDocument/definition', {
            textDocument,
            position: pos,
        });
        expect(response).toStrictEqual([declPos]);
    }

    beforeAll(async () => {
        [client, server] = await defaultBeforeAll(rootUri, true);
    });

    afterAll(async () => {
        await defaultAfterAll(client, server);
    });

    // module {
    //^^
    const baseArrayModuleDelcPos = location(arrayPath, 19, 0, 0);
    test.each([
        // Jump from:
        // let b : [var Int] = Array.init();
        // 1)                 ^^
        // 2)                  ^^
        // 3)                      ^^
        { pos: { line: 5, character: 24 }, declPos: baseArrayModuleDelcPos },
        { pos: { line: 5, character: 25 }, declPos: baseArrayModuleDelcPos },
        { pos: { line: 5, character: 29 }, declPos: baseArrayModuleDelcPos },
    ])('base:Array-%#', testDefinitionSimple);

    // public func init<X>(...
    //            ^^
    const baseArrayInitDelcPos = location(arrayPath, 28, 14, 18);
    test.each([
        // Jump from:
        // let b : [var Int] = Array.init();
        // 1)                       ^^
        // 2)                        ^^
        // 3)                           ^^
        { pos: { line: 5, character: 30 }, declPos: baseArrayInitDelcPos },
        { pos: { line: 5, character: 31 }, declPos: baseArrayInitDelcPos },
        { pos: { line: 5, character: 34 }, declPos: baseArrayInitDelcPos },
    ])('base:Array.init-%#', testDefinitionSimple);

    // module {
    //^^
    const vectorModuleDeclPos = location(vectorPath, 19, 0, 0);
    test.each([
        // Jump from:
        // let a : Vector.Vector<Int> = Vector.new();
        // 1)     ^^
        // 2)      ^^
        // 3)           ^^
        // 4)                          ^^
        // 5)                           ^^
        // 6)                                ^^
        { pos: { line: 4, character: 12 }, declPos: vectorModuleDeclPos },
        { pos: { line: 4, character: 13 }, declPos: vectorModuleDeclPos },
        { pos: { line: 4, character: 18 }, declPos: vectorModuleDeclPos },
        { pos: { line: 4, character: 33 }, declPos: vectorModuleDeclPos },
        { pos: { line: 4, character: 34 }, declPos: vectorModuleDeclPos },
        { pos: { line: 4, character: 39 }, declPos: vectorModuleDeclPos },
    ])('vector:Vector-%#', testDefinitionSimple);

    // public type Vector<X> = {
    //            ^^
    const vectorTypeDeclPos = location(vectorPath, 27, 14, 20);
    test.each([
        // Jump from:
        // let a : Vector.Vector<Int> = Vector.new();
        // 1)            ^^
        // 2)             ^^
        // 3)                  ^^
        // 4)                       ^^
        { pos: { line: 4, character: 19 }, declPos: vectorTypeDeclPos },
        { pos: { line: 4, character: 20 }, declPos: vectorTypeDeclPos },
        { pos: { line: 4, character: 25 }, declPos: vectorTypeDeclPos },
        { pos: { line: 4, character: 30 }, declPos: vectorTypeDeclPos },
    ])('vector:Vector.Vector-%#', testDefinitionSimple);

    test.each([
        // Jump from:
        // let c : Vector
        //        .Vector<Int> = Vector.new();
        { pos: { line: 6, character: 12 }, declPos: vectorModuleDeclPos },
        { pos: { line: 6, character: 13 }, declPos: vectorModuleDeclPos },
        { pos: { line: 6, character: 18 }, declPos: vectorModuleDeclPos },
        { pos: { line: 7, character: 12 }, declPos: vectorTypeDeclPos },
        { pos: { line: 7, character: 13 }, declPos: vectorTypeDeclPos },
        { pos: { line: 7, character: 18 }, declPos: vectorTypeDeclPos },
    ])('multiline-%#', testDefinitionSimple);

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

    test('Can find definition for var', () =>
        testDefinition(
            location('var.mo', 4, 8, 9), // x
            [location('var.mo', 1, 8, 9)], // definition of x
        ));

    test('Can find definition of type from definition', () =>
        testDefinition(
            location('record.mo', 1, 9, 12), // definition of Foo
            [location('record.mo', 1, 9, 12)], // definition of Foo
        ));

    test('Can find definition of type from reference', () =>
        testDefinition(
            location('record.mo', 4, 18, 21), // Foo in annotation
            [location('record.mo', 1, 9, 12)], // definition of Foo
        ));

    test('Can find field from record type definition', () =>
        testDefinition(
            location('record.mo', 5, 12, 15), // bar in foo.bar (test1)
            [
                location('record.mo', 1, 17, 20), // type definition of bar (type Foo)
                location('record.mo', 4, 26, 29), // expression definition of bar (field assignment)
            ],
        ));

    test('Can find field from record expression definition', () =>
        testDefinition(
            location('record.mo', 4, 26, 29), // bar in { bar = 42 } (test1)
            [
                location('record.mo', 1, 17, 20), // type definition of bar (type Foo)
                location('record.mo', 4, 26, 29), // expression definition of bar (field assignment)
            ],
        ));

    test('Can find field from record type expression annotation', () =>
        testDefinition(
            location('record.mo', 10, 12, 15), // bar in foo.bar (test2)
            [
                location('record.mo', 9, 20, 23), // type definition of bar (expression type annotation)
                location('record.mo', 9, 36, 39), // expression definition of bar (field assignment)
            ],
        ));

    test('Can find field from record type pattern annotation', () =>
        testDefinition(
            location('record.mo', 15, 43, 46), // bar in foo.bar (test3)
            [
                location('record.mo', 14, 18, 21), // expression definition of bar (field assignment)
                location('record.mo', 15, 26, 29), // type definition of bar (pattern type annotation)
            ],
        ));
});
