import { pascalCase } from 'change-case';
import { MultiMap } from 'mnemonist';
import { AST, Node } from 'motoko/lib/ast';
import { CompletionItemKind } from 'vscode-languageserver/node';
import { Context, getContext } from './context';
import { Import, Program, matchNode } from './syntax';
import { formatMotoko, getRelativeUri } from './utils';

interface ResolvedField {
    name: string;
    visibility: string;
    kind: CompletionItemKind;
    ast: AST;
}

export default class ImportResolver {
    // module name -> uri
    private readonly _moduleNameUriMap = new MultiMap<string, string>(Set);
    // uri -> resolved field
    private readonly _fieldMap = new MultiMap<string, ResolvedField>(Set);
    // import path -> file system uri
    private readonly _fileSystemMap = new Map<string, string>();

    constructor(private readonly context: Context) {}

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
        this._updateFields(uri, program);
        return true;
    }

    _updateFields(uri: string, program: Program | undefined) {
        this._fieldMap.delete(uri);
        program?.exportFields.forEach(({ exp }) => {
            matchNode(
                exp.ast,
                'ObjBlockE',
                (_s: string, _t: string, ...fields: Node[]) =>
                    fields.forEach((field) => {
                        if (field.name !== 'DecField') {
                            console.error(
                                'Error: expected `DecField`, received',
                                field.name,
                            );
                            return;
                        }
                        const [dec, visibility] = field.args!;
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
                                    kind:
                                        exp.name === 'FuncE'
                                            ? CompletionItemKind.Function
                                            : CompletionItemKind.Variable,
                                    ast: exp,
                                });
                            }
                        });
                        matchNode(
                            dec,
                            'ClassD',
                            (_local: string, name: string) => {
                                if (name) {
                                    this._fieldMap.set(uri, {
                                        name,
                                        visibility,
                                        kind: CompletionItemKind.Class,
                                        ast: null,
                                    });
                                }
                            },
                        );
                        matchNode(dec, 'VarD', (name: string, exp: Node) => {
                            if (name) {
                                this._fieldMap.set(uri, {
                                    name,
                                    visibility,
                                    kind: CompletionItemKind.Variable,
                                    ast: exp,
                                });
                            }
                        });
                        matchNode(dec, 'TypD', (name: string, exp: Node) => {
                            if (name) {
                                this._fieldMap.set(uri, {
                                    name,
                                    visibility,
                                    kind: CompletionItemKind.Interface,
                                    ast: exp,
                                });
                            }
                        });
                    }),
            );
        });
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

    getUrisByModuleName(name: string): string[] {
        const uris = [];
        for (const [key, value] of this._moduleNameUriMap.entries()) {
            if (key === name) {
                uris.push(value + '.mo');
            }
        }
        return uris;
    }

    /**
     * Finds all available module-level imports.
     * @returns Array of `[name, path]` entries
     */
    getNameEntries(): [string, string][] {
        return [...this._moduleNameUriMap.entries()];
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
    // Account for `lib.mo` files
    if (uri.endsWith('/lib')) {
        uri = uri.slice(0, -'/lib'.length);
    }
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

const importGroups: {
    prefix: string;
}[] = [
    // IC imports
    { prefix: 'ic:' },
    // Canister alias imports
    { prefix: 'canister:' },
    // Package imports
    { prefix: 'mo:' },
    // Everything else
    { prefix: '' },
];

export function organizeImports(imports: Import[]): string {
    const groupParts: string[][] = importGroups.map(() => []);

    // Combine imports with the same path
    const combinedImports: Record<
        string,
        { names: string[]; fields: [string, string][] }
    > = {};
    imports.forEach((x) => {
        const combined =
            combinedImports[x.path] ||
            (combinedImports[x.path] = { names: [], fields: [] });
        if (x.name) {
            combined.names.push(x.name);
        }
        combined.fields.push(...x.fields);
    });

    // Sort and print imports
    Object.entries(combinedImports)
        .sort(
            // Sort by import path
            (a, b) => a[0].localeCompare(b[0]),
        )
        .forEach(([path, { names, fields }]) => {
            const parts =
                groupParts[
                    importGroups.findIndex((g) => path.startsWith(g.prefix))
                ] || groupParts[groupParts.length - 1];
            names.forEach((name) => {
                parts.push(`import ${name} ${JSON.stringify(path)};`);
            });
            if (fields.length) {
                parts.push(
                    `import { ${fields
                        .sort(
                            // Sort by name, then alias
                            (a, b) =>
                                a[0].localeCompare(b[0]) ||
                                (a[1] || a[0]).localeCompare(b[1] || b[0]),
                        )
                        .map(([name, alias]) =>
                            !alias || name === alias
                                ? name
                                : `${name} = ${alias}`,
                        )
                        .join('; ')} } ${JSON.stringify(path)};`,
                );
            }
        });

    return formatMotoko(groupParts.map((p) => p.join('\n')).join('\n\n'));
}
