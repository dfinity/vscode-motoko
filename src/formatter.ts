import * as prettier from 'prettier';
import * as vscode from 'vscode';
import * as path from 'path';
import { getCurrentWorkspaceRootFsPath } from './utils';

export function formatDocument(
    document: vscode.TextDocument,
    context: vscode.ExtensionContext,
): vscode.TextEdit[] {
    const formatter = vscode.workspace
        .getConfiguration('motoko')
        .get<string>('formatter');
    if (formatter === 'prettier') {
        const rootPath = getCurrentWorkspaceRootFsPath();
        if (rootPath) {
            const ignoreOptions = {
                ignorePath: path.join(rootPath, '.prettierignore'),
            };
            const fileInfo = prettier.getFileInfo.sync(
                document.uri.fsPath,
                ignoreOptions,
            );
            if (!fileInfo.ignored) {
                const source = document.getText();

                const pluginPath = path.join(
                    context.extensionPath,
                    'node_modules',
                    'prettier-plugin-motoko',
                );
                const config = prettier.resolveConfig.sync(
                    document.uri.fsPath /* , options */,
                );
                if (config !== null) {
                    prettier.clearConfigCache();
                }
                const options: prettier.Options = {
                    filepath: document.fileName,
                    // parser: "motoko-tt-parse",
                    pluginSearchDirs: [context.extensionPath],
                    plugins: [pluginPath],
                    ...(config || {}),
                };
                // Object.assign(options, config);
                const firstLine = document.lineAt(0);
                const lastLine = document.lineAt(document.lineCount - 1);
                const fullTextRange = new vscode.Range(
                    firstLine.range.start,
                    lastLine.range.end,
                );
                const formatted = prettier.format(source, options);
                if (!formatted) {
                    return [];
                }
                return [vscode.TextEdit.replace(fullTextRange, formatted)];
            }
        }
    }
    return [];
}
