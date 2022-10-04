import { MultiMap } from 'mnemonist';

// function validateUri(uri: any) {
//     if (typeof uri !== 'string') {
//         throw new Error('URI must be a string');
//     }
// }

export default class ImportProvider {
    private _lookup = new MultiMap<string, string>(Set);

    clear() {
        this._lookup.clear();
    }

    set(name: string, uri: string) {
        // validateUri(uri);
        this._lookup.set(name, uri);
    }

    getImportPaths(name: string, _uri: string): string[] {
        // validateUri(uri);
        const options = this._lookup.get(name);
        if (!options) {
            return [];
        }
        return [...options];
    }

    /**
     * Finds all available module-level imports.
     * @returns Array of `[name, path]` entries
     */
    getModuleEntries(_uri: string): [string, string][] {
        return [...this._lookup.entries()];
    }

    /**
     * Finds all importable fields.
     * @returns Array of `[name, field, path]` entries
     */
    getFieldEntries(_uri: string): [string, string, string][] {
        // return [...this._lookup.entries()];
    }

    delete(uri: string): boolean {
        let changed = false;
        for (const key of this._lookup.keys()) {
            if (this._lookup.remove(key, uri)) {
                changed = true;
            }
        }
        return changed;
    }
}
