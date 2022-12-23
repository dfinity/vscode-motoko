import { AST, Node, Span } from 'motoko/lib/ast';
import { findNodes, matchNode } from './syntax';
import { Position, Range } from 'vscode-languageserver';

export interface Source {
    uri: string;
    node: Node;
}

export class Definition {
    readonly name: string;
    readonly source: Source;

    constructor(name: string, source: Source) {
        this.name = name;
        this.source = source;
    }
}

export class Reference {
    readonly name: string;
    readonly source: Source;
    readonly definition: Definition;

    constructor(name: string, source: Source, definition: Definition) {
        this.name = name;
        this.source = source;
        this.definition = definition;
    }
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
            console.log('VAR:', name, name === expected); ///////
            if (name === expected) {
                return pat;
            }
            return;
        })
    );
}

export function findDefinition(
    expected: string,
    source: Source,
): Source | undefined {
    console.log('Expected:', expected); ////

    let node = source.node.parent;
    console.log('PARENT:::', source.node.parent); ///////
    while (node) {
        if (node.args) {
            for (const arg of node.args) {
                console.log('ARG:', arg); /////
                const declaration = matchNode(arg, 'LetD', (pat) => {
                    // matchNode(exp, 'ImportE', (path) => {
                    //     const import_ = new Import(exp, path);
                    //     // Variable pattern name
                    //     import_.name = matchNode(pat, 'VarP', (name) => name);
                    //     // Object pattern fields
                    //     import_.fields =
                    //     prog.imports.push(import_);
                    // });
                    return findInPattern(expected, pat);
                });
                if (declaration) {
                    return {
                        uri: source.uri,
                        node: declaration,
                    };
                }
            }
        }
        node = node.parent;
    }
    return;
}
