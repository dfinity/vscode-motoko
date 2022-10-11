import { AST, Node } from 'motoko/lib/ast';

export function findMostSpecificNode(
    ast: AST,
    condition: (node: Node) => any,
): Node | undefined {
    if (
        !ast ||
        Array.isArray(ast) ||
        typeof ast === 'string' ||
        typeof ast === 'number'
    ) {
        return;
    }
    // if (!condition(ast)) {
    //     return;
    // }
    if (ast.args) {
        for (const arg of ast.args) {
            const result = findMostSpecificNode(arg, condition);
            if (result) {
                return result;
            }
        }
    }
    return condition(ast) ? ast : undefined;
    // return ast;
}

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
                    const import_ = new Import(exp, path);
                    // Variable pattern name
                    import_.name = matchNode(pat, 'VarP', (name) => name);
                    // Object pattern fields
                    import_.fields = matchNode(
                        pat,
                        'ObjP',
                        (...args) =>
                            args.map((field: Node & { args: [Node] }) => {
                                const name = field.name;
                                const alias = matchNode(
                                    field.args[0],
                                    'VarP',
                                    (alias) => alias,
                                    name,
                                );
                                return [name, alias];
                            }),
                        [],
                    );
                    prog.imports.push(import_);
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
    defaultValue?: T,
): T | undefined {
    if (
        !!ast &&
        typeof ast === 'object' &&
        !Array.isArray(ast) &&
        ast.name === name
    ) {
        return ast.args ? fn(...ast.args) : fn();
    }
    return defaultValue;
}

export class ASTWrapper {
    ast: AST;

    constructor(ast: AST) {
        this.ast = ast;
    }
}

export class Program extends ASTWrapper {
    imports: Import[] = [];
    export: ASTWrapper | undefined;
}

export class Import extends ASTWrapper {
    name: string | undefined;
    fields: [string, string][] = [];
    path: string;

    constructor(ast: AST, path: string) {
        super(ast);
        this.path = path;
    }
}

export class Expression extends ASTWrapper {}

export class Type extends ASTWrapper {}
