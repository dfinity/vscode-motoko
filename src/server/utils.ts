import { readFileSync } from 'fs';
import { join } from 'path';
import { URI } from 'vscode-uri';
import { documents } from './server';

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
export function getText(uri: string): string {
    const document = documents.get(uri);
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
export function tryGetText(uri: string): string | null {
    try {
        return getText(uri);
    } catch (err) {
        return null;
    }
}

export function getRelativeUri(from: string, to: string) {
    if (from === to) {
        return '.';
    }
    return require('url-relative')(from, to);
}
