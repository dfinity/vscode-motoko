import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ENVIRONMENT } from '../common/connectionTypes';

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

export async function getCanisterNamesForCandid(
    env: ENVIRONMENT,
): Promise<string[]> {
    const options: string[] = [];
    const rootPath = vscode.workspace.rootPath;
    if (rootPath) {
        const jsonFilePath = path.join(
            rootPath,
            '.dfx',
            env,
            'canister_ids.json',
        );
        if (fs.existsSync(jsonFilePath)) {
            const fileContent = fs.readFileSync(jsonFilePath, 'utf-8');
            const jsonData = JSON.parse(fileContent);
            return Object.keys(jsonData)
                .filter((key) => key && key !== '__Candid_UI')
                .map((key) => {
                    return key;
                });
        } else {
            return options;
        }
    } else {
        return options;
    }
}
