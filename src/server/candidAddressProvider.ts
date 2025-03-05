import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ENVIRONMENT } from '../common/connectionTypes';

const CANDID_UI_CANISTER_NAME = '__Candid_UI';
const WEBVIEW_PORT = 4943;

export async function resolveCandidUIAddress(
    env: ENVIRONMENT,
    canisterName: string,
    tag: number,
): Promise<string | null> {
    const rootPath = vscode.workspace.rootPath;
    if (ENVIRONMENT.LOCAL === env && rootPath) {
        const jsonFilePath = path.join(
            rootPath,
            '.dfx',
            'local',
            'canister_ids.json',
        );
        return fs.readFile(jsonFilePath, 'utf-8').then(
            (fileContent) => {
                const jsonData = JSON.parse(fileContent);
                if (jsonData) {
                    const candidId = getCanisterId(
                        jsonData,
                        CANDID_UI_CANISTER_NAME,
                        env,
                    );
                    const canisterId = getCanisterId(
                        jsonData,
                        canisterName,
                        env,
                    );
                    return `http://localhost:${WEBVIEW_PORT}/?canisterId=${candidId}&id=${canisterId}&tag${tag++}`;
                } else {
                    return null;
                }
            },
            () => {
                return null;
            },
        );
    } else if (ENVIRONMENT.PLAYGROUND === env && rootPath) {
        const jsonFilePath = path.join(
            rootPath,
            '.dfx',
            'playground',
            'canister_ids.json',
        );
        return fs.readFile(jsonFilePath, 'utf-8').then(
            (fileContent) => {
                const jsonData = JSON.parse(fileContent);
                if (jsonData) {
                    const canisterId = getCanisterId(
                        jsonData,
                        canisterName,
                        env,
                    );
                    return `https://a4gq6-oaaaa-aaaab-qaa4q-cai.raw.icp0.io/?id=${canisterId}&tag${tag++}`;
                } else {
                    return null;
                }
            },
            () => {
                return null;
            },
        );
    } else {
        return null;
    }
}

function getCanisterId(data: any, key: string, env: ENVIRONMENT): any {
    if (data[key] && data[key][env]) {
        return data[key][env];
    } else {
        return undefined;
    }
}
