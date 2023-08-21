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

export async function formatDocument(
    document: TextDocument,
    _context: ExtensionContext,
    options: FormattingOptions,
): Promise<TextEdit[]> {
    const formatter = workspace
        .getConfiguration('motoko')
        .get<string>('formatter');
    if (formatter === 'prettier') {
        const rootPath = getCurrentWorkspaceRootFsPath();
        if (rootPath) {
            const ignoreOptions = {
                ignorePath: join(rootPath, '.prettierignore'),
            };
            const fileInfo = await prettier.getFileInfo(
                document.uri.fsPath,
                ignoreOptions,
            );
            if (!fileInfo.ignored) {
                const source = document.getText();

                const config = await prettier.resolveConfig(
                    document.uri.fsPath /* , options */,
                );
                if (config !== null) {
                    await prettier.clearConfigCache();
                }
                const prettierOptions: prettier.Options = {
                    filepath: document.fileName,
                    plugins: [motokoPlugin],
                    tabWidth: options.tabSize,
                    useTabs: !options.insertSpaces,
                    ...(config || {}),
                };
                const firstLine = document.lineAt(0);
                const lastLine = document.lineAt(document.lineCount - 1);
                const fullTextRange = new Range(
                    firstLine.range.start,
                    lastLine.range.end,
                );
                const formatted = await prettier.format(
                    source,
                    prettierOptions,
                );
                if (!formatted) {
                    return [];
                }
                return [TextEdit.replace(fullTextRange, formatted)];
            }
        }
    }
    return [];
}
