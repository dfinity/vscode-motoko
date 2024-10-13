import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ENVIRONMENT } from '../common/connectionTypes';

const OPTION_DEFAULT = 'All';
const OPTION_REPLACEMENT = '';

export async function getCanisterNames(): Promise<string[]> {
    const options = [OPTION_DEFAULT];
    const optionsReplacement = [OPTION_REPLACEMENT];
    const rootPath = vscode.workspace.rootPath;
    if (rootPath) {
        const jsonFilePath = path.join(rootPath, 'dfx.json');
        return fs.readFile(jsonFilePath, 'utf-8').then(
            (fileContent) => {
                const jsonData = JSON.parse(fileContent);
                if (
                    jsonData &&
                    Object.keys(jsonData.canisters).includes(OPTION_DEFAULT)
                ) {
                    return optionsReplacement.concat(
                        Object.keys(jsonData.canisters),
                    );
                } else if (jsonData) {
                    return options.concat(Object.keys(jsonData.canisters));
                } else {
                    return options;
                }
            },
            () => {
                return options;
            },
        );
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
        return fs.readFile(jsonFilePath, 'utf-8').then(
            (fileContent) => {
                const jsonData = JSON.parse(fileContent);
                return Object.keys(jsonData)
                    .filter((key) => key && key !== '__Candid_UI')
                    .map((key) => {
                        return key;
                    });
            },
            () => {
                return options;
            },
        );
    } else {
        return options;
    }
}
