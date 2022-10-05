import { MultiMap } from 'mnemonist';

// function validateUri(uri: any) {
//     if (typeof uri !== 'string') {
//         throw new Error('URI must be a string');
//     }
// }

export default class ImportResolver {
    private lookup_ = new MultiMap<string, string>(Set);

    clear() {
        this.lookup_.clear();
    }

    set(name: string, uri: string) {
        // validateUri(uri);
        this.lookup_.set(name, uri);
    }

    getImportPaths(name: string, _uri: string): string[] {
        // validateUri(uri);
        const options = this.lookup_.get(name);
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
        return [...this.lookup_.entries()];
    }

    /**
     * Finds all importable fields.
     * @returns Array of `[name, field, path]` entries
     */
    getFieldEntries(_uri: string): [string, string, string][] {
        // return [...this._lookup.entries()];
        return [];
    }

    delete(uri: string): boolean {
        let changed = false;
        for (const key of this.lookup_.keys()) {
            if (this.lookup_.remove(key, uri)) {
                changed = true;
            }
        }
        return changed;
    }
}
