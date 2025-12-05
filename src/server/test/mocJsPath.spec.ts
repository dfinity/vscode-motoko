import { join } from 'node:path';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { addContext, resetContexts } from '../context';

describe('mocJsPath configuration', () => {
    let tempDir: string;
    let validMocJsPath: string;

    beforeEach(() => {
        resetContexts();
        tempDir = mkdtempSync(join(tmpdir(), 'vscode-motoko-test-'));
        // Use the real moc-0.10.4.js file
        validMocJsPath = join(__dirname, '../compiler/moc-0.10.4.js');
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    const createInvalidMocJs = (): string => {
        const filePath = join(tempDir, 'invalid-moc.js');
        writeFileSync(filePath, `throw new Error('Invalid moc.js file');`);
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
        });

        it('handles relative paths', () => {
            const relativePath = 'src/server/compiler/moc-0.10.4.js';

            const context = addContext('test-relative', {
                mocJsPath: relativePath,
            });

            expect(context.motoko).toBeDefined();
        });

        it('works with version option', () => {
            const context = addContext('test-versioned', {
                version: '0.10.4',
                mocJsPath: validMocJsPath,
            });

            expect(context.motoko).toBeDefined();
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
            });
        });

        it('falls back when file throws error', () => {
            const invalidMocJsPath = createInvalidMocJs();

            const context = addContext('test-error', {
                mocJsPath: invalidMocJsPath,
            });

            expect(context.motoko).toBeDefined();
        });
    });

    describe('context management', () => {
        it('creates separate contexts for different URIs', () => {
            const context1 = addContext('uri-1', { mocJsPath: validMocJsPath });
            const context2 = addContext('uri-2', { mocJsPath: validMocJsPath });

            expect(context1.uri).toBe('uri-1');
            expect(context2.uri).toBe('uri-2');
            expect(context1).not.toBe(context2);
        });

        it('reuses context for same URI', () => {
            const context1 = addContext('same-uri', {
                mocJsPath: validMocJsPath,
            });
            const context2 = addContext('same-uri', {
                mocJsPath: validMocJsPath,
            });

            expect(context1).toBe(context2);
        });
    });
});
