import MultiMap from 'mnemonist/multi-map';

export default class ImportCache {
    private _lookup = new MultiMap<string, string>(Set);

    _validateUri(uri: any) {
        if (typeof uri !== 'string') {
            throw new Error('URI must be a string');
        }
    }

    clear() {
        this._lookup.clear();
    }

    set(name: string, uri: string) {
        this._validateUri(uri);
        this._lookup.set(name, uri);
    }

    resolve(name: string, uri: string): string[] {
        this._validateUri(uri);
        const options = this._lookup.get(name);
        if (!options) {
            return [];
        }
        return [...options];
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
