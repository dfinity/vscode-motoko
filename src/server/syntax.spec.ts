import motoko from './motoko';
import { Field, Program, Syntax, SyntaxWithFields, fromAST } from './syntax';

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

const expectWithFields = (
    syntax: Syntax,
    expected: (string | undefined)[],
): Field[] => {
    const obj = syntax as SyntaxWithFields;
    expect(obj).toBeInstanceOf(SyntaxWithFields);
    expectFields(obj.fields, expected);
    return obj.fields;
};

describe('syntax', () => {
    test('let field', () => {
        const prog = parse('module { let x = 0; }');
        expectWithFields(prog.exportFields[0].exp, ['x']);
    });
    test('public let field', () => {
        const prog = parse('module { public let x = 0; }');
        expectWithFields(prog.exportFields[0].exp, ['x']);
    });
    test('var field', () => {
        const prog = parse('module { var y = 1; }');
        expectWithFields(prog.exportFields[0].exp, ['y']);
    });
    test('type field', () => {
        const prog = parse('module { type T = Nat; }');
        expectWithFields(prog.exportFields[0].exp, ['T']);
    });
    test('multiple fields', () => {
        const prog = parse('module { let x = 0; var y = 1; type T = Nat; }');
        expectWithFields(prog.exportFields[0].exp, ['x', 'y', 'T']);
    });
    test('named actor', () => {
        const prog = parse('actor A { let x = 0; }');
        expectFields(prog.exportFields, ['A']);
        expectWithFields(prog.exportFields[0].exp, ['x']);
    });
    test('unnamed actor', () => {
        const prog = parse('actor { let x = 0; }');
        expectFields(prog.exportFields, [undefined]);
        expectWithFields(prog.exportFields[0].exp, ['x']);
    });
    test('named class', () => {
        const prog = parse('class C() { let x = 0; }');
        expectFields(prog.exportFields, ['C']);
        expectWithFields(prog.exportFields[0].exp, ['x']);
    });
    test('named actor class', () => {
        const prog = parse('actor class C() { stable var y = 1; }');
        expectFields(prog.exportFields, ['C']);
        expectWithFields(prog.exportFields[0].exp, ['y']);
    });
    test('named module', () => {
        const prog = parse('module M { let x = 0; }');
        expectFields(prog.exportFields, ['M']);
        expectWithFields(prog.exportFields[0].exp, ['x']);
    });
    test('unnamed module', () => {
        const prog = parse('module { let x = 0; }');
        expectFields(prog.exportFields, [undefined]);
        expectWithFields(prog.exportFields[0].exp, ['x']);
    });
    test('nested module', () => {
        const prog = parse('module M { module N { let x = 0; } }');
        expectFields(prog.exportFields, ['M']);
        const fields = expectWithFields(prog.exportFields[0].exp, ['N']);
        expectWithFields(fields[0].exp, ['x']);
    });
    test('nested unnamed module', () => {
        const prog = parse('module { module { let x = 0; } }');
        expectFields(prog.exportFields, [undefined]);
        const fields = expectWithFields(prog.exportFields[0].exp, [undefined]);
        expectWithFields(fields[0].exp, ['x']);
    });
});
