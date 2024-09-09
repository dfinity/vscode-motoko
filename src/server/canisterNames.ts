import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export async function getCanisterNames(): Promise<string[]> {
    const options = ['All'];
    const rootPath = vscode.workspace.rootPath;
    if (rootPath) {
        const jsonFilePath = path.join(rootPath, 'dfx.json');
        if (fs.existsSync(jsonFilePath)) {
            const fileContent = fs.readFileSync(jsonFilePath, 'utf-8');
            const jsonData = JSON.parse(fileContent);
            return jsonData
                ? options.concat(Object.keys(jsonData.canisters))
                : options;
        } else {
            return options;
        }
    } else {
        return options;
    }
}
