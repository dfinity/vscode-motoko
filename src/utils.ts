import * as vscode from 'vscode';

export function getCurrentWorkspaceRootFsPath(): string | undefined {
    return getCurrentWorkspaceRootFolder()?.uri.fsPath;
}

export function getCurrentWorkspaceRootFolder():
    | vscode.WorkspaceFolder
    | undefined {
    var editor = vscode.window.activeTextEditor!;
    const currentDocument = editor.document.uri;
    return vscode.workspace.getWorkspaceFolder(currentDocument);
}
