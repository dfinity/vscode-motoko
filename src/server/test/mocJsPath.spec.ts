import { join } from 'node:path';
import {
    writeFileSync,
    mkdirSync,
    rmSync,
    readFileSync,
    existsSync,
} from 'node:fs';
import { addContext, resetContexts } from '../context';

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
        it('creates context with custom moc.js', () => {
            const context = addContext('test-uri', {
                mocJsPath: validMocJsPath,
            });

            expect(context).toBeDefined();
            expect(context.uri).toBe('test-uri');
            expect(context.motoko).toBeDefined();
            // Verify the custom moc.js path was used
            expect(context.version.mocJsPath).toBe(validMocJsPath);
            expect(context.motoko.version).toBeDefined();
            expect(typeof context.motoko.version).toBe('string');
        });

        it('handles relative paths', () => {
            const relativePath = 'src/server/compiler/moc-0.10.4.js';

            const context = addContext('test-relative', {
                mocJsPath: relativePath,
            });

            expect(context.motoko).toBeDefined();
            // Verify the relative path was stored in context
            expect(context.version.mocJsPath).toBe(relativePath);
        });

        it('works with version option', () => {
            const context = addContext('test-versioned', {
                version: '0.10.4',
                mocJsPath: validMocJsPath,
            });

            expect(context.motoko).toBeDefined();
            // Verify both version and mocJsPath are stored
            expect(context.version.version).toBe('0.10.4');
            expect(context.version.mocJsPath).toBe(validMocJsPath);
            expect(context.motoko.version).toBeDefined();
        });

        it('loads custom moc.js with distinctive version', () => {
            const customMocJsPath = createCustomMocJs();
            const context = addContext('test-custom-version', {
                mocJsPath: customMocJsPath,
            });

            expect(context).toBeDefined();
            expect(context.motoko).toBeDefined();
            // Verify the custom moc.js path was actually used by checking the stored config
            expect(context.version.mocJsPath).toBe(customMocJsPath);
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
            it(`falls back to default for ${name}`, () => {
                const context = addContext(`test-${name}`, { mocJsPath });

                expect(context).toBeDefined();
                expect(context.motoko).toBeDefined();
                // Verify the invalid mocJsPath was still stored in context
                // (the fallback happens during motoko instance creation, not context creation)
                expect(context.version.mocJsPath).toBe(mocJsPath);
                // Verify fallback to default compiler worked
                expect(context.motoko.version).toBeDefined();
            });
        });

        it('falls back when file throws during require', () => {
            const invalidMocJsPath = createInvalidMocJs();

            const context = addContext('test-error', {
                mocJsPath: invalidMocJsPath,
            });

            expect(context.motoko).toBeDefined();
            // Verify the invalid mocJsPath was still stored in context
            expect(context.version.mocJsPath).toBe(invalidMocJsPath);
            // Verify fallback to default compiler worked
            expect(context.motoko.version).toBeDefined();
        });
    });

    describe('context management', () => {
        it('creates separate contexts for different URIs', () => {
            const context1 = addContext('uri-1', { mocJsPath: validMocJsPath });
            const context2 = addContext('uri-2', { mocJsPath: validMocJsPath });

            expect(context1.uri).toBe('uri-1');
            expect(context2.uri).toBe('uri-2');
            expect(context1).not.toBe(context2);
            // Verify both contexts have the custom path configured
            expect(context1.version.mocJsPath).toBe(validMocJsPath);
            expect(context2.version.mocJsPath).toBe(validMocJsPath);
        });

        it('reuses context for same URI', () => {
            const context1 = addContext('same-uri', {
                mocJsPath: validMocJsPath,
            });
            const context2 = addContext('same-uri', {
                mocJsPath: validMocJsPath,
            });

            expect(context1).toBe(context2);
            // Verify the reused context maintains the custom path
            expect(context1.version.mocJsPath).toBe(validMocJsPath);
        });
    });
});
