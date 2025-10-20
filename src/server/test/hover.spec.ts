import { Hover } from 'vscode';
import { URI } from 'vscode-uri';
import { join } from 'node:path';
import { makeTextDocument, runTest } from '../test/helpers';

jest.setTimeout(60000);

beforeAll(() => {
    jest.mock('ic-mops/commands/add');
});

const rootUri = URI.parse(join(__dirname, '..', '..', '..', 'test', 'hover'));

describe('module', () => {
    const textDocument = makeTextDocument(rootUri, 'Module.mo');

    test('Module has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 1, character: 0 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: 'Module documentation\n\n---\n\n*Type definition:*\n```motoko\nmodule {\n  type Class = { classMethod : () -> (); classValue : Nat };\n  type Record = { var age : Nat; name : Text };\n  Class : (initialValue : Nat) -> Class;\n  Object : { objectMethod : () -> (); objectValue : Nat };\n  inc : (x : Nat) -> Nat;\n  value : Nat;\n};\n```',
        });
    });

    test('Empty space in a module has no hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 6, character: 0 },
            });
        });
        expect(hover).toBeNull();
    });

    test('Variable has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 3, character: 15 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\nNat\n```\n\n---\n\nVariable documentation',
        });
    });

    test('Function has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 14, character: 16 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\n(x : Nat) -> Nat\n```\n\n---\n\nIncrement the value by one\n\n#### Example\n\n```motoko\nlet x = 41;\nlet y = inc(x);\nassert Nat.equal(y, 42);\n```',
        });
    });

    test('Argument has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 14, character: 20 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\nNat\n```',
        });
    });

    test('Mutable variable has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 16, character: 10 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\nvar Nat\n```\n\n---\n\nMutable variable documentation',
        });
    });

    test('Async function has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 22, character: 9 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\n() -> async ()\n```\n\n---\n\nAsync function documentation',
        });
    });

    test('Optional type has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 24, character: 33 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\n?Int\n```',
        });
    });

    test('Literal expression has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 25, character: 17 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\n?Int\n```',
        });
    });

    test('Optional expression has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 30, character: 8 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\n?Int\n```',
        });
    });

    test('Class has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 37, character: 17 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\nclass Class(initialValue : Nat)\n```\n\n---\n\nClass documentation',
        });
    });

    test('Object has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 46, character: 18 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\n{ objectMethod : () -> (); objectValue : Nat }\n```\n\n---\n\nObject documentation',
        });
    });

    test('Record has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 55, character: 16 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\n{ var age : Nat; name : Text }\n```\n\n---\n\nRecord documentation',
        });
    });

    test('Record member has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 56, character: 6 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\nText\n```',
        });
    });

    test('Mutable record member has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 57, character: 10 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\nvar Nat\n```',
        });
    });

    test('Variant has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 61, character: 9 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\n{ #leaf; #node : { left : Tree; right : Tree; var value : Nat } }\n```\n\n---\n\nVariant documentation',
        });
    });

    test('Record tag has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 62, character: 6 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\n{ left : Tree; right : Tree; var value : Nat }\n```',
        });
    });
});

describe('actor', () => {
    const textDocument = makeTextDocument(rootUri, 'Actor.mo');

    test('Import has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 0, character: 7 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: 'Module documentation\n\n---\n\n*Type definition:*\n```motoko\nmodule {\n  type Class = { classMethod : () -> (); classValue : Nat };\n  type Record = { var age : Nat; name : Text };\n  Class : (initialValue : Nat) -> Class;\n  Object : { objectMethod : () -> (); objectValue : Nat };\n  inc : (x : Nat) -> Nat;\n  value : Nat;\n};\n```',
        });
    });

    test('"persistent" keyword has no hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 3, character: 0 },
            });
        });
        expect(hover).toBeNull();
    });

    test('Actor has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 3, character: 11 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\nactor { inc : shared () -> async () }\n```\n\n---\n\nActor documentation',
        });
    });

    test('Mutable variable has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 5, character: 6 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\nvar Nat\n```\n\n---\n\nMutable variable documentation',
        });
    });

    test('Actor class has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 8, character: 25 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\nactor class _ActorClass(initialValue : Nat)\n```\n\n---\n\nActor class documentation',
        });
    });

    test('Imported module has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 12, character: 16 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: 'Module documentation\n\n---\n\n*Type definition:*\n```motoko\nmodule {\n  type Class = { classMethod : () -> (); classValue : Nat };\n  type Record = { var age : Nat; name : Text };\n  Class : (initialValue : Nat) -> Class;\n  Object : { objectMethod : () -> (); objectValue : Nat };\n  inc : (x : Nat) -> Nat;\n  value : Nat;\n};\n```',
        });
    });

    test('Imported type has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 12, character: 23 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\n{ var age : Nat; name : Text }\n```\n\n---\n\nRecord documentation',
        });
    });

    test('Imported function has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 18, character: 21 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\n(x : Nat) -> Nat\n```\n\n---\n\nIncrement the value by one\n\n#### Example\n\n```motoko\nlet x = 41;\nlet y = inc(x);\nassert Nat.equal(y, 42);\n```',
        });
    });
});

describe('named module', () => {
    const textDocument = makeTextDocument(rootUri, 'NamedModule.mo');

    test('"module" keyword of module A has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 1, character: 0 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\nmodule {}\n```\n\n---\n\nModule A documentation',
        });
    });

    test('ID of module A has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 1, character: 7 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\nmodule {}\n```\n\n---\n\nModule A documentation',
        });
    });

    test('"module" keyword of module B has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 4, character: 0 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\nmodule {}\n```\n\n---\n\nModule B documentation',
        });
    });

    test('ID of module B has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 4, character: 7 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\nmodule {}\n```\n\n---\n\nModule B documentation',
        });
    });

    test('"module" keyword of module C has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 6, character: 0 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\nmodule {}\n```\n\n---\n\nModule A documentation',
        });
    });

    test('ID of module C has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 6, character: 7 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\nmodule {}\n```\n\n---\n\nModule A documentation',
        });
    });
});

describe('named actor', () => {
    const textDocument = makeTextDocument(rootUri, 'NamedActor.mo');

    test('"actor" keyword of actor A has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 1, character: 11 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\nactor {}\n```\n\n---\n\nActor A documentation',
        });
    });

    test('ID of actor A has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 1, character: 17 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\nactor {}\n```\n\n---\n\nActor A documentation',
        });
    });

    test('"actor" keyword of actor B has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 4, character: 11 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\nactor {}\n```\n\n---\n\nActor B documentation',
        });
    });

    test('ID of actor B has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 4, character: 17 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\nactor {}\n```\n\n---\n\nActor B documentation',
        });
    });

    test('"actor" keyword of actor C has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 6, character: 11 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\nactor {}\n```\n\n---\n\nActor A documentation',
        });
    });

    test('ID of actor C has correct hover', async () => {
        const hover = await runTest(rootUri, async (client) => {
            await client.sendNotification('textDocument/didOpen', {
                textDocument,
            });
            return client.sendRequest<Hover>('textDocument/hover', {
                textDocument,
                position: { line: 6, character: 17 },
            });
        });
        expect(hover.contents).toStrictEqual({
            kind: 'markdown',
            value: '```motoko\nactor {}\n```\n\n---\n\nActor A documentation',
        });
    });
});
