import { readFileSync } from 'fs';
import { join } from 'path';
import * as motokoPlugin from 'prettier-plugin-motoko';
import * as prettier from 'prettier/standalone';
import { URI, Utils } from 'vscode-uri';

/**
 * Resolves the absolute file system path from the given URI.
 */
export function resolveFilePath(uri: string, ...parts: string[]): string {
    return join(URI.parse(uri).fsPath, ...parts);
}

/**
 * Resolves the virtual compiler path from the given URI.
 */
export function resolveVirtualPath(uri: string, ...parts: string[]): string {
    return join(URI.parse(uri).path, ...parts).replace(/\\/g, '/');
}

/**
 * Reads a file from the given URI.
 */
export function getFileText(uri: string): string {
    const document = require('./server').documents.get(uri);
    if (document) {
        return document.getText();
    } else {
        const filePath = resolveFilePath(uri);
        return readFileSync(filePath, 'utf8');
    }
}

/**
 * Attempts to read a file. Returns null if not found.
 */
export function tryGetFileText(uri: string): string | null {
    try {
        return getFileText(uri);
    } catch (err) {
        return null;
    }
}

export function formatMotoko(source: string): string {
    try {
        return prettier.format(source, {
            plugins: [motokoPlugin],
            filepath: '*.mo',
        });
    } catch (err) {
        console.error(`Error while formatting \`${source}\`: ${err}`);
        return source;
    }
}

export function getRelativeUri(from: string, to: string): string {
    if (from === to) {
        // Fix vulnerability with `url-relative` package (https://security.snyk.io/vuln/SNYK-JS-URLRELATIVE-173691)
        return from.substring(from.lastIndexOf('/') + 1);
    }
    return require('url-relative')(from, to);
}

export function getAbsoluteUri(base: string, ...paths: string[]): string {
    // if (/^[a-z]+:/i.test(path)) {
    //     return path;
    // }
    return Utils.joinPath(URI.parse(base), ...paths).toString();
}
