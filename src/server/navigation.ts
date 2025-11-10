import { AST, Node, Span } from 'motoko/lib/ast';
import { Location, Position, Range } from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { Context, getContext } from './context';
import {
    findNodes,
    getIdName,
    matchNode,
    asNode,
    findInPattern,
} from './syntax';
import { getAbsoluteUri, LocationSet } from './utils';

export interface Reference {
    uri: string;
    node: Node;
}

export interface Definition {
    uri: string;
    cursor: Node;
    body: Node;
    name: string | undefined;
}

interface Search {
    type: 'variable' | 'type';
    name: string;
    start?: Position;
    end?: Position;
}

function spanToPos(span: Span | undefined): Position | undefined {
    if (!span) return undefined;
    return { line: span[0] - 1, character: span[1] };
}

function posBefore(pos1: Position, pos2: Position): Boolean {
    return (
        pos1.line < pos2.line ||
        (pos1.line === pos2.line && pos1.character < pos2.character)
    );
}

/**
 * Comparison function for nodes. A node is considered greater if its start position is earlier.
 *
 * After sorting with this function, the first node in the list is the one deepest
 * in the code hierarchy.
 */
export function startPosDesc(a: Node, b: Node): number {
    const aStartPos = spanToPos(a.start);
    const bStartPos = spanToPos(b.start);
    if (!aStartPos && bStartPos) return -1;
    if (aStartPos && !bStartPos) return 1;
    if (aStartPos && bStartPos && posBefore(aStartPos, bStartPos)) return 1;
    if (aStartPos && bStartPos && posBefore(bStartPos, aStartPos)) return -1;
    return 0;
}

export function sameLocation(a: Location, b: Location): boolean {
    return (
        a.uri === b.uri &&
        a.range.start.line === b.range.start.line &&
        a.range.start.character === b.range.start.character &&
        a.range.end.line === b.range.end.line &&
        a.range.end.character === b.range.end.character
    );
}

export function sameDefinition(a: Definition, b: Definition): boolean {
    return sameLocation(locationFromDefinition(a), locationFromDefinition(b));
}

export function scoreFromNodePriorities(node: Node): number | boolean {
    return nodePriorities[node.name] || 0;
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
    let nodeScore: number | boolean;
    nodes.forEach((n: Node) => {
        const nLines = n.end![0] - n.start![0];
        const nChars = n.end![1] - n.start![1];
        const nScore = scoreFn(n);

        if (
            !node ||
            nScore > nodeScore ||
            (nScore === nodeScore && nLines < nodeLines) ||
            (nScore === nodeScore && nLines === nodeLines && nChars < nodeChars)
        ) {
            node = n;
            nodeLines = nLines;
            nodeChars = nChars;
            nodeScore = nScore;
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

export function locationFromDefinition(definition: Definition): Location {
    const range = rangeFromNode(definition.cursor);
    if (!range) {
        throw new Error(`Missing range for definition in ${definition.uri}`);
    }
    return locationFromUriAndRange(definition.uri, range);
}

export function locationFromUriAndRange(uri: string, range: Range): Location {
    const location = Location.create(uri, range);
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
    VarP: 2, // field import
    ImportE: 1, // module import
};

export function findDefinitions(
    uri: string,
    position: Position,
    isMouseCursor = false,
): Definition[] {
    // Get relevant AST node
    const context = getContext(uri);
    const status =
        context.astResolver.requestTyped(uri) ||
        context.astResolver.request(uri, false);
    if (!status?.ast) {
        console.warn('Missing AST for', uri);
        return [];
    }
    if (status.outdated) {
        console.log('Outdated AST for', uri);
        return [];
    }
    const node = findMostSpecificNodeForPosition(
        status.ast,
        position,
        scoreFromNodePriorities,
        isMouseCursor,
    );
    if (!node) {
        return [];
    }
    const reference: Reference = { uri, node };
    const importDefinition = followImport(context, reference);
    if (importDefinition) {
        return [importDefinition];
    }
    const path = getSearchPath(node);
    const firstUnrelated = path.findIndex(
        (s) => s.start !== undefined && posBefore(position, s.start),
    );
    const relatedPath = path.slice(
        0,
        firstUnrelated !== -1 ? firstUnrelated : path.length,
    );

    if (!relatedPath.length) {
        console.log('Reference not found from AST node:', node.name);
        return [];
    }
    const definitions = search(context, reference, relatedPath);
    if (!definitions.length) {
        console.log(
            'Definition not found for reference path:',
            relatedPath,
            `(${node.name})`,
        );
    }
    return definitions;
}

function getSearchPath(node: Node): Search[] {
    return (
        matchNode(node, 'DotE', (qual: Node, id: Node) => [
            ...getSearchPath(qual),
            {
                type: 'variable',
                name: getIdName(id)!,
                start: spanToPos(id.start),
                end: spanToPos(id.end),
            },
        ]) ||
        matchNode(node, 'VarE', (id: Node) => [
            {
                type: 'variable',
                name: getIdName(id)!,
                start: spanToPos(id.start),
                end: spanToPos(id.end),
            },
        ]) ||
        matchNode(node, 'VarD', (id: Node) => [
            {
                type: 'variable',
                name: getIdName(id)!,
                start: spanToPos(id.start),
                end: spanToPos(id.end),
            },
        ]) ||
        matchNode(node, 'VarP', (id: Node) => [
            {
                type: 'variable',
                name: getIdName(id)!,
                start: spanToPos(id.start),
                end: spanToPos(id.end),
            },
        ]) ||
        matchNode(node, 'PathT', (path: Node) => getTypeSearchPath(path)) ||
        matchNode(node, 'ValF', (id: Node, _typ: Node, _mut: Node) => [
            {
                type: 'variable',
                name: getIdName(id)!,
                start: spanToPos(id.start),
                end: spanToPos(id.end),
            },
        ]) ||
        matchNode(node, 'TypF', (typId: Node) => [
            {
                type: 'type',
                name: getIdName(typId)!,
                start: spanToPos(typId.start),
                end: spanToPos(typId.end),
            },
        ]) ||
        matchNode(node, 'ValPF', (id: Node, _pat: Node) => [
            {
                type: 'variable',
                name: getIdName(id)!,
                start: spanToPos(id.start),
                end: spanToPos(id.end),
            },
        ]) ||
        matchNode(node, 'TypPF', (typId: Node) => [
            {
                type: 'type',
                name: getIdName(typId)!,
                start: spanToPos(typId.start),
                end: spanToPos(typId.end),
            },
        ]) ||
        matchNode(node, 'ID', (name: string) => [
            {
                type: 'variable',
                name,
                start: spanToPos(node.start),
                end: spanToPos(node.end),
            },
        ]) ||
        []
    );
}

function getTypeSearchPath(node: Node): Search[] {
    function getQualifierSearchPath(node: Node): Search[] {
        return (
            matchNode(node, 'IdH', (id: Node) => [
                {
                    type: 'variable',
                    name: getIdName(id)!,
                    start: spanToPos(id.start),
                    end: spanToPos(id.end),
                },
            ]) ||
            matchNode(node, 'DotH', (qual: Node, id: Node) => [
                ...getQualifierSearchPath(qual),
                {
                    type: 'variable',
                    name: getIdName(id)!,
                    start: spanToPos(id.start),
                    end: spanToPos(id.end),
                },
            ]) ||
            []
        );
    }
    return (
        matchNode(node, 'IdH', (id: Node) => [
            {
                type: 'type',
                name: getIdName(id)!,
                start: spanToPos(id.start),
                end: spanToPos(id.end),
            },
        ]) ||
        matchNode(node, 'DotH', (qual: Node, id: Node) => [
            ...getQualifierSearchPath(qual),
            {
                type: 'type',
                name: getIdName(id)!,
                start: spanToPos(id.start),
                end: spanToPos(id.end),
            },
        ]) ||
        []
    );
}

export function followImport(
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
        reference.node.parent,
        'ValPF',
        (name: string) => name,
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

function gatherFieldLocations(lab: string, node: Node): LocationSet {
    const references = new LocationSet();
    if ((node.name !== 'Obj' && node.name !== 'Variant') || !node.args) {
        return references;
    }
    // For Obj, the first element is the obj sort, which we ignore.
    const fields = node.name === 'Obj' ? node.args.slice(1) : node.args;
    for (const field of fields as Node[]) {
        if (field.name !== lab) {
            continue;
        }
        const [_type, _depr, _region, ...srcs] = field.args!;
        for (const src of srcs as Node[]) {
            if (!src.file || !src.start || !src.end) {
                continue;
            }
            references.add(
                locationFromUriAndRange(
                    URI.parse(src.file).toString(),
                    rangeFromNode(src)!,
                ),
            );
        }
    }
    return references;
}

function searchTypeRep(reference: Reference, search: Search): Definition[] {
    function searchDotE(node: Node): Definition[] {
        return (
            matchNode(node, 'DotE', (qual: Node, id: Node) => {
                const lab = getIdName(id);
                if (!lab) {
                    console.warn(
                        'Unexpected AST format: DotE has no ID node on RHS.',
                    );
                    return [];
                }
                // We need to check whether we are in the LHS (qual) or RHS (id) of
                // the DotE expression.
                if (search.name !== lab) {
                    return searchDotE(qual);
                }
                if (!qual.typeRep) {
                    return [];
                }
                return searchTypeRep(qual.typeRep);
            }) || []
        );
    }

    function searchTypeRep(typeRep: Node): Definition[] {
        const locations = Array.from(
            gatherFieldLocations(search.name, typeRep).values(),
        );
        const definitions: Definition[] = [];
        for (const location of locations) {
            const uri = location.uri;
            const context = getContext(uri);
            const status =
                context.astResolver.requestTyped(uri) ||
                context.astResolver.request(uri, false);
            if (!status?.ast) {
                console.warn('Missing AST for', uri);
                continue;
            }
            if (status.outdated) {
                console.log('Outdated AST for', uri);
                continue;
            }

            const node = findMostSpecificNodeForPosition(
                status.ast,
                location.range.start,
                scoreFromNodePriorities,
                false,
            );
            if (!node) {
                continue;
            }
            const definition = searchInScope(
                { uri, node },
                {
                    type: 'variable',
                    name: search.name,
                    start: location.range.start,
                    end: location.range.end,
                },
            );
            if (definition) {
                definitions.push(definition);
            }
        }
        return definitions;
    }

    const definitions = searchDotE(reference.node);
    if (reference.node.typeRep && !definitions.length) {
        definitions.push(...searchTypeRep(reference.node.typeRep));
    }
    return definitions;
}

function search(
    context: Context,
    reference: Reference,
    path: Search[],
): Definition[] {
    if (!path.length) {
        return [];
    }
    // If we have a DotE, search for the reference in the type.
    const definitions = searchTypeRep(reference, path[path.length - 1]);
    if (definitions.length) {
        return definitions;
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
    return definition ? [definition] : [];
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
    function matchId(id: Node, body: Node): Definition | undefined {
        const name = getIdName(id);
        return name === search.name
            ? {
                  uri: reference.uri,
                  cursor: id,
                  body,
                  name,
              }
            : undefined;
    }

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
        matchNode(dec, 'VarD', (id: Node, body: Node) => matchId(id, body)) ||
        matchNode(dec, 'ClassD', (_sharedPat: any, pat: Node) => {
            const [name, varNode] = findNameInPattern(search, pat) || [];
            return varNode && name === search.name
                ? {
                      uri: reference.uri,
                      cursor: varNode,
                      body: dec,
                      name,
                  }
                : undefined;
        }) ||
        matchNode(dec, 'ValF', (id: Node, _syntaxTyp: Node, _mut: Node) =>
            matchId(id, dec),
        ) ||
        matchNode(dec, 'TypF', (typId: Node) => matchId(typId, dec)) ||
        matchNode(dec, 'ValPF', (id: Node, _pat: Node) => matchId(id, dec)) ||
        matchNode(dec, 'TypPF', (typId: Node) => matchId(typId, dec)) ||
        undefined
    );
}

function searchTypeBinding(
    reference: Reference,
    search: Search,
    dec: Node,
): Definition | undefined {
    return (
        matchNode(dec, 'TypD', (id: Node, _: Node) => {
            const name = getIdName(id)!;
            return name === search.name
                ? {
                      uri: reference.uri,
                      cursor: id,
                      body: dec,
                      name,
                  }
                : undefined;
        }) ||
        matchNode(dec, 'ClassD', (_sharedPat: any, id: Node) => {
            const name = getIdName(id)!;
            return name === search.name
                ? {
                      uri: reference.uri,
                      cursor: id,
                      body: dec,
                      name,
                  }
                : undefined;
        })
    );
}

export function searchObject(
    reference: Reference,
    search: Search,
): Definition | undefined {
    const scope = reference.node;
    if (!scope?.args) {
        return;
    }
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
                matchNode(arg, 'ExpField', (_mut, id, body) => {
                    const name = getIdName(id)!;
                    return (
                        name === search.name && {
                            uri: reference.uri,
                            cursor: id,
                            body,
                            name,
                        }
                    );
                }) ||
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
                                    searchDeclaration(reference, search, dec),
                            );
                            if (definition) {
                                return definition;
                            }
                        }
                        return;
                    },
                );
            if (!definition) {
                const result = matchNode(arg, 'case', (pat: Node, _exp: Node) =>
                    findNameInPattern(search, pat),
                );
                if (result) {
                    const [name, pat] = result;
                    definition = {
                        uri: reference.uri,
                        cursor: pat,
                        body: pat,
                        name,
                    };
                }
            }
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
                                    searchTypeBinding(reference, search, dec),
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
    return;
}
