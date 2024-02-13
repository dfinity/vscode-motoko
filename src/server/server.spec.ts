import icCandid from '../generated/aaaaa-aa.did';

describe('server', () => {
    test('generated IC Candid file', () => {
        expect(icCandid).toContain('service ic : {\n');
    });
});
