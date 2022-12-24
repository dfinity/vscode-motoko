import { pascalCase } from 'change-case';
import { MultiMap } from 'mnemonist';
import { AST, Node } from 'motoko/lib/ast';
import { Context, getContext } from './context';
import { Program, matchNode } from './syntax';
import { getRelativeUri } from './utils';

interface ResolvedField {
    name: string;
    visibility: string;
    ast: AST;
}

export default class ImportResolver {
    public readonly context: Context;

    // module name -> uri
    private readonly _moduleNameUriMap = new MultiMap<string, string>(Set);
    // uri -> resolved field
    private readonly _fieldMap = new MultiMap<string, ResolvedField>(Set);
    // import path -> file system uri
    private readonly _fileSystemMap = new Map<string, string>();

    constructor(context: Context) {
        this.context = context;
    }

    clear() {
        this._moduleNameUriMap.clear();
    }

    update(uri: string, program: Program | undefined): boolean {
        const info = getImportInfo(uri, this.context);
        if (!info) {
            return false;
        }
        const [name, importUri] = info;
        this._moduleNameUriMap.set(name, importUri);
        this._fileSystemMap.set(importUri, uri);
        if (program?.export) {
            // Resolve field names
            const { ast } = program.export;
            const node =
                matchNode(ast, 'LetD', (_pat: Node, exp: Node) => exp) || // Named
                matchNode(ast, 'ExpD', (exp: Node) => exp); // Unnamed
            if (node) {
                matchNode(
                    node,
                    'ObjBlockE',
                    (_type: string, ...fields: Node[]) => {
                        this._fieldMap.delete(uri);
                        fields.forEach((field) => {
                            if (field.name !== 'DecField') {
                                console.error(
                                    'Error: expected `DecField`, received',
                                    field.name,
                                );
                                return;
                            }
                            const [dec, visibility] = field.args!;
                            // TODO: `system` visibility
                            if (visibility !== 'Public') {
                                return;
                            }
                            matchNode(dec, 'LetD', (pat: Node, exp: Node) => {
                                const name = matchNode(
                                    pat,
                                    'VarP',
                                    (field: string) => field,
                                );
                                if (name) {
                                    this._fieldMap.set(uri, {
                                        name,
                                        visibility,
                                        ast: exp,
                                    });
                                }
                            });
                        });
                    },
                );
            }
        }
        return true;
    }

    delete(uri: string): boolean {
        const info = getImportInfo(uri, this.context);
        if (!info) {
            return false;
        }
        const [, importUri] = info;

        let changed = false;
        for (const key of this._moduleNameUriMap.keys()) {
            if (this._moduleNameUriMap.remove(key, importUri)) {
                changed = true;
            }
        }
        if (this._fieldMap.delete(uri)) {
            changed = true;
        }
        return changed;
    }

    getImportPaths(name: string, uri: string): string[] {
        const options = this._moduleNameUriMap.get(name);
        if (!options) {
            return [];
        }
        return [...options].map((option) => getRelativeUri(uri, option));
    }

    /**
     * Finds all available module-level imports.
     * @returns Array of `[name, path]` entries
     */
    getNameEntries(uri: string): [string, string][] {
        return [...this._moduleNameUriMap.entries()].map(([name, path]) => [
            name,
            getRelativeUri(uri, path),
        ]);
    }

    // /**
    //  * Finds all importable fields.
    //  * @returns Array of `[name, field, path]` entries
    //  */
    // getFieldEntries(uri: string): [ResolvedField, string][] {
    //     return [...this._fieldMap.entries()].map(([path, field]) => [
    //         field,
    //         getRelativeUri(uri, path),
    //     ]);
    // }

    /**
     * Finds all importable fields for a given document.
     * @returns Array of `[name, field, path]` entries
     */
    getFields(uri: string): ResolvedField[] {
        const fields = this._fieldMap.get(uri);
        return fields ? [...fields] : [];
    }

    /**
     * Converts a resolved import path into the corresponding file system URI.
     * @param uri Absolute file import URI (e.g. `mo:package/File`, `canister:alias`, `file:///Lib`)
     */
    getFileSystemURI(path: string): string | undefined {
        return (
            this._fileSystemMap.get(path) ||
            this._fileSystemMap.get(`${path}/lib`)
        );
    }
}

function getImportName(path: string): string {
    if (path.endsWith('/lib')) {
        path = path.slice(-'/lib'.length);
    }
    return pascalCase(/([^/]+)$/i.exec(path)?.[1] || '');
}

function getImportInfo(
    uri: string,
    context: Context,
): [string, string] | undefined {
    if (!uri.endsWith('.mo')) {
        return;
    }
    uri = uri.slice(0, -'.mo'.length);
    // Resolve package import paths
    for (const regex of [
        /\.vessel\/([^\/]+)\/[^\/]+\/src\/(.+)/,
        /\.mops\/([^%\/]+)%40[^\/]+\/src\/(.+)/,
        /\.mops\/_github\/([^%\/]+)%40[^\/]+\/src\/(.+)/,
    ]) {
        const match = regex.exec(uri);
        if (match) {
            if (getContext(uri) !== context) {
                // Skip packages from other contexts
                return;
            }
            const [, name, path] = match;
            if (path === 'lib') {
                // Account for `lib.mo` entry point
                return [getImportName(name), `mo:${name}`];
            } else {
                // Resolve `mo:` URI for Vessel and MOPS packages
                return [getImportName(uri) || name, `mo:${name}/${path}`];
            }
        }
    }
    if (uri.includes('/.vessel/') || uri.includes('/.mops/')) {
        // Ignore everything else in Vessel and MOPS cache directories
        return;
    }
    return [getImportName(uri), uri];
}
