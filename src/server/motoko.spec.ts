import { Motoko } from 'motoko/lib';
import {
    addMotokoInstance,
    allMotokoInstances,
    resetMotokoInstances,
} from './motoko';

type TestMotoko = Motoko & { __directory: string };

function add(dir: string) {
    jest.resetModules();
    const mo = addMotokoInstance(dir) as TestMotoko;
    mo.__directory = dir;
    return mo;
}

describe('motoko', () => {
    beforeEach(() => {
        resetMotokoInstances();
    });

    test('unique instances', () => {
        let a = add('A');
        let b = add('B');
        expect(a.__directory).toEqual('A');
        expect(b.__directory).toEqual('B');
    });

    test('sorted by specificity', () => {
        add('A');
        add('A/C');
        add('A/B');
        add('B');
        add('B/A');
        expect(
            allMotokoInstances().map((mo) => (mo as TestMotoko).__directory),
        ).toStrictEqual([
            'A/B',
            'A/C',
            'B/A',
            'A',
            'B',
            undefined, // default instance
        ]);
    });
});
