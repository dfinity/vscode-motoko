import { AST } from 'motoko/lib/ast';
import { Scope } from 'motoko/lib/file';
import DepGraph from './depgraph';
import { Context } from './context';
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

export const globalASTCache = new Map<string, AstStatus>(); // Share non-typed ASTs across all contexts

// When using the functions in this class, consider the invariant that the file
// loaded by a given URI should be written to the virtual filesystem, as well as
// all of its dependencies. If the virtual filesystem is not ready, then
// `withDeps` should be false. Requesting the typed AST always does dependency
// analysis.
export default class AstResolver {
    private readonly _cache = globalASTCache;
    private readonly _typedCache = new Map<string, AstStatus>();
    private readonly _depGraph = new DepGraph();

    private _scopeCache = new Map<string, Scope>();

    constructor(private readonly context: Context) {}

    clear() {
        this._cache.clear();
        this._typedCache.clear();
        this._depGraph.clear();
        this._scopeCache.clear();
    }

    update(uri: string, typed: boolean, withDeps: boolean): boolean {
        const text = tryGetFileText(uri);
        if (!text) {
            this.delete(uri);
            return true;
        }
        return this._updateWithFileText(uri, text, typed, withDeps);
    }

    private _updateWithFileText(
        uri: string,
        text: string,
        typed: boolean,
        withDeps: boolean,
    ): boolean {
        const cache = typed ? this._typedCache : this._cache;
        let status = cache.get(uri);
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

        const virtualPath = resolveVirtualPath(uri);

        // Invalidate file and its dependents, remove edges to dependencies to
        // relink them later
        this._scopeCache.delete(virtualPath);
        this._depGraph.add(virtualPath);
        for (const file of this._depGraph.transitiveDependents(virtualPath)) {
            this._scopeCache.delete(file);
        }
        this._depGraph.removeImmediateDependencies(virtualPath);

        try {
            const { motoko } = this.context;
            let ast: AST;
            let immediateImports: string[];
            try {
                if (typed) {
                    const [prog, scopeCache] = motoko.parseMotokoTyped(
                        virtualPath,
                        this._scopeCache,
                    );
                    ast = prog.ast;
                    immediateImports = prog.immediateImports;
                    this._scopeCache = scopeCache;
                } else if (withDeps) {
                    try {
                        const prog = motoko.parseMotokoWithDeps(
                            virtualPath,
                            text,
                        );
                        ast = prog.ast;
                        immediateImports = prog.immediateImports;
                    } catch (err) {
                        console.error(
                            'Error while parsing Motoko with deps, retrying',
                        );
                        console.error(err);
                        const prog = motoko.parseMotoko(text);
                        ast = prog;
                        immediateImports = [];
                    }
                } else {
                    const prog = motoko.parseMotoko(text);
                    ast = prog;
                    immediateImports = [];
                }
            } catch (err) {
                throw new SyntaxError(String(err));
            }
            this._depGraph.addImmediateImports(virtualPath, immediateImports);
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
            if (err instanceof SyntaxError) {
                console.error(`Error while parsing AST for ${uri}:`);
                console.error(err);
            }
            status.outdated = true;
            return false;
        }
    }

    request(uri: string, withDeps: boolean): AstStatus | undefined {
        const status = this._cache.get(uri);
        if (
            (!status || status.outdated) &&
            !this.update(uri, false, withDeps)
        ) {
            return status;
        }
        return this._cache.get(uri);
    }

    requestTyped(uri: string): AstStatus | undefined {
        const status = this._typedCache.get(uri);
        if ((!status || status.outdated) && !this.update(uri, true, true)) {
            return status;
        }
        return this._typedCache.get(uri);
    }

    notify(uri: string, source: string, withDeps: boolean) {
        // const status = this._cache.get(uri);
        // if (status) {
        //     status.outdated = true;
        // }
        const typedStatus = this._typedCache.get(uri);
        if (typedStatus) {
            typedStatus.outdated = true;
        }
        this._updateWithFileText(uri, source, false, withDeps);
    }

    delete(uri: string): boolean {
        const deleted = this._cache.delete(uri);
        const deletedTyped = this._typedCache.delete(uri);
        const deletedGraph = this._depGraph.delete(uri);
        const deletedCache = this._scopeCache.delete(uri);
        return deleted || deletedTyped || deletedGraph || deletedCache;
    }

    getDependencyGraph(): DepGraph {
        return this._depGraph;
    }
}
