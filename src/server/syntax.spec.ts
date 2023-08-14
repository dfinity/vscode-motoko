import motoko from './motoko';
import { ObjBlock, Program, fromAST } from './syntax';

describe('syntax', () => {
    test('named actor', () => {
        const ast = motoko.parseMotoko('actor A { let x = 0; let y = 1; }');
        const prog = fromAST(ast) as Program;
        expect(prog).toBeInstanceOf(Program);
        expect(prog.exportFields).toHaveLength(2);
        expect(prog.exportFields[0].name).toStrictEqual('x');
        expect(prog.exportFields[1].name).toStrictEqual('y');
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
    test('nested module', () => {
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
