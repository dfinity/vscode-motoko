import { getAbsoluteUri, getRelativeUri } from './utils';

describe('utils', () => {
    test('getRelativeUri', () => {
        // expect(getRelativeUri('file:a/b/c', 'file:a')).toStrictEqual('..');
        // expect(getRelativeUri('file://a/b/c', 'file://a')).toStrictEqual('..');
        expect(getRelativeUri('file:///a/b', 'file:///a')).toStrictEqual('..');
        expect(getRelativeUri('mo:a/b', 'mo:a/b/c')).toStrictEqual('c');
        expect(getRelativeUri('mo:a/b', 'mo:a/c')).toStrictEqual('c');
    });
    test('getAbsoluteUri', () => {
        expect(getAbsoluteUri('mo:a', 'b')).toStrictEqual('mo:a/b');
        // expect(getAbsoluteUri('file:a/b', '..')).toStrictEqual('file:a');
        // expect(getAbsoluteUri('file://a/b', '..')).toStrictEqual('file://a');
        expect(getAbsoluteUri('file:///a/b', '..')).toStrictEqual('file:///a');
        expect(getAbsoluteUri('mo:a/b', '../c')).toStrictEqual('mo:a/c');
    });
});
