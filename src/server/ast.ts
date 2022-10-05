import { AST } from 'motoko/lib/ast';
import { tryGetText } from './utils';
import mo from 'motoko';

export interface AstStatus {
    uri: string;
    text: string | null;
    ast?: AST;
    outdated: boolean;
}

export default class AstResolver {
    private cache_ = new Map<string, AstStatus>();

    clear() {
        this.cache_.clear();
    }

    update(uri: string): boolean {
        let text = tryGetText(uri);
        if (!text) {
            this.delete(uri);
            return false;
        }
        let status = this.cache_.get(uri)!;
        // this._cache.clear();
        if (!status) {
            status = {
                uri,
                text,
                outdated: false,
            };
            this.cache_.set(uri, status);
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
        return this.cache_.get(uri);
    }

    delete(uri: string): boolean {
        return this.cache_.delete(uri);
    }
}
