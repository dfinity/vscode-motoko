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

export function formatDocument(
    document: TextDocument,
    context: ExtensionContext,
    options: FormattingOptions,
): TextEdit[] {
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
                    plugins: [motokoPlugin],
                    tabWidth: options.tabSize,
                    useTabs: !options.insertSpaces,
                    ...(config || {}),
                };
                // Object.assign(options, config);
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
    return [];
}
