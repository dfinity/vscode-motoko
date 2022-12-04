import { addContext, allContexts, resetContexts } from './context';

describe('context', () => {
    beforeEach(() => {
        resetContexts();
    });

    test('unique Motoko instances', () => {
        let a = addContext('A');
        jest.resetModules(); // TODO: test `require.cache` directly
        let b = addContext('B');
        expect(a.motoko).not.toBe(b.motoko);
    });

    test('sorted by URI length and then alphabetical order', () => {
        addContext('A');
        addContext('A/C');
        addContext('A/B');
        addContext('B');
        addContext('B/A');
        expect(allContexts().map(({ uri }) => uri)).toStrictEqual([
            'A/B',
            'A/C',
            'B/A',
            'A',
            'B',
            '', // default context
        ]);
    });
});
