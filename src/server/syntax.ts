import { AST, Node } from 'motoko/lib/ast';

export function findNodes(ast: AST, condition?: (node: Node) => any): Node[] {
    const nodes: Node[] = [];
    findNodes_(ast, condition, nodes);
    return nodes;
}

function findNodes_(
    ast: AST,
    condition: ((node: Node) => any) | undefined,
    nodes: Node[] = [],
) {
    if (!ast || typeof ast === 'string' || typeof ast === 'number') {
        return;
    }
    if (Array.isArray(ast)) {
        for (let i = 0; i < ast.length; i++) {
            const arg = ast[i];
            findNodes_(arg, condition, nodes);
        }
        return;
    }

    if (condition?.(ast)) {
        nodes.push(ast);
    }
    if (ast.args) {
        findNodes_(ast.args, condition, nodes);
    }
}

export function fromAST(ast: AST): Syntax {
    if (
        !ast ||
        Array.isArray(ast) ||
        typeof ast === 'string' ||
        typeof ast === 'number'
    ) {
        return new Syntax(ast);
    } else if (ast.name === 'Prog') {
        const prog = new Program(ast);
        if (ast.args) {
            ast.args.forEach((a) => {
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
            if (ast.args.length) {
                const export_ = ast.args[ast.args.length - 1];
                prog.export = fromAST(export_);
            }
        }
        return prog;
    } else {
        return new Syntax(ast);
    }
}

export function matchNode<T>(
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

export class Syntax {
    ast: AST;

    constructor(ast: AST) {
        this.ast = ast;
    }
}

export class Program extends Syntax {
    imports: Import[] = [];
    export: Syntax | undefined;
}

export class Import extends Syntax {
    name: string | undefined;
    fields: [string, string][] = []; // [name, alias]
    path: string;

    constructor(ast: AST, path: string) {
        super(ast);
        this.path = path;
    }
}

export class Expression extends Syntax {}

export class Type extends Syntax {}
