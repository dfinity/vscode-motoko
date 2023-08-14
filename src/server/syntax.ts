import { AST, Node } from 'motoko/lib/ast';

export function findNodes(
    ast: AST,
    condition?: (node: Node, parents: Node[]) => any,
): Node[] {
    const nodes: Node[] = [];
    const parents: Node[] = [];
    findNodes_(ast, condition, nodes, parents);
    return nodes;
}

function findNodes_(
    ast: AST,
    condition: ((node: Node, parents: Node[]) => any) | undefined,
    nodes: Node[],
    parents: Node[],
) {
    if (!ast || typeof ast === 'string' || typeof ast === 'number') {
        return;
    }
    if (Array.isArray(ast)) {
        for (let i = 0; i < ast.length; i++) {
            const arg = ast[i];
            findNodes_(arg, condition, nodes, parents);
        }
        return;
    }

    if (condition?.(ast, parents)) {
        nodes.push(ast);
    }
    if (ast.args) {
        parents.push(ast);
        findNodes_(ast.args, condition, nodes, parents);
        if (parents.pop() !== ast) {
            throw new Error('Unexpected parent node in stack');
        }
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
                if (export_) {
                    prog.export = export_;
                    prog.exportFields.push(...getFieldsFromAST(export_));
                }
            }
        }
        return prog;
    } else if (ast.name === 'ObjBlockE' && ast.args) {
        const sort = ast.args[0] as ObjSort;
        const fields = ast.args.slice(1) as Node[];

        const obj = new ObjBlock(ast, sort);
        fields.forEach((field) => {
            if (field.name !== 'DecField') {
                console.error(
                    'Error: expected `DecField`, received',
                    field.name,
                );
                return;
            }
            const [dec, _visibility] = field.args!;
            // if (visibility !== 'Public') {
            //     return;
            // }
            obj.fields.push(...getFieldsFromAST(dec));
        });
        return obj;
    }
    // let dec =
    //     matchNode(ast, 'LetD', (pat: Node, exp: Node) => exp) || // Named
    //     matchNode(ast, 'ExpD', (exp: Node) => exp); // Unnamed
    // if (dec) {
    // }
    return new Syntax(ast);
}

function getFieldsFromAST(ast: AST): Field[] {
    const parts: [Node | undefined, Node] | undefined =
        matchNode(ast, 'LetD', (pat: Node, exp: Node) => [pat, exp]) || // Named
        matchNode(ast, 'ExpD', (exp: Node) => [undefined, exp]); // Unnamed
    if (!parts) {
        return [];
    }
    const [pat, exp] = parts;
    if (pat) {
        // TODO: object patterns
        const fields: [string, Node, Node][] =
            matchNode(pat, 'VarP', (name: string) => [[name, pat, exp]]) || [];
        return fields.map(([name, pat, exp]) => {
            const field = new Field(ast);
            field.name = name;
            field.pat = fromAST(pat);
            field.exp = fromAST(exp);
            return field;
        });
    } else {
        const field = new Field(ast);
        field.exp = fromAST(exp);
        return [field];
    }
}

export function asNode(ast: AST | undefined): Node | undefined {
    return ast && typeof ast === 'object' && !Array.isArray(ast)
        ? ast
        : undefined;
}

export function matchNode<T>(
    ast: AST | undefined,
    name: string,
    fn: (...args: any) => T,
    defaultValue?: T,
): T | undefined {
    if (
        ast &&
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
    export: AST | undefined;
    exportFields: Field[] = [];
}

export type ObjSort = 'Object' | 'Actor' | 'Module' | 'Memory';

export class ObjBlock extends Syntax {
    fields: Field[] = [];

    constructor(ast: AST, public sort: ObjSort) {
        super(ast);
    }
}

export class Field extends Syntax {
    name: string | undefined;
    pat: Syntax | undefined;
    exp: Syntax | undefined;

    constructor(ast: AST) {
        super(ast);
    }
}

export class Import extends Syntax {
    name: string | undefined;
    fields: [string, string][] = []; // [name, alias]

    constructor(ast: AST, public path: string) {
        super(ast);
    }
}

export class Expression extends Syntax {}

export class Type extends Syntax {}
