import { MultiMap } from 'mnemonist';
import { getRelativeUri } from './utils';
import { Program } from './program';

export default class ImportResolver {
    private _moduleMap = new MultiMap<string, string>(Set);
    private _fieldMap = new MultiMap<string, string>(Set);

    clear() {
        this._moduleMap.clear();
    }

    // addModule(name: string, uri: string) {
    //     this._moduleMap.set(name, motokoUri);
    // }

    // addField(field: string, uri: string) {
    //     this._fieldMap.set(field, motokoUri);
    // }

    update(uri: string, program: Program | undefined): boolean {
        let motokoUri = getImportUri(uri);
        if (!motokoUri) {
            return false;
        }
        const name = /([a-z_][a-z0-9_]*)$/i.exec(motokoUri)?.[1];
        if (name) {
            this._moduleMap.set(name, motokoUri);
        }
        if (program) {
            if (program.export) {
                console.log(program.export.ast, '\n'); ////
                // this._fieldMap.set(field, motokoUri);
            }
        }
        return true;
    }

    delete(uri: string): boolean {
        let motokoUri = getImportUri(uri);
        if (!motokoUri) {
            return false;
        }

        let changed = false;
        for (const key of this._moduleMap.keys()) {
            if (this._moduleMap.remove(key, motokoUri)) {
                changed = true;
            }
        }
        for (const key of this._fieldMap.keys()) {
            if (this._fieldMap.remove(key, motokoUri)) {
                changed = true;
            }
        }
        return changed;
    }

    getImportPaths(name: string, uri: string): string[] {
        const options = this._moduleMap.get(name);
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
        return [...this._moduleMap.entries()].map(([k, v]) => [
            k,
            getRelativeUri(uri, v),
        ]);
    }

    /**
     * Finds all importable fields.
     * @returns Array of `[name, field, path]` entries
     */
    getFieldEntries(uri: string): [string, string][] {
        return [...this._fieldMap.entries()].map(([k, v]) => [
            k,
            getRelativeUri(uri, v),
        ]);
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
