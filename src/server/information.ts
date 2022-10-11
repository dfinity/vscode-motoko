import { Node } from 'motoko/lib/ast';

const astInformation: Record<string, string> = {
    'WildP:query':
        'A read-only query function.\n\n[Documentation](https://internetcomputer.org/docs/current/developer-docs/build/cdks/motoko-dfinity/actors-async/#query-functions)',
};

export function getAstInformation(
    node: Node,
    source: string,
): string | undefined {
    if (astInformation.hasOwnProperty(node.name)) {
        return astInformation[node.name];
    }
    // Node with specific source information
    const key = `${node.name}:${source}`;
    if (astInformation.hasOwnProperty(key)) {
        return astInformation[key];
    }
    return;
}
