import { URI } from 'vscode-uri';
import { join } from 'node:path';
import { cwd } from 'node:process';
import {
    TextDocument,
    defaultBeforeAll,
    defaultAfterAll,
    openTextDocuments,
    waitForDiagnostics,
} from './helpers';
import { Connection } from 'vscode-languageserver';
import { getContext } from '../context';

const rootPath = join(cwd(), 'test', 'enhancedMigration');
const rootUri = URI.parse(rootPath);
const backendMainPath = join(rootPath, 'src', 'main.mo');
const backendMainUri = URI.file(backendMainPath).toString();
const testMainPath = join(rootPath, 'src', 'test.mo');
const testMainUri = URI.file(testMainPath).toString();

jest.setTimeout(60000);

describe('enhanced migration', () => {
    let client: Connection;
    let server: Connection;

    beforeAll(async () => {
        [client, server] = await defaultBeforeAll(rootUri, true, {
            useDefaultMocJs: true,
        });
    });

    afterAll(async () => {
        await defaultAfterAll(client, server);
    });

    test('backend has isolated context, test uses workspace context', () => {
        const backendCtx = getContext(backendMainUri);
        const testCtx = getContext(testMainUri);

        expect(backendCtx.motoko.compiler).not.toBe(testCtx.motoko.compiler);
        expect(
            backendCtx.mopsArgs.some((f) =>
                f.startsWith('--enhanced-migration='),
            ),
        ).toBe(true);
        expect(
            testCtx.mopsArgs.some((f) => f.startsWith('--enhanced-migration=')),
        ).toBe(false);
    });

    test('per-canister Flags do not leak between compiler instances', () => {
        const backendCtx = getContext(backendMainUri);
        const testCtx = getContext(testMainUri);

        try {
            const code = 'actor { let x : Nat; }';
            backendCtx.motoko.write('probe.mo', code);
            testCtx.motoko.write('probe.mo', code);

            backendCtx.motoko.setExtraFlags([
                '--enhanced-migration=/tmp/nope',
                '--default-persistent-actors',
            ]);
            testCtx.motoko.setExtraFlags(['--default-persistent-actors']);

            const testDiags = testCtx.motoko.check('probe.mo');
            expect(testDiags.some((d: any) => d.code === 'M0257')).toBe(true);
            expect(testDiags.some((d: any) => d.code === 'M0256')).toBe(false);
        } finally {
            backendCtx.applyMocFlags(undefined);
            testCtx.applyMocFlags(undefined);
        }
    });

    test('backend main.mo compiles without errors', async () => {
        const textDocuments = new Map<string, TextDocument>();

        const diagsPromise = waitForDiagnostics(client, backendMainUri);
        await openTextDocuments(client, textDocuments, rootUri, [
            backendMainUri,
        ]);
        const diags = await diagsPromise;

        const errors = diags.filter((d) => d.severity === 1);
        expect(errors).toHaveLength(0);
    });

    test('canister compiles without errors after backend', async () => {
        const textDocuments = new Map<string, TextDocument>();

        const diagsPromise = waitForDiagnostics(client, testMainUri);
        await openTextDocuments(client, textDocuments, rootUri, [testMainUri]);
        const diags = await diagsPromise;

        const errors = diags.filter((d) => d.severity === 1);
        expect(errors).toHaveLength(0);
    });
});
