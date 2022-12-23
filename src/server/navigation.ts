import { AST, Node, Span } from 'motoko/lib/ast';
import { Location, Position, Range } from 'vscode-languageserver';
import { Context, getContext } from './context';
import { findNodes, matchNode } from './syntax';
import { getAbsoluteUri } from './utils';

export interface Source {
    uri: string;
    node: Node;
}

interface Definition {
    uri: string;
    cursor: Node;
    body: Node;
}

interface Reference {
    type: 'variable' | 'type';
    name: string;
}

export function findMostSpecificNodeForPosition(
    ast: AST,
    position: Position,
    scoreFn: (node: Node) => number | boolean,
    includeEndCharacter = false,
): (Node & { start: Span; end: Span }) | undefined {
    const nodes = findNodes(
        ast,
        (node) =>
            !node.file &&
            node.start &&
            node.end &&
            position.line >= node.start[0] - 1 &&
            position.line <= node.end[0] - 1 &&
            // position.line == node.start[0] - 1 &&
            (position.line !== node.start[0] - 1 ||
                position.character >= node.start[1]) &&
            (position.line !== node.end[0] - 1 ||
                position.character <
                    node.end[1] + (includeEndCharacter ? 0 : 1)),
    );

    // Find the most specific AST node for the cursor position
    let node: Node | undefined;
    let nodeLines: number;
    let nodeChars: number;
    nodes.forEach((n: Node) => {
        // if (ignoredAstNodes.includes(n.name)) {
        //     return;
        // }
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

function findVariableInPattern(expected: string, pat: Node): Node | undefined {
    return (
        matchNode(pat, 'ObjP', (...args) => {
            return args.map((field: Node & { args: [Node] }) => {
                const name = field.name;
                const alias = matchNode(
                    field.args[0],
                    'VarP',
                    (alias) => alias,
                    name,
                );
                if (alias === expected) {
                    return field.args[0];
                }
                if (!alias && name === expected) {
                    return field;
                }
                return;
            });
        }) ||
        matchNode(pat, 'VarP', (name) => {
            if (name === expected) {
                return pat;
            }
            return;
        })
    );
}

const nodePriorities: Record<string, number> = {
    DotE: 2,
    VarE: 1,
    PathT: 1,
};

export function findDefinition(
    uri: string,
    position: Position,
): Location | undefined {
    // Get relevant AST node
    const context = getContext(uri);
    const status = context.astResolver.request(uri);
    if (!status?.ast) {
        console.warn('Missing AST for', uri);
        return;
    }
    if (status.outdated) {
        console.log('Outdated AST for', uri);
        return;
    }
    // console.log(status.ast); ///
    const node = findMostSpecificNodeForPosition(
        status.ast,
        position,
        (node) => nodePriorities[node.name] || 0,
    );
    if (!node) {
        return;
    }
    // console.log('NODE:', node); ////
    const path = resolveReferences(node);
    if (!path.length) {
        console.log('Reference not found from AST node:', node.name);
        return;
    }
    const definition = searchPath(context, { uri, node }, path);
    if (!definition) {
        console.log(
            'Definition not found for reference path:',
            path,
            `(${node.name})`,
        );
        return;
    }
    return Location.create(definition.uri, rangeFromNode(definition.cursor)!);
}

function resolveReferences(node: Node): Reference[] {
    return (
        // matchNode(source.node, 'ImportE', (path) => ({
        //     type: 'import',
        //     path,
        // })) ||
        matchNode(node, 'DotE', (qual: Node, name: string) => [
            ...resolveReferences(qual),
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
        matchNode(node, 'PathT', (path: Node) =>
            resolveTypePathReferences(path),
        ) ||
        []
    );
}

function resolveTypePathReferences(node: Node): Reference[] {
    function resolveTypeQualifierReferences(node: Node): Reference[] {
        return (
            matchNode(node, 'IdH', (name) => [
                {
                    type: 'variable',
                    name,
                },
            ]) ||
            matchNode(node, 'DotH', (qual: Node, name: string) => [
                ...resolveTypePathReferences(qual),
                {
                    type: 'type',
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
            ...resolveTypeQualifierReferences(qual),
            {
                type: 'type',
                name,
            },
        ]) ||
        []
    );
}

function searchPath(
    context: Context,
    source: Source,
    path: Reference[],
): Definition | undefined {
    if (!path.length) {
        return;
    }
    const [first] = path;
    // Search for the first reference in the local scope
    let definition = searchScopeDefinition(source, first);
    const importDefinition = searchImport(
        context,
        definition
            ? // Follow a resolved import
              {
                  uri: definition.uri,
                  node: definition.body,
              }
            : // Follow an import under the cursor (TODO: finish implementation)
              matchNode(source.node, 'LetD', (_pat: Node, value: Node) => ({
                  uri: source.uri,
                  node: value,
              })) || source,
    );
    if (importDefinition) {
        definition = importDefinition;
    }
    // Follow subsequent parts of the qualified path
    for (let i = 1; definition && i < path.length; i++) {
        console.log('NEXT:', definition.cursor.name, definition.body.name);
        const next = path[i];
        const nextSource = { uri: definition.uri, node: definition.body };
        definition = searchObjectDefinition(nextSource, next);
        if (definition) {
            console.log('FOUND:', next, definition.uri);
        } else {
            console.log('LOST:', next, nextSource);
        }
    }
    return definition;
}

function searchScopeDefinition(
    source: Source,
    reference: Reference,
): Definition | undefined {
    let scope: Node | undefined = source.node.parent;
    while (scope) {
        const definition = searchObjectDefinition(
            { uri: source.uri, node: scope },
            reference,
        );
        if (definition) {
            return definition;
        }
        scope = scope.parent;
    }
    return;
}

function searchLetD(
    source: Source,
    reference: Reference,
    dec: Node,
): Definition | undefined {
    return matchNode(dec, 'LetD', (pat: Node, body: Node) => {
        // matchNode(exp, 'ImportE', (path) => {
        //     const import_ = new Import(exp, path);
        //     // Variable pattern name
        //     import_.name = matchNode(pat, 'VarP', (name) => name);
        //     // Object pattern fields
        //     import_.fields =
        //     prog.imports.push(import_);
        // });
        const varNode = findVariableInPattern(reference.name, pat);
        if (varNode) {
            return {
                uri: source.uri,
                cursor: varNode,
                body,
            };
        }
        return;
    });
}

function searchImport(
    context: Context,
    source: Source,
): Definition | undefined {
    // console.log('IMPORT SOURCE:', source); /////////

    return matchNode(source.node, 'ImportE', (path: string) => {
        // Follow a module import
        console.log('FOUND PATH:::', path); /////

        const uri = path.includes(':')
            ? path
            : getAbsoluteUri(source.uri, '..', `${path}.mo`); // TODO: `lib.mo`
        const status = context.astResolver.request(uri);
        if (!status?.program?.export?.ast) {
            console.warn('Missing export for', uri);
            return;
        }
        if (status?.outdated) {
            console.log('Outdated AST for', uri);
            return;
        }
        return {
            uri,
            cursor: status.program.export.ast as Node,
            body: status.program.export.ast as Node,
        };
    });
}

function searchObjectDefinition(
    source: Source,
    reference: Reference,
): Definition | undefined {
    const scope = source.node;
    if (scope?.args) {
        for (const arg of scope.args) {
            console.log('ARG:', reference.name, scope.name, arg); ////
            if (!arg || typeof arg !== 'object' || Array.isArray(arg)) {
                // Skip everything except `Node` values
                continue;
            }
            console.log('Searching:', reference.name, scope.name, arg.name); ////
            let definition: Definition | undefined;
            if (reference.type === 'variable') {
                definition =
                    // TODO: recursive instead of `searchLetD()`
                    searchLetD(source, reference, arg) ||
                    matchNode(
                        arg,
                        'ExpField',
                        (_mut, name, body) =>
                            name === reference.name && {
                                uri: source.uri,
                                cursor: arg,
                                body,
                            },
                    ) ||
                    matchNode(arg, 'DecField', (dec: Node) =>
                        searchLetD(source, reference, dec),
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
                                        searchLetD(source, reference, dec),
                                );
                                if (definition) {
                                    return definition;
                                }
                            }
                            return;
                        },
                    );
            } else if (reference.type === 'type') {
                definition =
                    matchNode(arg, 'TypD', (name: string, typ: Node) =>
                        name === reference.name
                            ? {
                                  uri: source.uri,
                                  cursor: typ, // TODO: source location from `name`
                                  body: typ,
                              }
                            : undefined,
                    ) ||
                    matchNode(arg, 'DecField', (dec: Node) =>
                        // TODO: DRY
                        matchNode(dec, 'TypD', (name: string, typ: Node) =>
                            name === reference.name
                                ? {
                                      uri: source.uri,
                                      cursor: typ, // TODO: source location from `name`
                                      body: typ,
                                  }
                                : undefined,
                        ),
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
                                        // TODO: DRY
                                        matchNode(
                                            dec,
                                            'TypD',
                                            (name: string, typ: Node) =>
                                                name === reference.name
                                                    ? {
                                                          uri: source.uri,
                                                          cursor: typ, // TODO: source location from `name`
                                                          body: typ,
                                                      }
                                                    : undefined,
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
