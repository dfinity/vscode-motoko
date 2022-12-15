import { addContext, allContexts, resetContexts } from './context';

describe('context', () => {
    beforeEach(() => {
        resetContexts();
    });

    test('unique Motoko instances', () => {
        const a = addContext('A');
        jest.resetModules(); // TODO: test `require.cache` directly
        const b = addContext('B');
        expect(a.motoko.compiler).not.toBe(b.motoko.compiler);
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
