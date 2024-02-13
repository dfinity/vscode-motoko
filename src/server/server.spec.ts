import icCandid from '../generated/aaaaa-aa.did';

describe('server', () => {
    test('generated IC Candid file has expected format', () => {
        expect(icCandid).toContain('service ic : {\n');
    });
});
