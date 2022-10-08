import { AST } from 'motoko/lib/ast';

export function fromAST(ast: AST): ASTWrapper {
    if (
        !ast ||
        Array.isArray(ast) ||
        typeof ast === 'string' ||
        typeof ast === 'number'
    ) {
        return new ASTWrapper(ast);
    } else if (ast.name === 'Prog') {
        const prog = new Program(ast);
        ast.args?.forEach((a) => {
            matchNode(a, 'LetD', (pat, exp) => {
                matchNode(exp, 'ImportE', (path) => {
                    console.log(pat, exp, path); ////
                });
            });
        });
        return prog;
    } else {
        return new ASTWrapper(ast);
    }
}

function matchNode<T>(
    ast: AST,
    name: string,
    fn: (...args: any) => T,
): T | undefined {
    if (
        !!ast &&
        typeof ast === 'object' &&
        !Array.isArray(ast) &&
        ast.name === name
    ) {
        return ast.args ? fn(...ast.args) : fn();
    }
    return;
}

export class ASTWrapper {
    ast: AST;

    constructor(ast: AST) {
        this.ast = ast;
    }
}

export class Program extends ASTWrapper {
    imports: Import[] = [];
    types: Type[] = [];
}

export class Import extends ASTWrapper {
    name: string | undefined;
    aliases: [string, string][] = [];
    path: string;

    constructor(ast: AST, path: string) {
        super(ast);
        this.path = path;
    }
}

export class Expression extends ASTWrapper {}

export class Type extends ASTWrapper {}
