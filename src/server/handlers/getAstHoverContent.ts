import { Position, Range } from 'vscode-languageserver/node';
import AstResolver from '../ast';
import { MotokoSettings } from '../handlers';
import { getAstInformation } from '../information';
import { findMostSpecificNodeForPosition, rangeFromNode } from '../navigation';
import { formatMotoko } from '../utils';
import { findDocComments } from './findDocComments';
import { Node, asNode, AST } from 'motoko/lib/ast';
import { findNodes } from '../syntax';

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
            if (node.name === 'ID') {
                return node.type ? 2 : 1;
            }
            return 0;
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

    const nodeDocs = isSameLine ? findDocComments(uri, position, node) : [];

    const typeRangeInfo = getTypeRangeInfo(
        status.ast,
        node,
        position,
        startLine,
    );
    if (typeRangeInfo.range) {
        range = typeRangeInfo.range;
    }

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

function getTypeInfoFromExpD(
    node: Node,
    position: Position,
    startLine: string,
): TypeRangeInfo {
    if (node.args?.[0]) {
        const child = asNode(node.args[0]);
        if (child) {
            if (new Set(['IfE', 'RetE', 'SwitchE']).has(child.name)) {
                return { type: undefined };
            }
            if (child.name === 'AwaitE' || child.name === 'ObjBlockE') {
                const defined = findTypeDeclarationRange(
                    node,
                    child,
                    position,
                    startLine,
                );
                return defined || { type: undefined };
            }
            if (child.type) {
                return { type: formatMotoko(child.type) };
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

function getTypeInfoFromTypedNode(node: Node): TypeRangeInfo {
    if (!node.type) {
        return { type: undefined };
    }
    const needsAsyncKeyword =
        node.name === 'AsyncT' && !node.type.startsWith('async');
    return {
        type: needsAsyncKeyword
            ? formatMotoko('async ' + node.type)
            : formatMotoko(node.type),
    };
}

function handleParentExpFieldTypDValFVarD(
    node: Node,
    parent: Node,
): TypeRangeInfo {
    if (parent.args) {
        const type = getNextSiblingNodeWithType(node)?.type;
        const isVar =
            parent.name === 'VarD' || parent.args.some((arg) => arg === 'Var');
        if (type) {
            return {
                type: isVar ? formatMotoko('var ' + type) : formatMotoko(type),
            };
        }
    }
    return { type: undefined };
}

function handleParentDotH(parent: Node): TypeRangeInfo {
    if (parent.parent?.name === 'PathT' && parent.parent.type) {
        return { type: formatMotoko(parent.parent.type) };
    }
    return { type: undefined };
}

function handleParentIdH(node: Node, parent: Node, ast: AST): TypeRangeInfo {
    if (parent.parent?.name === 'PathT' && parent.parent?.type) {
        return { type: formatMotoko(parent.parent.type) };
    }
    if (parent.parent?.name === 'DotH' && typeof node.args?.[0] === 'string') {
        const type = findImportedModuleType(ast, node.args[0]);
        if (type) {
            return { type: formatMotoko(type) };
        }
    }
    return { type: undefined };
}

function handleParentVariantT(node: Node): TypeRangeInfo {
    const type = asNode(node.args?.[0])?.type;
    if (type && type !== '()') {
        const start =
            node.start && Position.create(node.start[0] - 1, node.start[1]);
        return {
            type: formatMotoko(type),
            range:
                start &&
                Range.create(
                    start,
                    Position.create(
                        start.line,
                        start.character + node.name.length + 1,
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
        const isActor = parent.args?.some((arg) => arg === 'Actor');
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
            } else if (argNode.name === 'TupP' && argNode.type) {
                argType = argNode.type;
            }
        }

        const className = node.args[0];
        return {
            type: isActor
                ? formatMotoko(`actor class ${className}${argType}`)
                : formatMotoko(`class ${className}${argType}`),
        };
    }
    return { type: undefined };
}

function getTypeInfoFromUntypedNode(node: Node, ast: AST): TypeRangeInfo {
    const parent = node.parent;
    if (!parent) return { type: undefined };
    switch (parent.name) {
        case 'ExpField':
        case 'TypD':
        case 'ValF':
        case 'VarD':
            return handleParentExpFieldTypDValFVarD(node, parent);
        case 'DotH':
            return handleParentDotH(parent);
        case 'IdH':
            return handleParentIdH(node, parent, ast);
        case 'VariantT':
            return handleParentVariantT(node);
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
): TypeRangeInfo {
    const ignoredNodeNames = new Set([
        'AsyncE',
        'BlockE',
        'FuncE',
        'ObjE',
        'ObjT',
        'VariantT',
    ]);
    if (ignoredNodeNames.has(node.name)) {
        return { type: undefined };
    }

    if (node.name === 'ExpD') {
        return getTypeInfoFromExpD(node, position, startLine);
    }

    if (node.name === 'LetD') {
        return getTypeInfoFromLetD(node, position, startLine);
    }

    if (node.type) {
        return getTypeInfoFromTypedNode(node);
    }

    return getTypeInfoFromUntypedNode(node, ast);
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

        if (current.start) {
            const line = current.start[0] - 1;
            if (!line || line !== position.line) {
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
                    type,
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
            grandgrandchild.args?.[0] === module
        ) {
            return grandgrandchild.type;
        }
    }

    return;
}
