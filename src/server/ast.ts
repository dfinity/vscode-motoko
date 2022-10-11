import { AST } from 'motoko/lib/ast';
import { resolveVirtualPath, tryGetText } from './utils';
import mo from 'motoko';

export interface AstStatus {
    uri: string;
    text: string | null;
    ast?: AST;
    outdated: boolean;
}

export default class AstResolver {
    private _cache = new Map<string, AstStatus>();

    clear() {
        this._cache.clear();
    }

    update(uri: string): boolean {
        const text = tryGetText(uri);
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
            // status.ast = mo.parseMotoko(text);
            status.ast = mo.parseMotokoTyped(resolveVirtualPath(uri)).ast;
            status.outdated = false;
            console.log('Parsed typed AST');
            return true;
        } catch (err) {
            status.outdated = true;
            return false;
        }
    }

    request(uri: string): AstStatus | undefined {
        if (!this._cache.has(uri) && !this.update(uri)) {
            return;
        }
        return this._cache.get(uri);
    }

    delete(uri: string): boolean {
        return this._cache.delete(uri);
    }
}
