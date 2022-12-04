// import defaultMotoko from 'motoko';
import { Motoko } from 'motoko/lib';
import * as baseLibrary from 'motoko/packages/latest/base.json';
import ImportResolver from './imports';
import AstResolver from './ast';

export interface Context {
    uri: string;
    motoko: Motoko;
    astResolver: AstResolver;
    importResolver: ImportResolver;
}

const motokoPath = './motoko'; //

const defaultMotoko = require(motokoPath).default;
defaultMotoko.loadPackage(baseLibrary);

const defaultContext = createContext('', defaultMotoko);

const contexts: Context[] = [];

function newMotokoInstance(): Motoko {
    Object.keys(require.cache).forEach((key) => {
        if (
            key.endsWith('/out/motoko.js') ||
            key.endsWith('\\out\\motoko.js')
        ) {
            console.error('Deleting cache:', key); /////
            delete require.cache[key];
        }
    });
    return require(motokoPath).default;
}

export function resetContexts() {
    // console.log('Reset contexts');
    contexts.length = 0;
}

function createContext(uri: string, motoko: Motoko): Context {
    // console.log('Created context:', uri);
    return {
        uri,
        motoko,
        astResolver: new AstResolver(),
        importResolver: new ImportResolver(),
    };
}

export function addContext(uri: string): Context {
    const existing = contexts.find((other) => uri === other.uri);
    if (existing) {
        console.warn('Duplicate contexts for URI:', uri);
        return existing;
    }
    const motoko = newMotokoInstance();
    const context = createContext(uri, motoko);
    // Insert by descending specificity (`uri.length`) and then ascending alphabetical order
    let index = 0;
    while (index < contexts.length) {
        const other = contexts[index];
        if (
            uri.length > other.uri.length ||
            (uri.length === other.uri.length &&
                uri.localeCompare(other.uri) < 0)
        ) {
            break;
        }
        index++;
    }
    contexts.splice(index, 0, context);
    return context;
}

export function allContexts(): Context[] {
    return [...contexts, defaultContext];
}

export function getContext(uri: string): Context {
    return (
        contexts.find((context) => uri.startsWith(context.uri)) ??
        defaultContext
    );
}
