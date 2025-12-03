import { join } from 'node:path';
import { cwd } from 'node:process';
import { TextEdit } from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import { TextDocument, openTextDocuments, runTest } from './helpers';

const rootPath = join(cwd(), 'test', 'formatter');
const rootUri = URI.file(rootPath);
const fileUri = URI.file(join(rootPath, 'unformatted.mo')).toString();

async function requestFormatting(
    initializationOptions?: Record<string, unknown>,
): Promise<TextEdit[]> {
    return runTest(
        rootUri,
        async (client) => {
            const textDocuments = new Map<string, TextDocument>();
            await openTextDocuments(client, textDocuments, rootUri, [fileUri]);
            return client.sendRequest<TextEdit[]>('textDocument/formatting', {
                textDocument: { uri: fileUri },
                options: { tabSize: 4, insertSpaces: true },
            });
        },
        true,
        initializationOptions,
    );
}

describe('document formatting', () => {
    test('formats using prettier by default', async () => {
        const edits = await requestFormatting();
        expect(edits).toHaveLength(1);
        expect(edits[0].newText).toBe(
            'module {\n    public func hello() : async () {};\n};\n',
        );
    }, 6000);

    test('disables formatting via initialization options', async () => {
        const edits = await requestFormatting({ formatter: 'none' });
        expect(edits).toHaveLength(0);
    });
});
