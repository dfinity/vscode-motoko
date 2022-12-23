import { AST, Node, Span } from 'motoko/lib/ast';
import { Location, Position, Range } from 'vscode-languageserver';
import { Context, getContext } from './context';
import { findNodes, matchNode } from './syntax';

export interface Source {
    uri: string;
    node: Node;
}

// export class Definition {
//     readonly name: string;
//     readonly source: Source;

//     constructor(name: string, source: Source) {
//         this.name = name;
//         this.source = source;
//     }
// }

// export class Reference {
//     readonly name: string;
//     readonly source: Source;
//     readonly definition: Definition;

//     constructor(name: string, source: Source, definition: Definition) {
//         this.name = name;
//         this.source = source;
//         this.definition = definition;
//     }
// }

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

function findInPattern(expected: string, pat: Node): Node | undefined {
    console.log('FIND:', expected, pat); /////////
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

type Reference = {
    type: 'variable' | 'type';
    name: string;
};
// | {
//       type: 'import';
//       path: string;
//   }

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
    if (!status?.ast || status.outdated) {
        console.warn('Missing AST for', uri);
        return;
    }
    console.log(status.ast); ///
    const node = findMostSpecificNodeForPosition(
        status.ast,
        position,
        (node) => nodePriorities[node.name] || 0,
    );
    if (!node) {
        return;
    }
    console.log('NODE:', node); ////
    const path = resolveReferencePath(node);
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
    return Location.create(definition.uri, rangeFromNode(definition.node)!);
}

function resolveReferencePath(node: Node): Reference[] {
    return (
        // matchNode(source.node, 'ImportE', (path) => ({
        //     type: 'import',
        //     path,
        // })) ||
        matchNode(node, 'DotE', (obj: Node, name: string) => [
            ...resolveReferencePath(obj),
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
        matchNode(node, 'PathT', (path: string) =>
            matchNode(path, 'IdH', (name) => [
                {
                    type: 'type',
                    name,
                },
            ]),
        ) ||
        []
    );
}

function searchPath(
    _context: Context,
    source: Source,
    path: Reference[],
): Source | undefined {
    if (!path.length) {
        return;
    }
    const [first] = path;
    let resultSource = searchScopeDefinition(source, first);
    for (let i = 1; resultSource && i < path.length; i++) {
        const next = path[i];
        resultSource = searchObjectDefinition(resultSource, next);
        if (resultSource) {
            console.log('FOUND:', next);
        } else {
            console.log('LOST:', next);
        }
    }
    return resultSource;
}

function searchScopeDefinition(
    source: Source,
    reference: Reference,
): Source | undefined {
    // console.log('SCOPE:', reference); ////

    let scope: Node | undefined = source.node;
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

function searchObjectDefinition(
    source: Source,
    reference: Reference,
): Source | undefined {
    // console.log('SEARCH:', reference); ////

    const scope = source.node.parent;
    console.log('PARENT:::', source.node.parent); ///////
    if (scope?.args) {
        for (const arg of scope.args) {
            console.log('ARG:', scope.name, arg); /////
            if (reference.type === 'variable') {
                const declaration: Node | undefined = matchNode(
                    arg,
                    'LetD',
                    (pat) => {
                        // matchNode(exp, 'ImportE', (path) => {
                        //     const import_ = new Import(exp, path);
                        //     // Variable pattern name
                        //     import_.name = matchNode(pat, 'VarP', (name) => name);
                        //     // Object pattern fields
                        //     import_.fields =
                        //     prog.imports.push(import_);
                        // });
                        return findInPattern(reference.name, pat);
                    },
                );
                if (declaration) {
                    return {
                        uri: source.uri,
                        node: declaration,
                    };
                }
            } else if (reference.type === 'type') {
                const declaration: Node | undefined = matchNode(
                    arg,
                    'TypD',
                    (name, typ) =>
                        // TODO: source location from `name`
                        name === reference.name ? typ : undefined,
                );
                if (declaration) {
                    return {
                        uri: source.uri,
                        node: declaration,
                    };
                }
            }
        }
    }
    return;
}
