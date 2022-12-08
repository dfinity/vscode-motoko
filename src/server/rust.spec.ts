import rust, { vesselSources } from './rust';
import { join, resolve } from 'path';

describe('rust', () => {
    test('init', () => {
        expect(rust.vesselSources).toBeTruthy();
    });

    test('vesselSources', () => {
        let error;
        try {
            vesselSources();
        } catch (e) {
            error = e;
        }
        expect(error).toEqual(
            "[Error: Couldn't find a Vessel installation on your system path]",
        );

        expect(
            vesselSources(resolve(__dirname, '../../test/workspace')),
        ).toEqual([['base', join('.vessel', 'base', 'master', 'src')]]);
    });
});
