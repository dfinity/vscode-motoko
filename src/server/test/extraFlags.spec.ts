import { URI } from 'vscode-uri';
import { join } from 'node:path';
import { cwd } from 'node:process';
import {
    TextDocument,
    defaultBeforeAll,
    defaultAfterAll,
    openTextDocuments,
    waitForNotification,
} from './helpers';
import {
    Connection,
    Diagnostic,
    DiagnosticSeverity,
} from 'vscode-languageserver';
import { configParams } from './mock';

const rootPath = join(cwd(), 'test', 'flags');
const rootUri = URI.parse(rootPath);

jest.setTimeout(30000);

describe('extra moc flags', () => {
    let client: Connection;
    let server: Connection;
    const textDocuments = new Map<string, TextDocument>();

    async function getDiagnosticsFor(file: string): Promise<Diagnostic[]> {
        const filePath = join(rootPath, file);
        const fileUri = URI.parse(filePath).toString();
        await openTextDocuments(client, textDocuments, rootUri, [fileUri]);
        // wait for diagnostics for this file
        const diags = await new Promise<Diagnostic[]>((resolve) => {
            const disposable = client.onNotification(
                'textDocument/publishDiagnostics',
                (params: { uri: string; diagnostics: Diagnostic[] }) => {
                    if (params.uri === fileUri) {
                        disposable.dispose();
                        resolve(params.diagnostics);
                    }
                },
            );
        });
        return diags;
    }

    async function setExtraFlags(flags: string[]) {
        (configParams as any).settings.motoko.extraFlags = flags;
        [client, server] = await defaultBeforeAll(rootUri, true);
        // send config and wait for reload
        await client.sendNotification(
            'workspace/didChangeConfiguration',
            configParams,
        );
        await waitForNotification('custom/initialized', client);
    }

    describe('Test without extra flags', () => {
        beforeAll(async () => setExtraFlags([]));

        afterAll(async () => {
            await defaultAfterAll(client, server);
        });

        test('deprecated warning is shown', async () => {
            const diags = await getDiagnosticsFor('deprecated.mo');
            expect(diags).toHaveLength(1);
            expect(diags[0].severity).toBe(DiagnosticSeverity.Warning);
        });
    });

    describe('Treat M0154 as error', () => {
        beforeAll(async () => setExtraFlags(['-E=M0154']));

        afterAll(async () => {
            await defaultAfterAll(client, server);
        });

        test('no warnings', async () => {
            const diags = await getDiagnosticsFor('deprecated.mo');
            expect(diags).toHaveLength(1);
            expect(diags[0].severity).toBe(DiagnosticSeverity.Error);
        });
    });
});
