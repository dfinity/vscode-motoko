import { Node, asNode, AST } from 'motoko/lib/ast';
import { keywords } from 'motoko/lib/keywords';
import { Position, Range } from 'vscode-languageserver/node';
import AstResolver from '../ast';
import { findDocComments } from './docs';
import { MotokoSettings } from '../handlers';
import { getAstInformation } from '../information';
import { findMostSpecificNodeForPosition, rangeFromNode } from '../navigation';
import { findNodes } from '../syntax';
import { formatMotoko } from '../utils';

function generateDocParts(
    nodeDocs: string[],
    maybeTypeInfo: string | undefined,
    isSameLine: boolean,
    source: string,
    codeSnippet: (source: string) => string,
): string[] {
    const docs: string[] = [];
    if (nodeDocs.length) {
        const typeInfo = maybeTypeInfo || '';
        const typeLineThreshold = 5;
        const numTypeLines = typeInfo ? typeInfo.split('\n').length : 0;
        if (typeInfo) {
            if (numTypeLines <= typeLineThreshold) {
                docs.push(codeSnippet(typeInfo));
            }
        } else if (!isSameLine) {
            docs.push(codeSnippet(source));
        }
        docs.push(...nodeDocs);
        if (numTypeLines > typeLineThreshold) {
            docs.push(`*Type definition:*\n${codeSnippet(typeInfo)}`);
        }
    } else if (maybeTypeInfo) {
        docs.push(codeSnippet(maybeTypeInfo));
    }
    return docs;
}

function generateDebugInfo(
    node: Node,
    codeSnippet: (source: string) => string,
): string {
    let debugText = `\n${node.name}`;
    if (node.args?.length) {
        debugText += ` [${node.args
            .map(
                (arg) =>
                    `\n  ${
                        typeof arg === 'object'
                            ? Array.isArray(arg)
                                ? '[...]'
                                : arg?.name
                            : JSON.stringify(arg)
                    }`,
            )
            .join('')}\n]`;
    }
    return codeSnippet(debugText);
}

const ignoredNodeNamesForHover = new Set([
    'AndE',
    'AnnotE',
    'AnnotP',
    'AsyncE',
    'BinE',
    'BlockE',
    'CallE',
    'DecField',
    'DotE',
    'FuncE',
    'FuncT',
    'IfE',
    'NamedT',
    'NotE',
    'ObjBlockE',
    'ObjE',
    'ObjT',
    'OrE',
    'ParP',
    'PathT',
    'RelE',
    'Resion',
    'SwitchE',
    'TupE',
    'TupP',
    'VarE',
    'VariantT',
]);

const nodePriorities: Record<string, number> = {
    OptT: 3, // optional type
    OptE: 3, // optional expression
    ID: 2,
    LitE: 1, // literal expression
};

/**
 * Provides hover content for the AST node at the given position.
 * @param uri The URI of the document.
 * @param position The position in the document.
 * @param astResolver The AST resolver.
 * @param lines The lines of the document.
 * @param settings The Motoko settings.
 * @returns An object containing the documentation and range, or undefined if no content is found.
 */
export async function getAstHoverContent(
    uri: string,
    position: Position,
    astResolver: AstResolver,
    lines: string[],
    settings: MotokoSettings | undefined,
): Promise<{ docs: string[]; range: Range | undefined } | undefined> {
    const status = astResolver.requestTyped(uri);
    if (!status || status.outdated || !status.ast) {
        return;
    }

    const node = findMostSpecificNodeForPosition(
        status.ast,
        position,
        (node) => {
            if (
                ignoredNodeNamesForHover.has(node.name) ||
                ((node.name === 'TupE' || node.name === 'TupP') &&
                    node.type !== '()')
            ) {
                return false;
            }

            if (node.name === 'TupT' && node.type === '()') {
                return 4;
            }

            return nodePriorities[node.name] || 0;
        },
        true, // Mouse cursor
    );

    if (!node) {
        return;
    }

    let range: Range | undefined = rangeFromNode(node, true);

    const startLine = lines[node.start[0] - 1];
    const isSameLine = node.start[0] === node.end[0];

    const codeSnippet = (source: string) =>
        `\`\`\`motoko\n${source.trimEnd()}\n\`\`\``;
    const source = (
        isSameLine ? startLine.substring(node.start[1], node.end[1]) : startLine
    ).trim();

    const hoveredWord = findHoveredWord(startLine, position.character);
    const maybeKeyword = findKeyword(hoveredWord);

    const typeRangeInfo = getTypeRangeInfo(
        status.ast,
        node,
        position,
        startLine,
        hoveredWord,
    );
    if (typeRangeInfo.range) {
        range = typeRangeInfo.range;
    }

    const nodeDocs =
        typeRangeInfo.type &&
        (!maybeKeyword ||
            maybeKeyword == 'actor' ||
            maybeKeyword == 'module' ||
            maybeKeyword == 'async') &&
        (isSameLine || node.name === 'LetD' || node.name === 'ExpD')
            ? findDocComments(uri, position, node)
            : [];

    const docs = generateDocParts(
        nodeDocs,
        typeRangeInfo.type,
        isSameLine,
        source,
        codeSnippet,
    );

    const info = getAstInformation(node);
    if (info) {
        docs.push(info);
    }

    if (settings?.debugHover) {
        docs.push(generateDebugInfo(node, codeSnippet));
    }

    return docs.length > 0 ? { docs, range } : undefined;
}

interface TypeRangeInfo {
    type: string | undefined;
    range?: Range;
}

function getNextSiblingNodeWithType(current: Node): Node | undefined {
    const parent = current.parent;
    if (!parent?.args) {
        return;
    }
    const index = parent.args.indexOf(current);
    if (index === -1) {
        return;
    }
    for (let i = index + 1; i < parent.args.length; i++) {
        const node = asNode(parent.args[i]);
        if (node?.type) {
            return node;
        }
    }
    return;
}

const ignoredExpDChildren = new Set(['IfE', 'RetE', 'SwitchE']);

function getTypeInfoFromExpD(
    node: Node,
    position: Position,
    startLine: string,
): TypeRangeInfo {
    if (node.args?.[0]) {
        const child = asNode(node.args[0]);
        if (child) {
            if (ignoredExpDChildren.has(child.name)) {
                return { type: undefined };
            }
            if (child.name === 'AwaitE' || child.name === 'ObjBlockE') {
                const defined = findTypeDeclarationRange(
                    node,
                    child,
                    position,
                    startLine,
                );
                if (defined) {
                    return defined;
                }
            }
        }
    }
    return { type: undefined };
}

function getTypeInfoFromLetD(
    node: Node,
    position: Position,
    startLine: string,
): TypeRangeInfo {
    if (node.args?.[0]) {
        const child = asNode(node.args[0]);
        if (child?.name === 'VarP') {
            const defined = findTypeDeclarationRange(
                node,
                child,
                position,
                startLine,
            );
            if (defined) {
                return defined;
            }
        }
    }
    return { type: undefined };
}

function handleAsyncNode(node: Node): TypeRangeInfo {
    if (
        !node.type ||
        (node.name === 'TupP' &&
            node.type === '()' &&
            node.parent?.name === 'FuncE')
    ) {
        return { type: undefined };
    }
    const needsAsyncKeyword =
        node.name === 'AsyncT' && !node.type.startsWith('async');
    return {
        type: needsAsyncKeyword ? 'async ' + node.type : node.type,
    };
}

function handleSiblingHasType(node: Node, parent: Node): TypeRangeInfo {
    if (parent.args) {
        const type = getNextSiblingNodeWithType(node)?.type;
        const isVar =
            parent.name === 'VarD' || parent.args.some((arg) => arg === 'Var');
        if (type) {
            return {
                type: isVar ? 'var ' + type : type,
            };
        }
    }
    return { type: undefined };
}

function handleParentDotH(parent: Node): TypeRangeInfo {
    if (parent.parent?.name === 'PathT') {
        if (parent.parent.parent?.type) {
            return { type: parent.parent.parent.type };
        }
        if (parent.parent.type) {
            return { type: parent.parent.type };
        }
    }
    return { type: undefined };
}

function handleParentIdH(node: Node, parent: Node, ast: AST): TypeRangeInfo {
    if (parent.parent?.name === 'PathT') {
        const pathT = parent.parent;
        if (pathT.parent?.name === 'AsyncT') {
            const type = handleAsyncNode(pathT.parent).type;
            if (type) {
                return {
                    type: type.replace(/<\$>\s?/g, ''),
                };
            }
        } else if (pathT.type) {
            return { type: pathT.type };
        }
    }
    if (parent.parent?.name === 'DotH' && typeof node.args?.[0] === 'string') {
        const type = findImportedModuleType(ast, node.args[0]);
        if (type) {
            return { type: type };
        }
    }
    return { type: undefined };
}

function handleParentVariantT(node: Node, hoveredWord: string): TypeRangeInfo {
    const type = asNode(node.args?.[0])?.type;
    if (type && type !== '()' && hoveredWord === `#${node.name}`) {
        const start =
            node.start && Position.create(node.start[0] - 1, node.start[1]);
        return {
            type: type,
            range:
                start &&
                Range.create(
                    start,
                    Position.create(
                        start.line,
                        start.character + node.name.length + 1, // including `#`
                    ),
                ),
        };
    }
    return { type: undefined };
}

function handleParentClassD(node: Node, parent: Node): TypeRangeInfo {
    if (getPreviousSiblingNode(node) === 'Object') {
        return { type: undefined };
    }

    if (typeof node.args?.[0] === 'string') {
        const classType = parent.args?.find((arg) =>
            ['Actor', 'Module'].includes(arg as string),
        ) as string | undefined;

        const argNode = getNextSiblingNodeWithType(node);
        let argType = '()';

        if (argNode) {
            if (argNode.name === 'ParP') {
                const argIdNode = asNode(
                    asNode(asNode(argNode.args?.[0])?.args?.[0])?.args?.[0],
                );
                if (
                    argIdNode?.name === 'ID' &&
                    argIdNode.args?.[0] &&
                    argIdNode.type
                ) {
                    argType = `(${argIdNode.args[0]} : ${argIdNode.type})`;
                }
            } else if (
                argNode.name === 'TupP' &&
                argNode.type &&
                argNode.type !== '()'
            ) {
                argType = argNode.type;
            }
        }

        const className = node.args[0];
        const typePrefix = classType ? `${classType.toLowerCase()} ` : '';
        return {
            type: `${typePrefix}class ${className}${argType}`,
        };
    }
    return { type: undefined };
}

function getTypeInfoFromUntypedNode(
    node: Node,
    ast: AST,
    hoveredWord: string,
): TypeRangeInfo {
    const parent = node.parent;
    if (!parent) return { type: undefined };
    switch (parent.name) {
        case 'ExpField':
        case 'TypD':
        case 'ValF':
        case 'VarD':
            return handleSiblingHasType(node, parent);
        case 'DotH':
            return handleParentDotH(parent);
        case 'IdH':
            return handleParentIdH(node, parent, ast);
        case 'VariantT':
            return handleParentVariantT(node, hoveredWord);
        case 'ClassD':
            return handleParentClassD(node, parent);
        default:
            return { type: undefined };
    }
}

function getTypeRangeInfo(
    ast: AST,
    node: Node,
    position: Position,
    startLine: string,
    hoveredWord: string,
): TypeRangeInfo {
    const res: TypeRangeInfo = (() => {
        if (node.name === 'ExpD') {
            return getTypeInfoFromExpD(node, position, startLine);
        }
        if (
            node.name === 'LetD' &&
            asNode(node.args?.[1])?.name !== 'ImportE'
        ) {
            return getTypeInfoFromLetD(node, position, startLine);
        }
        if (node.type) {
            return handleAsyncNode(node);
        }
        return getTypeInfoFromUntypedNode(node, ast, hoveredWord);
    })();

    const type = res.type === '???' ? '()' : res.type;

    return {
        type: typeof type !== 'undefined' ? formatMotoko(type) : undefined,
        range: res.range,
    };
}

export function getPreviousSiblingNode(current: Node): AST | undefined {
    const parent = current.parent;
    if (!parent) return undefined;

    const index = parent.args?.indexOf(current);
    if (index === undefined || index === -1) return undefined;

    const prev = parent.args?.[index - 1];

    return prev;
}

export function findTypeDeclarationRange(
    current: Node,
    child: Node,
    position: Position,
    startLine: string,
): TypeRangeInfo | undefined {
    const type = child.type;
    if (type) {
        const declaration = type.split(' ')[0];
        if (/[^\w#]/.test(declaration)) {
            return undefined;
        }

        if (current.start) {
            const line = current.start[0] - 1;
            if (line !== position.line) {
                return undefined;
            }

            const maybeIndex = startLine.indexOf(declaration);
            const index = maybeIndex !== -1 ? maybeIndex : undefined;

            if (index !== undefined) {
                const end = index + declaration.length;
                if (position.character < index || position.character > end) {
                    return undefined;
                }
                return {
                    type: type,
                    range: {
                        start: { line: line, character: index },
                        end: {
                            line: line,
                            character: end,
                        },
                    },
                };
            }
        }
    }

    return undefined;
}

function findImportedModuleType(ast: AST, module: string): string | undefined {
    const prog = findNodes(ast, (node) => node.name === 'Prog')[0];

    if (!prog?.args) {
        return;
    }

    for (const arg of prog.args) {
        const child = asNode(arg);

        if (child?.name !== 'LetD') {
            continue;
        }

        const grandchild = asNode(child.args?.[0]);

        if (grandchild?.name !== 'VarP') {
            continue;
        }

        const grandgrandchild = asNode(grandchild.args?.[0]);

        if (
            grandgrandchild?.name === 'ID' &&
            grandgrandchild.args?.[0] === module &&
            grandgrandchild.type
        ) {
            return grandgrandchild.type;
        }
    }

    return;
}

function findHoveredWord(line: string, character: number): string {
    // Go backwards from the cursor to find the start of the word
    let start = character;
    while (start > 0 && /[\w#]/.test(line[start - 1])) {
        start--;
    }

    // Go forwards from the cursor to find the end of the word
    let end = character;
    while (end < line.length && /[\w#]/.test(line[end])) {
        end++;
    }

    return line.substring(start, end);
}

function findKeyword(word: string): string | undefined {
    if (keywords.includes(word)) {
        return word;
    }

    return undefined;
}
