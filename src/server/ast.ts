import { AST } from 'motoko/lib/ast';
import { getContext } from './context';
import { Program, fromAST } from './syntax';
import { resolveVirtualPath, tryGetFileText } from './utils';

export interface AstStatus {
    uri: string;
    text: string | null;
    ast?: AST;
    program?: Program;
    outdated: boolean;
}

export interface AstImport {
    path: string;
    field?: string;
}

const globalCache = new Map<string, AstStatus>(); // Share non-typed ASTs across all contexts

export default class AstResolver {
    private readonly _cache = globalCache;
    private readonly _typedCache = new Map<string, AstStatus>();

    clear() {
        this._cache.clear();
        this._typedCache.clear();
    }

    update(uri: string, typed: boolean): boolean {
        const text = tryGetFileText(uri);
        if (!text) {
            this.delete(uri);
            return true;
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
            const { motoko } = getContext(uri);
            const virtualPath = resolveVirtualPath(uri);
            let ast: AST;
            try {
                ast = typed
                    ? motoko.parseMotokoTyped(virtualPath).ast
                    : motoko.parseMotoko(text);
            } catch (err) {
                throw new SyntaxError(String(err));
            }
            status.ast = ast;
            const program = fromAST(ast);
            if (program instanceof Program) {
                status.program = program;
            } else {
                console.log(`Unexpected AST node for URI: ${uri}`);
                console.log(ast);
            }
            status.outdated = false;
            if (typed) {
                console.log('Parsed typed AST');
            }
            return true;
        } catch (err) {
            if (!(err instanceof SyntaxError)) {
                console.error(`Error while parsing AST for ${uri}:`);
                console.error(err);
            }
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
        const deleted = this._cache.delete(uri);
        const deletedTyped = this._typedCache.delete(uri);
        return deleted || deletedTyped;
    }
}
