import motoko from './motoko';
import { ObjBlock, Program, fromAST } from './syntax';

describe('syntax', () => {
    test('let field', () => {
        const ast = motoko.parseMotoko('module { let x = 0; }');
        const prog = fromAST(ast) as Program;
        expect(prog).toBeInstanceOf(Program);
        expect(prog.exportFields).toHaveLength(1);
        expect(prog.exportFields[0].name).toStrictEqual('x');
    });
    test('public let field', () => {
        const ast = motoko.parseMotoko('module { public let x = 0; }');
        const prog = fromAST(ast) as Program;
        expect(prog).toBeInstanceOf(Program);
        expect(prog.exportFields).toHaveLength(1);
        expect(prog.exportFields[0].name).toStrictEqual('x');
    });
    test('var field', () => {
        const ast = motoko.parseMotoko('module { var y = 1; }');
        const prog = fromAST(ast) as Program;
        expect(prog).toBeInstanceOf(Program);
        expect(prog.exportFields).toHaveLength(1);
        expect(prog.exportFields[0].name).toStrictEqual('y');
    });
    test('type field', () => {
        const ast = motoko.parseMotoko('module { type T = Nat; }');
        const prog = fromAST(ast) as Program;
        expect(prog).toBeInstanceOf(Program);
        expect(prog.exportFields).toHaveLength(1);
        expect(prog.exportFields[0].name).toStrictEqual('T');
    });
    test('multiple fields', () => {
        const ast = motoko.parseMotoko(
            'module { let x = 0; var y = 1; type T = Nat }',
        );
        const prog = fromAST(ast) as Program;
        expect(prog).toBeInstanceOf(Program);
        expect(prog.exportFields).toHaveLength(3);
        expect(prog.exportFields[0].name).toStrictEqual('x');
        expect(prog.exportFields[1].name).toStrictEqual('y');
        expect(prog.exportFields[2].name).toStrictEqual('T');
    });
    test('named actor', () => {
        const ast = motoko.parseMotoko('actor A { let x = 0; }');
        const prog = fromAST(ast) as Program;
        expect(prog).toBeInstanceOf(Program);
        expect(prog.exportFields).toHaveLength(1);
        expect(prog.exportFields[0].name).toStrictEqual('x');
    });
    test('unnamed actor', () => {
        const ast = motoko.parseMotoko('actor { let x = 0; }');
        const prog = fromAST(ast) as Program;
        expect(prog).toBeInstanceOf(Program);
        expect(prog.exportFields).toHaveLength(1);
        expect(prog.exportFields[0].name).toStrictEqual('x');
    });
    test('named class', () => {
        const ast = motoko.parseMotoko('class A() { let x = 0; }');
        const prog = fromAST(ast) as Program;
        expect(prog).toBeInstanceOf(Program);
        expect(prog.exportFields).toHaveLength(1);
        expect(prog.exportFields[0].name).toStrictEqual('x');
    });
    test('named actor class', () => {
        const ast = motoko.parseMotoko('actor class A() { stable var y = 1; }');
        const prog = fromAST(ast) as Program;
        expect(prog).toBeInstanceOf(Program);
        expect(prog.exportFields).toHaveLength(1);
        expect(prog.exportFields[0].name).toStrictEqual('x');
    });
    test('named module', () => {
        const ast = motoko.parseMotoko('module M { let x = 0; }');
        const prog = fromAST(ast) as Program;
        expect(prog).toBeInstanceOf(Program);
        expect(prog.exportFields).toHaveLength(1);
        expect(prog.exportFields[0].name).toStrictEqual('x');
    });
    test('unnamed module', () => {
        const ast = motoko.parseMotoko('module { let x = 0; }');
        const prog = fromAST(ast) as Program;
        expect(prog).toBeInstanceOf(Program);
        expect(prog.exportFields).toHaveLength(1);
        expect(prog.exportFields[0].name).toStrictEqual('x');
    });
    test('nested modules', () => {
        const ast = motoko.parseMotoko('module { module M { let x = 0; } }');
        const prog = fromAST(ast) as Program;
        expect(prog).toBeInstanceOf(Program);
        expect(prog.exportFields).toHaveLength(1);
        expect(prog.exportFields[0].name).toStrictEqual('M');
        const obj = prog.exportFields[0].exp as ObjBlock;
        expect(obj).toBeInstanceOf(ObjBlock);
        expect(obj.fields).toHaveLength(1);
        expect(obj.fields[0].name).toStrictEqual('x');
    });
});
