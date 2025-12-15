import { join } from 'node:path';
import {
    writeFileSync,
    mkdirSync,
    rmSync,
    readFileSync,
    existsSync,
} from 'node:fs';
import { addContext, resetContexts } from '../context';
import { settings } from '../globals';

describe('mocJsPath configuration', () => {
    let tempDir: string;
    let validMocJsPath: string;

    beforeEach(() => {
        resetContexts();
        tempDir = join(__dirname, 'temp');
        // Clean up temp directory contents from previous runs
        if (existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true, force: true });
        }
        // Create temp directory
        mkdirSync(tempDir, { recursive: true });
        // Use the real moc-0.10.4.js file
        validMocJsPath = join(__dirname, '../compiler/moc-0.10.4.js');
    });

    afterEach(() => {
        // Clean up temp directory after each test
        if (existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    const createInvalidMocJs = (): string => {
        const filePath = join(tempDir, 'invalid-moc.js');
        // This will throw immediately when require() is called
        writeFileSync(
            filePath,
            `throw new Error('File throws during require');`,
        );
        return filePath;
    };

    const createCustomMocJs = (): string => {
        const filePath = join(tempDir, 'custom-moc.js');
        // Copy the real moc-0.10.4.js to create a custom file
        const realMocJs = join(__dirname, '../compiler/moc-0.10.4.js');
        const realMocJsContent = readFileSync(realMocJs, 'utf8');
        writeFileSync(filePath, realMocJsContent);
        return filePath;
    };

    describe('valid mocJsPath', () => {
        it('creates context with custom moc.js', async () => {
            settings.mocJsPath = validMocJsPath;
            const context = await addContext('test-uri');

            expect(context).toBeDefined();
            expect(context.uri).toBe('test-uri');
            expect(context.motoko).toBeDefined();
            // Verify the custom moc.js path was used
            expect(context.mocJsInfo.path).toBe(validMocJsPath);
            expect(context.mocJsInfo.version).toBe('0.10.4');
            expect(context.motoko.version).toBeDefined();
            expect(typeof context.motoko.version).toBe('string');
        });

        it('handles relative paths', async () => {
            const relativePath = 'src/server/compiler/moc-0.10.4.js';
            settings.mocJsPath = relativePath;
            const context = await addContext(
                'test-relative',
                undefined,
                process.cwd(),
            );

            expect(context.motoko).toBeDefined();
            // Verify the context stores absolute path to moc.js
            expect(context.mocJsInfo.path).toBe(validMocJsPath);
            expect(context.mocJsInfo.version).toBe('0.10.4');
        });

        it('works with version option', async () => {
            settings.mocJsPath = validMocJsPath;
            const context = await addContext('test-versioned', '0.10.4');

            expect(context.motoko).toBeDefined();
            // Verify both version and mocJsPath are stored
            expect(context.mocJsInfo.version).toBe('0.10.4');
            expect(context.mocJsInfo.path).toBe(validMocJsPath);
            expect(context.motoko.version).toBeDefined();
        });

        it('loads custom moc.js with distinctive version', async () => {
            const customMocJsPath = createCustomMocJs();
            settings.mocJsPath = customMocJsPath;
            const context = await addContext('test-custom-version');

            expect(context).toBeDefined();
            expect(context.motoko).toBeDefined();
            // Verify the custom moc.js path was actually used by checking the stored config
            expect(context.mocJsInfo.path).toBe(customMocJsPath);
            // Verify the motoko instance was created successfully
            expect(context.motoko.version).toBeDefined();
        });
    });

    describe('invalid mocJsPath fallback', () => {
        const testCases = [
            {
                name: 'non-existent path',
                mocJsPath: '/non/existent/path/moc.js',
            },
            { name: 'empty string', mocJsPath: '' },
            { name: 'undefined', mocJsPath: undefined },
        ];

        testCases.forEach(({ name, mocJsPath }) => {
            it(`falls back to default for ${name}`, async () => {
                settings.mocJsPath = mocJsPath;
                const context = await addContext(`test-${name}`);

                expect(context).toBeDefined();
                expect(context.motoko).toBeDefined();
                // For default motoko path and version should be undefined
                expect(context.mocJsInfo.version).toBeUndefined();
                expect(context.mocJsInfo.path).toBeUndefined();
                // Verify fallback to default compiler worked
                expect(context.motoko.version).toBeDefined();
            });
        });

        it('falls back when file throws during require', async () => {
            const invalidMocJsPath = createInvalidMocJs();
            settings.mocJsPath = invalidMocJsPath;
            const context = await addContext('test-error');

            expect(context.motoko).toBeDefined();
            // For default motoko path and version should be undefined
            expect(context.mocJsInfo.version).toBeUndefined();
            expect(context.mocJsInfo.path).toBeUndefined();
            // Verify fallback to default compiler worked
            expect(context.motoko.version).toBeDefined();
        });

        it('falls back when file exists but missing Motoko export', async () => {
            const filePath = join(tempDir, 'no-export-moc.js');
            writeFileSync(filePath, 'module.exports = {};');
            settings.mocJsPath = filePath;
            const context = await addContext('test-no-export');
            expect(context.motoko).toBeDefined();
            expect(context.motoko.version).toBeDefined();
            // For default motoko path and version should be undefined
            expect(context.mocJsInfo.version).toBeUndefined();
            expect(context.mocJsInfo.path).toBeUndefined();
        });
    });

    describe('context management', () => {
        it('creates separate contexts for different URIs', async () => {
            settings.mocJsPath = validMocJsPath;
            const context1 = await addContext('uri-1');
            const context2 = await addContext('uri-2');

            expect(context1.uri).toBe('uri-1');
            expect(context2.uri).toBe('uri-2');
            expect(context1).not.toBe(context2);
        });

        it('reuses context for same URI', async () => {
            settings.mocJsPath = validMocJsPath;
            const context1 = await addContext('same-uri');
            const context2 = await addContext('same-uri');

            expect(context1).toBe(context2);
        });
    });
});
