import motoko from './motoko';
import { Field, ObjBlock, Program, Syntax, fromAST } from './syntax';

/* eslint jest/expect-expect: ["off", { "assertFunctionNames": ["expect"] }] */

const parse = (source: string): Program => {
    const ast = motoko.parseMotoko(source);
    const prog = fromAST(ast) as Program;
    expect(prog).toBeInstanceOf(Program);
    return prog;
};

const expectFields = (
    fields: Field[],
    expected: (string | undefined)[],
): void => {
    expect(fields.map((f) => f.name)).toStrictEqual(expected);
};

const expectObjFields = (
    syntax: Syntax,
    expected: (string | undefined)[],
): ObjBlock => {
    const obj = syntax as ObjBlock;
    expect(obj).toBeInstanceOf(ObjBlock);
    expectFields(obj.fields, expected);
    return obj;
};

describe('syntax', () => {
    test('let field', () => {
        const prog = parse('module { let x = 0; }');
        expectObjFields(prog.exportFields[0].exp, ['x']);
    });
    test('public let field', () => {
        const prog = parse('module { public let x = 0; }');
        expectObjFields(prog.exportFields[0].exp, ['x']);
    });
    test('var field', () => {
        const prog = parse('module { var y = 1; }');
        expectObjFields(prog.exportFields[0].exp, ['y']);
    });
    test('type field', () => {
        const prog = parse('module { type T = Nat; }');
        expectObjFields(prog.exportFields[0].exp, ['T']);
    });
    test('multiple fields', () => {
        const prog = parse('module { let x = 0; var y = 1; type T = Nat; }');
        expectObjFields(prog.exportFields[0].exp, ['x', 'y', 'T']);
    });
    test('named actor', () => {
        const prog = parse('actor A { let x = 0; }');
        expectFields(prog.exportFields, ['A']);
        expectObjFields(prog.exportFields[0].exp, ['x']);
    });
    test('unnamed actor', () => {
        const prog = parse('actor { let x = 0; }');
        expectFields(prog.exportFields, [undefined]);
        expectObjFields(prog.exportFields[0].exp, ['x']);
    });
    test('named class', () => {
        const prog = parse('class C() { let x = 0; }');
        expectFields(prog.exportFields, ['C']);
        expectObjFields(prog.exportFields[0].exp, ['x']);
    });
    test('named actor class', () => {
        const prog = parse('actor class C() { stable var y = 1; }');
        expectFields(prog.exportFields, ['C']);
        expectObjFields(prog.exportFields[0].exp, ['y']);
    });
    test('named module', () => {
        const prog = parse('module M { let x = 0; }');
        expectFields(prog.exportFields, ['M']);
        expectObjFields(prog.exportFields[0].exp, ['x']);
    });
    test('unnamed module', () => {
        const prog = parse('module { let x = 0; }');
        expectFields(prog.exportFields, [undefined]);
        expectObjFields(prog.exportFields[0].exp, ['x']);
    });
    test('nested module', () => {
        const prog = parse('module M { module N { let x = 0; } }');
        expectFields(prog.exportFields, ['M']);
        const mod = expectObjFields(prog.exportFields[0].exp, ['N']);
        expectObjFields(mod.fields[0].exp, ['x']);
    });
    test('nested unnamed module', () => {
        const prog = parse('module { module { let x = 0; } }');
        expectFields(prog.exportFields, [undefined]);
        const mod = expectObjFields(prog.exportFields[0].exp, [undefined]);
        expectObjFields(mod.fields[0].exp, ['x']);
    });
});
