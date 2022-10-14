import { MultiMap } from 'mnemonist';
import { getRelativeUri } from './utils';
import { matchNode, Program } from './syntax';
import { Node, AST } from 'motoko/lib/ast';
import { pascalCase } from 'change-case';

interface ResolvedField {
    name: string;
    visibility: string;
    ast: AST;
}

export default class ImportResolver {
    // (module name -> uri)
    private _moduleNameUriMap = new MultiMap<string, string>(Set);
    // (uri -> resolved field)
    private _fieldMap = new MultiMap<string, ResolvedField>(Set);

    clear() {
        this._moduleNameUriMap.clear();
    }

    update(uri: string, program: Program | undefined): boolean {
        const motokoUri = getImportUri(uri);
        if (!motokoUri) {
            return false;
        }
        const name = pascalCase(/([^/]+)$/i.exec(motokoUri)?.[1]||'');
        if (name) {
            this._moduleNameUriMap.set(name, motokoUri);
        }
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
        const motokoUri = getImportUri(uri);
        if (!motokoUri) {
            return false;
        }

        let changed = false;
        for (const key of this._moduleNameUriMap.keys()) {
            if (this._moduleNameUriMap.remove(key, motokoUri)) {
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
}

function getImportUri(uri: string): string | undefined {
    if (!uri.endsWith('.mo')) {
        return;
    }
    uri = uri.slice(0, -'.mo'.length);
    const match = /\.vessel\/([^/]+)\/[^/]+\/src\/(.+)/.exec(uri);
    if (match) {
        // Resolve `mo:` URI for Vessel packages
        const [, pkgName, path] = match;
        uri = `mo:${pkgName}/${path}`;
    } else if (/\.vessel\//.test(uri)) {
        // Ignore everything else in `.vessel`
        return;
    }
    return uri;
}
