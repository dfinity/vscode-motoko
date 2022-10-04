import { AST } from 'motoko/lib/ast';
import { tryGetText } from './utils';
import mo from 'motoko';

export interface AstStatus {
    uri: string;
    text: string | null;
    ast?: AST;
    outdated: boolean;
}

export default class AstProvider {
    private _cache = new Map<string, AstStatus>();

    clear() {
        this._cache.clear();
    }

    update(uri: string): boolean {
        let text = tryGetText(uri);
        if (!text) {
            this.delete(uri);
            return false;
        }
        let status = this._cache.get(uri)!;
        // this._cache.clear();
        if (!status) {
            status = {
                uri,
                text,
                outdated: false,
            };
            this._cache.set(uri, status);
        } else {
            status.text = text;
        }
        try {
            status.ast = mo.parseMotoko(text);
            status.outdated = false;
            return true;
        } catch (err) {
            status.outdated = true;
            return false;
        }
    }

    resolve(uri: string): AstStatus | undefined {
        return this._cache.get(uri);
    }

    delete(uri: string): boolean {
        return this._cache.delete(uri);
    }
}
