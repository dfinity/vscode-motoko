import { AST } from 'motoko/lib/ast';
import { resolveVirtualPath, tryGetFileText } from './utils';
import { fromAST, Program } from './syntax';
import mo from 'motoko';

export interface AstStatus {
    uri: string;
    text: string | null;
    ast?: AST;
    program?: Program;
    outdated: boolean;
}

export default class AstResolver {
    private _cache = new Map<string, AstStatus>();
    private _typedCache = new Map<string, AstStatus>();

    clear() {
        this._cache.clear();
        this._typedCache.clear();
    }

    update(uri: string, typed: boolean): boolean {
        const text = tryGetFileText(uri);
        if (!text) {
            this.delete(uri);
            return false;
        }
        return this._updateWithFileText(uri, text, typed);
    }

    private _updateWithFileText(
        uri: string,
        text: string,
        typed: boolean,
    ): boolean {
        const cache = typed ? this._typedCache : this._cache;
        let status = cache.get(uri)!;
        // this._cache.clear();
        if (!status) {
            status = {
                uri,
                text,
                outdated: false,
            };
            cache.set(uri, status);
        } else {
            status.text = text;
        }
        try {
            const ast = typed
                ? mo.parseMotokoTyped(resolveVirtualPath(uri)).ast
                : mo.parseMotoko(text);
            status.ast = ast;
            const program = fromAST(ast);
            if (program instanceof Program) {
                status.program = program;
            }
            status.outdated = false;
            if (typed) {
                console.log('Parsed typed AST');
            }
            return true;
        } catch (err) {
            status.outdated = true;
            return false;
        }
    }

    request(uri: string): AstStatus | undefined {
        const status = this._cache.get(uri);
        if ((!status || status.outdated) && !this.update(uri, false)) {
            return;
        }
        return this._cache.get(uri);
    }

    requestTyped(uri: string): AstStatus | undefined {
        const status = this._typedCache.get(uri);
        if ((!status || status.outdated) && !this.update(uri, true)) {
            return;
        }
        return this._typedCache.get(uri);
    }

    notify(uri: string, source: string) {
        // const status = this._cache.get(uri);
        // if (status) {
        //     status.outdated = true;
        // }
        const typedStatus = this._typedCache.get(uri);
        if (typedStatus) {
            typedStatus.outdated = true;
        }
        this._updateWithFileText(uri, source, false);
    }

    delete(uri: string): boolean {
        let deleted = this._cache.delete(uri);
        let deletedTyped = this._typedCache.delete(uri);
        return deleted || deletedTyped;
    }
}
