import { AST, Node, Span } from 'motoko/lib/ast';
import { Location, Position, Range } from 'vscode-languageserver';
import { Context, getContext } from './context';
import { findNodes, matchNode, asNode, findInPattern } from './syntax';
import { getAbsoluteUri } from './utils';

interface Reference {
    uri: string;
    node: Node;
}

interface Definition {
    uri: string;
    cursor: Node;
    body: Node;
    name: string | undefined;
}

interface Search {
    type: 'variable' | 'type';
    name: string;
}

export function findMostSpecificNodeForPosition(
    ast: AST,
    position: Position,
    scoreFn: (node: Node) => number | boolean,
    isMouseCursor = false,
): (Node & { start: Span; end: Span }) | undefined {
    const nodes = findNodes(
        ast,
        (node) =>
            !node.file &&
            node.start &&
            node.end &&
            position.line >= node.start[0] - 1 &&
            position.line <= node.end[0] - 1 &&
            (position.line !== node.start[0] - 1 ||
                position.character >= node.start[1]) &&
            (position.line !== node.end[0] - 1 ||
                position.character < node.end[1] + (isMouseCursor ? 0 : 1)),
    );

    // Find the most specific AST node for the cursor position
    let node: Node | undefined;
    let nodeLines: number;
    let nodeChars: number;
    nodes.forEach((n: Node) => {
        const nLines = n.end![0] - n.start![0];
        const nChars = n.end![1] - n.start![1];
        if (
            !node ||
            scoreFn(n) > scoreFn(node) ||
            nLines < nodeLines ||
            (nLines == nodeLines && nChars < nodeChars)
        ) {
            node = n;
            nodeLines = nLines;
            nodeChars = nChars;
        }
    });
    return node as (Node & { start: Span; end: Span }) | undefined;
}

export function defaultRange(): Range {
    const pos = Position.create(0, 0);
    return Range.create(pos, pos);
}

export function rangeFromNode(
    node: Node | undefined,
    multiLineFromBeginning = false,
): Range | undefined {
    if (!node || !node.start || !node.end) {
        return;
    }
    // const isSameLine = node.start[0] === node.end[0];
    return {
        start: {
            line: node.start[0] - 1,
            character:
                multiLineFromBeginning && node.start[0] !== node.end[0]
                    ? 0
                    : node.start[1],
            // character: node.start[1],
        },
        end: {
            line: node.end[0] - 1,
            character: node.end[1],
        },
    };
}

export function locationFromDefinition(definition: Definition) {
    const range = rangeFromNode(definition.cursor);
    if (!range) {
        throw new Error(`Missing range for definition in ${definition.uri}`);
    }
    const location = Location.create(definition.uri, range);
    if (location && location.range.end.line > location.range.start.line) {
        // Remove highlight for multi-line definitions
        location.range.end = location.range.start;
    }
    return location;
}

function findNameInPattern(
    search: Search,
    pat: Node,
): [string, Node] | undefined {
    return findInPattern(pat, (name, node) =>
        name === search.name ? [name, node] : undefined,
    );
}

const nodePriorities: Record<string, number> = {
    DotE: 3, // qulified variable
    VarE: 2, // variable
    PathT: 2, // type reference
    ImportE: 1, // module import
    VarP: 2, // field import
};

export function findDefinition(
    uri: string,
    position: Position,
    isMouseCursor = false,
): Definition | undefined {
    // Get relevant AST node
    const context = getContext(uri);
    const status = context.astResolver.request(uri, false);
    if (!status?.ast) {
        console.warn('Missing AST for', uri);
        return;
    }
    if (status.outdated) {
        console.log('Outdated AST for', uri);
        return;
    }
    const node = findMostSpecificNodeForPosition(
        status.ast,
        position,
        (node) => nodePriorities[node.name] || 0,
        isMouseCursor,
    );
    if (!node) {
        return;
    }
    const reference: Reference = { uri, node };
    const importDefinition = followImport(context, reference);
    if (importDefinition) {
        return importDefinition;
    }
    const path = getSearchPath(node);
    if (!path.length) {
        console.log('Reference not found from AST node:', node.name);
        return;
    }
    const definition = search(context, reference, path);
    if (!definition) {
        console.log(
            'Definition not found for reference path:',
            path,
            `(${node.name})`,
        );
        return;
    }
    return definition;
}

function getSearchPath(node: Node): Search[] {
    return (
        matchNode(node, 'DotE', (qual: Node, name: string) => [
            ...getSearchPath(qual),
            {
                type: 'variable',
                name,
            },
        ]) ||
        matchNode(node, 'VarE', (name: string) => [
            {
                type: 'variable',
                name,
            },
        ]) ||
        matchNode(node, 'PathT', (path: Node) => getTypeSearchPath(path)) ||
        []
    );
}

function getTypeSearchPath(node: Node): Search[] {
    function getQualifierSearchPath(node: Node): Search[] {
        return (
            matchNode(node, 'IdH', (name) => [
                {
                    type: 'variable',
                    name,
                },
            ]) ||
            matchNode(node, 'DotH', (qual: Node, name: string) => [
                ...getQualifierSearchPath(qual),
                {
                    type: 'variable',
                    name,
                },
            ]) ||
            []
        );
    }
    return (
        matchNode(node, 'IdH', (name) => [
            {
                type: 'type',
                name,
            },
        ]) ||
        matchNode(node, 'DotH', (qual: Node, name: string) => [
            ...getQualifierSearchPath(qual),
            {
                type: 'type',
                name,
            },
        ]) ||
        []
    );
}

function followImport(
    context: Context,
    reference: Reference,
): Definition | undefined {
    let importNode: Node | undefined = reference.node;
    while (
        importNode &&
        importNode.name !== 'ImportE' &&
        importNode.name !== 'LetD'
    ) {
        importNode = importNode.parent;
    }
    matchNode(importNode, 'LetD', (_pat, exp) => {
        // Follow let binding
        importNode = exp;
    });
    if (!importNode || importNode.name !== 'ImportE') {
        return;
    }
    // Find the relevant field name
    const field = matchNode(
        reference.node.parent?.parent,
        'ObjP',
        () => reference.node.parent?.name,
    );
    // Follow the module import
    return matchNode(importNode, 'ImportE', (path: string) => {
        const uri = context.importResolver.getFileSystemURI(
            path.includes(':')
                ? path
                : getAbsoluteUri(reference.uri, '..', path),
        );
        if (!uri) {
            console.log('Unknown file system URI for path:', path);
            return;
        }
        const status = context.astResolver.request(uri, false);
        if (!status?.program?.export?.ast) {
            console.log('Missing export for', uri);
            return;
        }
        if (status?.outdated) {
            console.log('Outdated AST for', uri);
            return;
        }
        const exportNode = asNode(status.program.export.ast);
        if (!exportNode) {
            console.log('Unexpected export AST for', uri);
            console.log('AST:', status.program.export.ast);
            return;
        }
        if (field) {
            return searchObject(
                { uri, node: exportNode },
                { type: 'variable', name: field },
            );
        }
        return {
            uri,
            cursor: exportNode,
            body: exportNode,
            name: undefined,
        };
    });
}

function search(
    context: Context,
    reference: Reference,
    path: Search[],
): Definition | undefined {
    if (!path.length) {
        return;
    }
    const [base] = path;
    // Search for the base reference in the local scope
    let definition = searchInScope(reference, base);
    if (definition) {
        // Follow an import
        definition =
            followImport(context, {
                uri: definition.uri,
                node: definition.cursor,
            }) || definition;
    }
    // Follow subsequent parts of the qualified path
    for (let i = 1; definition && i < path.length; i++) {
        // console.log('NEXT:', definition.cursor.name, definition.body.name);
        const next = path[i];
        const nextSource = { uri: definition.uri, node: definition.body };
        definition = searchObject(nextSource, next);
        // if (definition) {
        //     console.log('FOUND:', next, definition.uri);
        // } else {
        //     console.log('LOST:', next, nextSource);
        // }
    }
    return definition;
}

function searchInScope(
    reference: Reference,
    search: Search,
): Definition | undefined {
    let scope: Node | undefined = reference.node.parent;
    while (scope) {
        const definition = searchObject(
            { uri: reference.uri, node: scope },
            search,
        );
        if (definition) {
            return definition;
        }
        scope = scope.parent;
    }
    return;
}

function searchDeclaration(
    reference: Reference,
    search: Search,
    dec: Node,
): Definition | undefined {
    return (
        matchNode(dec, 'LetD', (pat: Node, body: Node) => {
            const [name, varNode] = findNameInPattern(search, pat) || [];
            return (
                varNode && {
                    uri: reference.uri,
                    cursor: varNode,
                    body,
                    name,
                }
            );
        }) ||
        matchNode(dec, 'VarD', (name: string, body: Node) =>
            name === search.name
                ? {
                      uri: reference.uri,
                      cursor: dec, // TODO: cursor on variable name
                      body,
                      name,
                  }
                : undefined,
        ) ||
        matchNode(dec, 'ClassD', (_sharedPat: any, name: string) =>
            name === search.name
                ? {
                      uri: reference.uri,
                      cursor: dec, // TODO: cursor on variable name
                      body: dec,
                      name,
                  }
                : undefined,
        )
    );
}

function searchTypeBinding(
    reference: Reference,
    search: Search,
    dec: Node,
): Definition | undefined {
    return (
        matchNode(dec, 'TypD', (name: string, typ: Node) =>
            name === search.name
                ? {
                      uri: reference.uri,
                      cursor: typ, // TODO: source location from `name`
                      body: typ,
                      name,
                  }
                : undefined,
        ) ||
        matchNode(dec, 'ClassD', (_sharedPat: any, name: string) =>
            name === search.name
                ? {
                      uri: reference.uri,
                      cursor: dec, // TODO: cursor on variable name
                      body: dec,
                      name,
                  }
                : undefined,
        )
    );
}

function searchObject(
    reference: Reference,
    search: Search,
): Definition | undefined {
    const scope = reference.node;
    if (scope?.args) {
        for (const arg of scope.args) {
            if (!arg || typeof arg !== 'object' || Array.isArray(arg)) {
                // Skip everything except `Node` values
                continue;
            }
            // console.log('Searching:', search.name, scope.name, arg.name);
            let definition: Definition | undefined;
            if (search.type === 'variable') {
                definition =
                    searchDeclaration(reference, search, arg) ||
                    matchNode(
                        arg,
                        'ExpField',
                        (_mut, name, body) =>
                            name === search.name && {
                                uri: reference.uri,
                                cursor: arg,
                                body,
                                name,
                            },
                    ) ||
                    matchNode(arg, 'DecField', (dec: Node) =>
                        searchDeclaration(reference, search, dec),
                    ) ||
                    matchNode(
                        arg,
                        'ObjBlockE',
                        (_sort: string, ...fields: Node[]) => {
                            for (const field of fields) {
                                const definition = matchNode(
                                    field,
                                    'DecField',
                                    (dec: Node) =>
                                        searchDeclaration(
                                            reference,
                                            search,
                                            dec,
                                        ),
                                );
                                if (definition) {
                                    return definition;
                                }
                            }
                            return;
                        },
                    );
                if (!definition) {
                    const [name, pat] = findNameInPattern(search, arg) || []; // Function parameters
                    if (pat) {
                        definition = {
                            uri: reference.uri,
                            cursor: pat,
                            body: pat,
                            name,
                        };
                    }
                }
            } else if (search.type === 'type') {
                definition =
                    searchTypeBinding(reference, search, arg) ||
                    matchNode(arg, 'DecField', (dec: Node) =>
                        searchTypeBinding(reference, search, dec),
                    ) ||
                    matchNode(
                        arg,
                        'ObjBlockE',
                        (_sort: string, ...fields: Node[]) => {
                            for (const field of fields) {
                                const definition = matchNode(
                                    field,
                                    'DecField',
                                    (dec: Node) =>
                                        searchTypeBinding(
                                            reference,
                                            search,
                                            dec,
                                        ),
                                );
                                if (definition) {
                                    return definition;
                                }
                            }
                            return;
                        },
                    );
            }
            if (definition) {
                return definition;
            }
        }
    }
    return;
}
