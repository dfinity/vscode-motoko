import { addContext, allContexts, resetContexts } from './context';

describe('context', () => {
    beforeEach(() => {
        resetContexts();
    });

    test('unique Motoko instances', async () => {
        const a = await addContext('A');
        jest.resetModules(); // TODO: test `require.cache` directly
        const b = await addContext('B');
        expect(a.motoko.compiler).not.toBe(b.motoko.compiler);
    });

    test('sorted by URI length and then alphabetical order', async () => {
        await addContext('A');
        await addContext('A/C');
        await addContext('A/B');
        await addContext('B');
        await addContext('B/A');
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
