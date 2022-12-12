import { vesselSources } from './rust';
// import { join, resolve } from 'path';

describe('rust', () => {
    // test('init', () => {
    //     expect(rust.vesselSources).toBeTruthy();
    // });

    test('vesselSources', () => {
        expect(() => vesselSources()).toThrowError(
            "Couldn't find a Vessel installation on your system path",
        );

        // expect(() => vesselSources()).toThrowError(
        //     "Could not find a 'vessel.dhall' file in this directory or a parent one.",
        // );
        // expect(
        //     vesselSources(resolve(__dirname, '../../test/workspace')),
        // ).toEqual([['base', join('.vessel', 'base', 'master', 'src')]]);
    });
});
