/* eslint-disable jest/expect-expect */

jest.mock('ic-mops/commands/add');
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { Connection, InitializeResult } from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import { wait, waitForNotification } from './helpers';
import { clientInitParams, setupClientServer } from './mock';

const rootPath = `${cwd()}/test/definition`;
const rootUri = URI.file(rootPath);
const filePath = join(rootPath, 'a.mo');
const fileUri = URI.file(filePath);
const file = {
    uri: `${fileUri}`,
    textDocument: {
        uri: `${fileUri}`,
        languageId: 'motoko',
        version: 1,
        text: readFileSync(filePath, 'utf-8'),
    },
};
const vectorUri = URI.file(
    join(rootPath, '.mops', 'vector@0.4.1', 'src/lib.mo'),
);
const arrayUri = URI.file(
    join(rootPath, '.mops', 'base@0.13.4', 'src/Array.mo'),
);

jest.setTimeout(10000);

describe('go to definition', () => {
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

        await wait(0.6);
    });

    afterAll(async () => {
        await client.sendRequest('shutdown');
        await wait(2);
        client.dispose();
        server.dispose();
    });

    const testGoToDefinition = async ({ pos, declPos }: any) => {
        const response = await client.sendRequest('textDocument/definition', {
            textDocument: file.textDocument,
            position: pos,
        });

        expect(response).toEqual(declPos);
    };

    // module {
    //^^
    const baseArrayModuleDelcPos = {
        uri: `${arrayUri}`,
        range: {
            start: { line: 19, character: 0 },
            end: { line: 19, character: 0 },
        },
    };
    test.each([
        // Jump from:
        // let b : [var Int] = Array.init();
        // 1)                 ^^
        // 2)                  ^^
        // 3)                      ^^
        { pos: { line: 5, character: 24 }, declPos: baseArrayModuleDelcPos },
        { pos: { line: 5, character: 25 }, declPos: baseArrayModuleDelcPos },
        { pos: { line: 5, character: 29 }, declPos: baseArrayModuleDelcPos },
    ])('base:Array-%#', testGoToDefinition);

    // public func init<X>(...
    //            ^^
    const baseArrayInitDelcPos = {
        uri: `${arrayUri}`,
        range: {
            start: { line: 28, character: 14 },
            end: { line: 28, character: 18 },
        },
    };
    test.each([
        // Jump from:
        // let b : [var Int] = Array.init();
        // 1)                       ^^
        // 2)                        ^^
        // 3)                           ^^
        { pos: { line: 5, character: 30 }, declPos: baseArrayInitDelcPos },
        { pos: { line: 5, character: 31 }, declPos: baseArrayInitDelcPos },
        { pos: { line: 5, character: 34 }, declPos: baseArrayInitDelcPos },
    ])('base:Array.init-%#', testGoToDefinition);

    // module {
    //^^
    const vectorModuleDeclPos = {
        uri: `${vectorUri}`,
        range: {
            start: { line: 19, character: 0 },
            end: { line: 19, character: 0 },
        },
    };
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
    ])('vector:Vector-%#', testGoToDefinition);

    // public type Vector<X> = {
    //            ^^
    const vectorTypeDeclPos = {
        uri: `${vectorUri}`,
        range: {
            start: { line: 27, character: 14 },
            end: { line: 27, character: 20 },
        },
    };
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
    ])('vector:Vector.Vector-%#', testGoToDefinition);

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
    ])('multiline-%#', testGoToDefinition);
});
