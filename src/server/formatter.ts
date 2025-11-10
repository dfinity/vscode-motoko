import { FormattingOptions, Range, TextEdit } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as prettier from 'prettier';
import * as motokoPlugin from 'prettier-plugin-motoko';
import { URI } from 'vscode-uri';
import { join, sep } from 'path';

export type FormatterKind = 'none' | 'prettier';

const candidOptions: prettier.Options = {
    semi: false,
    trailingComma: 'none',
};

function findWorkspaceFolder(
    filePath: string,
    workspaceFolders: readonly string[],
): string | undefined {
    return workspaceFolders.find((folderPath) => {
        const withSeparator = folderPath.endsWith(sep)
            ? folderPath
            : `${folderPath}${sep}`;
        return filePath === folderPath || filePath.startsWith(withSeparator);
    });
}

export function formatDocument(
    document: TextDocument,
    formatter: FormatterKind,
    workspaceFolders: readonly string[],
    formattingOptions?: FormattingOptions,
): TextEdit[] {
    if (formatter !== 'prettier') {
        return [];
    }
    try {
        const uri = URI.parse(document.uri);
        const filePath = uri.fsPath;
        const folderPath = findWorkspaceFolder(filePath, workspaceFolders);
        const ignorePath = folderPath
            ? join(folderPath, '.prettierignore')
            : undefined;
        const fileInfo = prettier.getFileInfo.sync(
            filePath,
            ignorePath ? { ignorePath } : undefined,
        );
        if (fileInfo.ignored) {
            return [];
        }
        const source = document.getText();
        const resolvedConfig = prettier.resolveConfig.sync(filePath);
        if (resolvedConfig !== null) {
            prettier.clearConfigCache();
        }
        const prettierOptions: prettier.Options = {
            filepath: filePath,
            ...(resolvedConfig || {}),
            plugins: [motokoPlugin],
        };
        applyFormattingOptions(prettierOptions, formattingOptions);
        if (filePath.endsWith('.did')) {
            Object.assign(prettierOptions, candidOptions);
        }
        const fullRange = Range.create(
            document.positionAt(0),
            document.positionAt(source.length),
        );
        const formatted = prettier.format(source, prettierOptions);
        if (!formatted) {
            return [];
        }
        return [TextEdit.replace(fullRange, formatted)];
    } catch (err) {
        console.error('Error while formatting:', err);
        return [];
    }
}

function applyFormattingOptions(
    prettierOptions: prettier.Options,
    formattingOptions?: FormattingOptions,
) {
    if (!formattingOptions) {
        return;
    }
    if (
        typeof formattingOptions.tabSize === 'number' &&
        prettierOptions.tabWidth === undefined
    ) {
        prettierOptions.tabWidth = formattingOptions.tabSize;
    }
    if (
        typeof formattingOptions.insertSpaces === 'boolean' &&
        prettierOptions.useTabs === undefined
    ) {
        prettierOptions.useTabs = !formattingOptions.insertSpaces;
    }
}
