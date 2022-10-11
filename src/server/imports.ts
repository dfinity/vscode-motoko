import { MultiMap } from 'mnemonist';

export default class ImportResolver {
    private moduleMap_ = new MultiMap<string, string>(Set);

    clear() {
        this.moduleMap_.clear();
    }

    addModule(name: string, uri: string) {
        this.moduleMap_.set(name, uri);
    }

    // addField(name: string, alias: string, uri: string) {
    //     return; ////
    // }

    getImportPaths(name: string, _uri: string): string[] {
        const options = this.moduleMap_.get(name);
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
        return [...this.moduleMap_.entries()];
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
        for (const key of this.moduleMap_.keys()) {
            if (this.moduleMap_.remove(key, uri)) {
                changed = true;
            }
        }
        return changed;
    }
}
