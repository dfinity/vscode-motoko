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
    } else if (ast.name === 'AwaitE') {
        const exp = ast.args![0];
        return (
            matchNode(exp, 'AsyncE', (_id: Node, exp: Node) => fromAST(exp)) ||
            new Syntax(exp)
        );
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
                    prog.export = fromAST(export_);
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
                    'Error: expected object with `name: "DecField"`, received',
                    field,
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
    return new Syntax(ast);
}

function getFieldsFromAST(ast: AST): Field[] {
    const simplyNamedFields =
        matchNode(ast, 'TypD', (name: string, type: Node) => {
            const field = new Field(ast, new Type(type));
            field.name = name;
            return [field];
        }) ||
        matchNode(ast, 'VarD', (name: string, exp: Node) => {
            const field = new Field(ast, new Type(exp));
            field.name = name;
            return [field];
        }) ||
        matchNode(
            ast,
            'ClassD',
            (_sharedPat: any, name: string, ...args: any[]) => {
                let index = args.length - 1;
                while (index >= 0 && typeof args[index] !== 'string') {
                    index--;
                }
                index -= 3; // [pat, returnType, sort]
                if (index < 0) {
                    console.warn('Unexpected `ClassD` AST format');
                    return [];
                }
                // const typeBinds = args.slice(0, index) as Node[];
                const [_pat, _returnType, sort, _id, ...decs] = args.slice(
                    index,
                ) as [Node, Node, ObjSort, string, ...Node[]];

                const cls = new Class(ast, name, sort);
                decs.forEach((ast) => {
                    matchNode(ast, 'DecField', (dec: Node) => {
                        cls.fields.push(...getFieldsFromAST(dec));
                    });
                });
                const field = new Field(ast, cls);
                field.name = name;
                return [field];
            },
        );
    if (simplyNamedFields) {
        return simplyNamedFields;
    }
    const parts: [Node | undefined, Node] | undefined =
        matchNode(ast, 'LetD', (pat: Node, exp: Node) => [pat, exp]) || // Named
        matchNode(ast, 'ExpD', (exp: Node) => [undefined, exp]); // Unnamed
    if (!parts) {
        return [];
    }
    const [pat, exp] = parts;
    if (pat) {
        const fields: [string, Node, Node][] = [];
        findInPattern(pat, (name, pat) => {
            fields.push([name, pat, exp]);
        });
        return fields.map(([name, pat, exp]) => {
            const field = new Field(ast, fromAST(exp));
            field.name = name;
            field.pat = fromAST(pat);
            return field;
        });
    } else {
        const field = new Field(ast, fromAST(exp));
        return [field];
    }
}

export function findInPattern<T>(
    pat: Node,
    fn: (name: string, pat: Node) => T | undefined,
): T | undefined {
    const matchAny = (...args: Node[]) => {
        for (const field of args) {
            const result = findInPattern(field, fn);
            if (result !== undefined) {
                return result;
            }
        }
        return;
    };
    const match = (arg: Node) => findInPattern(arg, fn);
    return (
        matchNode(pat, 'VarP', (name: string) => fn(name, pat)) ||
        matchNode(pat, 'ObjP', (...args: Node[]) => {
            for (const field of args) {
                const fieldPat = field.args![0] as Node;
                const result = findInPattern(fieldPat, fn);
                if (result !== undefined) {
                    return result;
                }
            }
            return;
        }) ||
        matchNode(pat, 'TupP', matchAny) ||
        matchNode(pat, 'AltP', matchAny) ||
        matchNode(pat, 'AnnotP', match) ||
        matchNode(pat, 'ParP', match) ||
        matchNode(pat, 'OptP', match) ||
        matchNode(pat, 'TagP', (_tag, arg: Node) => match(arg))
    );
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
): T | undefined;
export function matchNode<T>(
    ast: AST | undefined,
    name: string,
    fn: (...args: any) => T,
    defaultValue: T,
): T;
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
    export: Syntax | undefined;
    exportFields: Field[] = [];
}

export abstract class SyntaxWithFields extends Syntax {
    fields: Field[] = [];
}

export type ObjSort = 'Object' | 'Actor' | 'Module' | 'Memory';

export class ObjBlock extends SyntaxWithFields {
    constructor(ast: AST, public sort: ObjSort) {
        super(ast);
    }
}

export class Class extends SyntaxWithFields {
    constructor(ast: AST, public name: string, public sort: ObjSort) {
        super(ast);
    }
}

export class Field extends Syntax {
    name: string | undefined;
    pat: Syntax | undefined;

    constructor(ast: AST, public exp: Syntax) {
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

export class Type extends Syntax {}
