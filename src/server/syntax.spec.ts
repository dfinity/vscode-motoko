import { AST } from 'motoko/lib/ast';
import motoko from './motoko';
import * as path from 'path';
import * as fs from 'fs';
import { URI } from 'vscode-uri';
import { Position } from 'vscode-languageserver';

import {
    Field,
    Program,
    Syntax,
    SyntaxWithFields,
    fromAST,
    asNode,
} from './syntax';
import { findDefinitions } from './navigation';

/* eslint jest/expect-expect: ["off", { "assertFunctionNames": ["expect"] }] */

const validateAst = (ast: AST): Program => {
    const prog = fromAST(ast) as Program;
    expect(prog).toBeInstanceOf(Program);
    return prog;
};

const parse = (source: string): Program => {
    const ast = motoko.parseMotoko(source, /*recovery=*/ true);
    return validateAst(ast);
};

//const parseTyped = (source: string): Program => {
//    const { ast } = motoko.parseMotokoTyped(source);
//    return validateAst(ast);
//};

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

describe('correct syntax', () => {
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
    test('tuple pattern', () => {
        const prog = parse('module { let (a, b) = ("a", "b"); }');
        expectFields(prog.exportFields, [undefined]);
        expectWithFields(prog.exportFields[0].exp, ['a', 'b']);
    });
    test('object pattern', () => {
        const prog = parse('module { let { a; b } = { a = "a"; b = "b" }; }');
        expectFields(prog.exportFields, [undefined]);
        expectWithFields(prog.exportFields[0].exp, ['a', 'b']);
    });
    test('object pattern with alias', () => {
        const prog = parse(
            'module { let { a; b = c } = { a = "a"; b = "b" }; }',
        );
        expectFields(prog.exportFields, [undefined]);
        expectWithFields(prog.exportFields[0].exp, ['a', 'c']);
    });
});

describe('incorrect syntax', () => {
    test('missing semicolon', () => {
        const prog = parse('module { let x = 0 let y = 0}');
        expectWithFields(prog.exportFields[0].exp, ['x', 'y']);
    });
    test('missing end curly bracket', () => {
        const prog = parse('actor { let x = 0; }');
        expectFields(prog.exportFields, [undefined]);
        expectWithFields(prog.exportFields[0].exp, ['x']);
    });
});

describe('navigation', () => {
    describe('There are correct fields for sources', () => {
        const filename = path.join(
            __dirname,
            '..',
            '..',
            'test',
            'syntax',
            'sources.mo',
        );
        motoko.write(filename, fs.readFileSync(filename, 'utf8'));
        const pos1: [number, number] = [3, 20]; // Class1.meth
        const pos2: [number, number] = [9, 20]; // Class2.meth
        // The numbers indicate the line and start character of each source of
        // each definition (c0 to cC). The ranges sometimes include extra sources
        // (indicated inside the parentheses), which is fine for our case.
        test.each([
            { inPos: [16, 14], outPos: [pos1, pos2, [15, 19]] }, // c0
            { inPos: [16, 27], outPos: [pos1, pos2, [15, 19]] }, // c1 (adds Class1 and t0.0)
            { inPos: [18, 13], outPos: [pos1] }, // c2
            { inPos: [19, 13], outPos: [pos1] }, // c3
            { inPos: [20, 13], outPos: [pos1, pos2, [15, 19]] }, // c4 (adds t0.0)
            { inPos: [21, 13], outPos: [pos1, [21, 18]] }, // c5
            { inPos: [22, 13], outPos: [pos1, pos2, [15, 19]] }, // c6 (adds Class1 and t0.0)
            { inPos: [23, 13], outPos: [pos1, pos2, [15, 19], [23, 18]] }, // c7 (adds Class1 and t0.0)
            { inPos: [24, 13], outPos: [pos1, pos2, [15, 19]] }, // c8 (adds t0.0)
            { inPos: [25, 13], outPos: [pos1, pos2, [15, 19]] }, // c9 (adds t0.0)
            { inPos: [26, 13], outPos: [pos1, [26, 18]] }, // cA
            { inPos: [27, 13], outPos: [pos1, [15, 19]] }, // cB (adds t0.0)
            { inPos: [28, 13], outPos: [pos1, pos2, [15, 19]] }, // cC (adds t0.0)
        ])('Fields for c$#', ({ inPos, outPos }) => {
            const [l, c] = inPos;
            const defs = findDefinitions(
                URI.parse(filename).toString(),
                Position.create(l - 1, c),
                true,
            );
            expect(defs).toBeTruthy();
            expect(defs!.length).toStrictEqual(1);
            const def = defs![0];
            const typeRep = def.cursor.typeRep;
            expect(typeRep).toBeTruthy();
            expect(typeRep!.name).toStrictEqual('Obj');
            expect(typeRep!.args).toBeTruthy();
            expect(typeRep!.args!.length).toStrictEqual(2);
            const meth = asNode(typeRep!.args![1]!);
            expect(meth).toBeTruthy();
            expect(meth!.name).toStrictEqual('meth');
            const [_typ, _depr, _region, ...srcs] = meth!.args!;
            expect(srcs.length).toStrictEqual(outPos.length);
            for (let srcIdx = 0; srcIdx < srcs.length; ++srcIdx) {
                const node = asNode(srcs[srcIdx]);
                expect(node?.start).toStrictEqual(outPos[srcIdx]);
            }
        });
    });

    test('Fields of complex pattern', () => {
        const filename = path.join(
            __dirname,
            '..',
            '..',
            'test',
            'syntax',
            'sources.mo',
        );
        motoko.write(filename, fs.readFileSync(filename, 'utf8'));
        const defs = findDefinitions(
            URI.parse(filename).toString(),
            // Line and start character of t0
            Position.create(15 - 1, 13),
            true,
        );
        expect(defs).toBeTruthy();
        expect(defs!.length).toStrictEqual(1);
        const def = defs![0];
        const typeRep = def.cursor.typeRep;
        expect(typeRep).toBeTruthy();
        expect(typeRep!.name).toStrictEqual('Tup');
        expect(typeRep!.args).toBeTruthy();
        expect(typeRep!.args!.length).toStrictEqual(2);
        const t0 = asNode(typeRep!.args![0])!;
        expect(t0.name).toStrictEqual('Obj');
        expect(t0.args).toBeTruthy();
        expect(t0.args!.length).toStrictEqual(2);
        const meth = asNode(t0.args![1]!);
        expect(meth).toBeTruthy();
        expect(meth!.name).toStrictEqual('meth');
        const [_typ, _depr, _region, ...srcs] = meth!.args!;
        expect(srcs.map((src) => asNode(src)?.start)).toStrictEqual([
            [3, 20],
            [15, 19],
        ]);
        const t1 = asNode(typeRep!.args![1])!;
        expect(t1.name).toStrictEqual('Con');
        expect(t1.args).toStrictEqual(['Class2']);
    });
});
