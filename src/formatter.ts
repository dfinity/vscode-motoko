import * as prettier from 'prettier';
import {
    TextDocument,
    ExtensionContext,
    FormattingOptions,
    TextEdit,
    workspace,
    Range,
} from 'vscode';
import { join } from 'path';
import { getCurrentWorkspaceRootFsPath } from './utils';
import * as motokoPlugin from 'prettier-plugin-motoko';

const candidConfigOverrides: prettier.Options = {
    semi: false,
    trailingComma: 'none',
};

export function formatDocument(
    document: TextDocument,
    _context: ExtensionContext,
    options: FormattingOptions,
): TextEdit[] {
    try {
        const formatter = workspace
            .getConfiguration('motoko')
            .get<string>('formatter');
        if (formatter === 'prettier') {
            const rootPath = getCurrentWorkspaceRootFsPath();
            if (rootPath) {
                const ignoreOptions = {
                    ignorePath: join(rootPath, '.prettierignore'),
                };
                const fileInfo = prettier.getFileInfo.sync(
                    document.uri.fsPath,
                    ignoreOptions,
                );
                if (!fileInfo.ignored) {
                    const source = document.getText();

                    const config = prettier.resolveConfig.sync(
                        document.uri.fsPath /* , options */,
                    );
                    if (config !== null) {
                        prettier.clearConfigCache();
                    }
                    const prettierOptions: prettier.Options = {
                        filepath: document.fileName,
                        // pluginSearchDirs: [join(rootPath, 'node_modules')],
                        tabWidth: options.tabSize,
                        useTabs: !options.insertSpaces,
                        ...(config || {}),
                        plugins: [motokoPlugin],
                    };
                    if (document.fileName.endsWith('.did')) {
                        Object.assign(prettierOptions, candidConfigOverrides);
                    }
                    const firstLine = document.lineAt(0);
                    const lastLine = document.lineAt(document.lineCount - 1);
                    const fullTextRange = new Range(
                        firstLine.range.start,
                        lastLine.range.end,
                    );
                    const formatted = prettier.format(source, prettierOptions);
                    if (!formatted) {
                        return [];
                    }
                    return [TextEdit.replace(fullTextRange, formatted)];
                }
            }
        }
    } catch (err) {
        console.error('Error while formatting:', err);
    }
    return [];
}
