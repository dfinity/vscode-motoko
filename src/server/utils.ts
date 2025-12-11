import { readFileSync, readdirSync, createWriteStream, existsSync } from 'fs';
import { unlink } from 'fs/promises';
import { join, sep, basename } from 'path';
import * as motokoPlugin from 'prettier-plugin-motoko';
import * as prettier from 'prettier/standalone';
import {
    Location,
    Position,
    Range,
    TextEdit,
} from 'vscode-languageserver/node';
import { URI, Utils } from 'vscode-uri';
import { Result, ResultAsync, err, ok, okAsync, errAsync } from 'neverthrow';
import axios from 'axios';
import execa = require('execa');
import * as toml from '@iarna/toml';

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

export function extractMocVersion(filename: string): string | undefined {
    const versionRegex = /^moc-(.+)\.js$/;
    const res = filename.match(versionRegex);
    if (res && res[1]) {
        return res[1];
    }
    return;
}

/**
 * Attempts to determine the Motoko compiler (moc) version used in the project.
 *
 * The function first tries to get the moc version from mops toolchain.
 * If that fails, it falls back to using the moc binary from the dfx cache.
 *
 * @returns {ResultAsync<string, Error>} - The detected moc version or an error.
 */
export function getWorkspaceMocVersion(
    workspaceDir: string,
): ResultAsync<string, Error> {
    function getMocVersion(mocPath: string): ResultAsync<string, Error> {
        return ResultAsync.fromThrowable(
            () => execa(mocPath, ['--version']),
            (e) => (e instanceof Error ? e : new Error(String(e))),
        )()
            .map((r) => (r as any).stdout.trim())
            .andThen((out) => {
                // Improved regex: matches e.g. "moc 0.10.2" or "Motoko compiler 0.10.2"
                const m = out.match(/[0-9]+\.[0-9]+\.[0-9]+/);
                return m
                    ? okAsync(m[0])
                    : errAsync(
                          Error('Unexpected moc --version output: ' + out),
                      );
            });
    }

    function getDfxCachePath(): ResultAsync<string, Error> {
        return ResultAsync.fromThrowable(
            () => execa('dfx', ['cache', 'show']),
            (e) => (e instanceof Error ? e : new Error(String(e))),
        )().map((r) => (r as any).stdout.trim());
    }

    function getMopsMocVersion(): ResultAsync<string, Error> {
        try {
            const content = readFileSync(
                join(workspaceDir, 'mops.toml'),
                'utf8',
            );
            const config = toml.parse(content) as any;
            return config?.toolchain?.moc
                ? okAsync(config.toolchain.moc)
                : errAsync(
                      Error(
                          'Moc is not specified in mops.toml toolchain section',
                      ),
                  );
        } catch (e) {
            return errAsync(
                Error(
                    'Failed to read mops.toml: ' +
                        (e instanceof Error ? e.message : String(e)),
                ),
            );
        }
    }

    return getMopsMocVersion().orElse(() =>
        getDfxCachePath().andThen((path) => getMocVersion(join(path, 'moc'))),
    );
}

/**
 * Returns path to relevant moc.js downloading required version from the Motoko
 * GitHub releases if needed.
 *
 * @param version - The Motoko version (e.g., "0.15.0").
 * @param destDir - Directory to save moc.js.
 * @returns ResultAsync<string, Error> - Ok(path) if successful, Err(error) if failed.
 */
export function getMocJs(
    version: string,
    destDir: string,
): ResultAsync<string, Error> {
    const destPath = join(destDir, `moc-${version}.js`);
    if (existsSync(destPath)) {
        console.log(`moc-${version}.js already exixts. Won't download.`);
        return okAsync(destPath);
    }
    console.log(`Downloading moc-${version}.js`);
    const url = `https://github.com/dfinity/motoko/releases/download/${version}/moc-${version}.js`;

    return ResultAsync.fromPromise(
        axios.get(url, { responseType: 'stream' }),
        (e) => (e instanceof Error ? e : new Error(String(e))),
    )
        .andThen((response) =>
            ResultAsync.fromPromise(
                new Promise<void>((resolve, reject) => {
                    const writer = createWriteStream(destPath);
                    response.data.pipe(writer);
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                }),
                (e) => (e instanceof Error ? e : new Error(String(e))),
            ),
        )
        .andThen(() => removeOldMocVersions(destDir))
        .map(() => destPath);
}

/**
 * Compares two semantic version strings in the format "major.minor.patch".
 * Returns 1 if vstr1 > vstr2, -1 if vstr1 < vstr2, and 0 if they are equal.
 * If a version string is invalid, it is treated as "0.0.0".
 *
 * @param vstr1 - The first version string to compare.
 * @param vstr2 - The second version string to compare.
 * @returns 1 if vstr1 is greater, -1 if less, 0 if equal.
 */
function compareVersions(vstr1: string, vstr2: string): number {
    function splitVersionString(
        verStr: string,
    ): Result<[number, number, number], Error> {
        const nums = verStr.split('.').map((s) => parseInt(s, 10));
        return nums.length !== 3 || nums.some((n) => Number.isNaN(n))
            ? err(new Error(`Invalid version string: ${verStr}`))
            : ok(nums as [number, number, number]);
    }
    const [major1, minor1, patch1] = splitVersionString(vstr1).unwrapOr([
        0, 0, 0,
    ]);
    const [major2, minor2, patch2] = splitVersionString(vstr2).unwrapOr([
        0, 0, 0,
    ]);
    if (major1 > major2) return 1;
    if (major1 < major2) return -1;
    if (minor1 > minor2) return 1;
    if (minor1 < minor2) return -1;
    if (patch1 > patch2) return 1;
    if (patch1 < patch2) return -1;
    return 0;
}

/**
 * Removes old versions of the 'moc' binary from the specified directory,
 * keeping only the 5 most recent versions.
 *
 * The function sorts files in the directory by their version (extracted
 * from the filename), deletes the oldest files if there are more than 5,
 * and returns a ResultAsync containing the list of deleted filenames. If
 * there are 5 or fewer files, it returns an empty array.
 *
 * @param path - The directory containing 'moc' binary versions.
 * @returns ResultAsync<string[], Error> - A ResultAsync resolving to the
 * list of deleted filenames, or an error.
 */
function removeOldMocVersions(path: string): ResultAsync<string[], Error> {
    function extractVersion(filename: string): string {
        return basename(filename).split('-')[1];
    }
    const files = readdirSync(path);
    if (files.length > 5) {
        files.sort((a, b) => {
            const verA = extractVersion(a);
            const verB = extractVersion(b);
            return compareVersions(verA, verB);
        });
        const toRemove = files.slice(0, files.length - 5);
        return ResultAsync.fromPromise(
            Promise.all(
                toRemove.map((f) => unlink(join(path, f)).then(() => f)),
            ),
            (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
        );
    }
    return okAsync([]);
}
