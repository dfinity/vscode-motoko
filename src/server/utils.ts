import { readFileSync } from 'fs';
import { join, sep } from 'path';
import * as motokoPlugin from 'prettier-plugin-motoko';
import * as prettier from 'prettier/standalone';
import {
    Location,
    Position,
    Range,
    TextEdit,
} from 'vscode-languageserver/node';
import { URI, Utils } from 'vscode-uri';

const fileSeparatorPattern = new RegExp(sep.replace(/[/\\]/g, '\\$&'), 'g');

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
    return join(URI.parse(uri).path, ...parts).replace(
        fileSeparatorPattern,
        '/',
    );
}

/**
 * Reads a file from the given URI.
 */
export function getFileText(uri: string): string {
    const document = require('./handlers').documents.get(uri);
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

/**
 * Formats a Motoko code snippet.
 */
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

/**
 * Gets the relative path from one URI to another.
 */
export function getRelativeUri(from: string, to: string): string {
    if (from === to) {
        // Fix vulnerability with `url-relative` package (https://security.snyk.io/vuln/SNYK-JS-URLRELATIVE-173691)
        return from.substring(from.lastIndexOf('/') + 1);
    }
    return require('url-relative')(from, to);
}

/**
 * Gets the absolute URI from the given input paths (similar to `path.resolve()`).
 */
export function getAbsoluteUri(base: string, ...paths: string[]): string {
    // if (/^[a-z]+:/i.test(path)) {
    //     return path;
    // }
    return Utils.joinPath(URI.parse(base), ...paths).toString();
}

/**
 * Checks whether a VS Code `Range` contains the given `Position`.
 */
export function rangeContainsPosition(
    range: Range,
    position: Position,
): boolean {
    if (position.line < range.start.line || position.line > range.end.line) {
        return false;
    }
    if (
        position.line === range.start.line &&
        position.character < range.start.character
    ) {
        return false;
    }
    if (
        position.line === range.end.line &&
        position.character >= range.end.character
    ) {
        return false;
    }
    return true;
}

/**
 * Forwards message from one console to another.
 */
export const forwardMessage =
    (send: (message: string) => void) =>
    (...args: any[]): void => {
        const toString = (value: any) => {
            try {
                return typeof value === 'string'
                    ? value
                    : value instanceof Promise
                    ? '<Promise>'
                    : value instanceof Error
                    ? value.stack || value.message || value
                    : String(JSON.stringify(value));
            } catch (err) {
                return `<${err}>`;
            }
        };
        send(args.map(toString).join(' '));
    };

// Because JS sets can only compare whether two objects are equal by reference
// or using some datatype like string, we define our own.
type LocationSetRepr = string;
export class LocationSet {
    private readonly _set: Set<LocationSetRepr>;

    constructor() {
        this._set = new Set<LocationSetRepr>();
    }

    private toRepr(value: Location): LocationSetRepr {
        return JSON.stringify(value);
    }

    private fromRepr(value: LocationSetRepr): Location {
        return JSON.parse(value);
    }

    add(value: Location): void {
        this._set.add(this.toRepr(value));
    }

    delete(value: Location): boolean {
        return this._set.delete(this.toRepr(value));
    }

    union(that: LocationSet) {
        that._set.forEach((value) => this._set.add(value));
    }

    *values(): IterableIterator<Location> {
        for (const value of this._set.values()) {
            yield this.fromRepr(value);
        }
    }

    forEach(callbackfn: (value: Location) => void, thisArg?: any): void {
        return this._set.forEach(
            (value, _value2, _set) => callbackfn(this.fromRepr(value)),
            thisArg,
        );
    }
}

/**
 * Returns true if the provided URI references the `.vessel` or `.mops` directories.
 * Otherwise, returns false.
 */
export function isExternalUri(uri: string): boolean {
    return uri.includes('/.vessel/') || uri.includes('/.mops/');
}

/**
 * Compares two ranges.
 */
export function compareRanges(a: Range, b: Range): number {
    if (a.start.line !== b.start.line) {
        return a.start.line - b.start.line;
    }

    if (a.start.character !== b.start.character) {
        return a.start.character - b.start.character;
    }

    if (a.end.line !== b.end.line) {
        return a.end.line - b.end.line;
    }

    return a.end.character - b.end.character;
}

/**
 * Compares two locations.
 */
export function compareLocations(a: Location, b: Location): number {
    if (a.uri < b.uri) return -1;
    if (a.uri > b.uri) return 1;
    return compareRanges(a.range, b.range);
}

/**
 * Compares two text edits.
 */
export function compareTextEdits(a: TextEdit, b: TextEdit): number {
    if (a.newText < b.newText) return -1;
    if (a.newText > b.newText) return 1;
    return compareRanges(a.range, b.range);
}
