import * as path from 'path';
import { promises as fs } from 'fs';
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
import { isPositionInsideCommentOrString } from './commentRanges';

const nodeKeywords = new Set([
    'actor',
    'module',
    'async',
    'true',
    'false',
    'null',
]);

const allowedChars = /[\w#()[\]{}<>?"']/;
const allowedSymbols = /[()[\]{}<>?"']/;

const nonNodeKeywords = keywords.filter(
    (keyword) => !nodeKeywords.has(keyword),
);

const keywordDocCache = new Map<string, string | null>();

async function readKeywordDescription(
    keyword: string,
): Promise<string | undefined> {
    const cached = keywordDocCache.get(keyword);
    if (cached !== undefined) {
        return cached === null ? undefined : cached;
    }

    const filePath = path.join(
        path.resolve(__dirname, 'keywords'),
        `${keyword}.md`,
    );
    try {
        const contents = await fs.readFile(filePath, 'utf8');
        keywordDocCache.set(keyword, contents);
        return contents;
    } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code && nodeError.code !== 'ENOENT') {
            keywordDocCache.set(keyword, null);
            return undefined;
        }
    }

    keywordDocCache.set(keyword, null);
    return undefined;
}

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
    'IdxE',
    'IfE',
    'NotE',
    'ObjBlockE',
    'ObjE',
    'ObjT',
    'OrE',
    'ParP',
    'PathT',
    'RelE',
    'SwitchE',
    'TupE',
    'TupP',
    'VarE',
    'VariantT',
]);

const nodePriorities: Record<string, number> = {
    ID: 3,
    LitE: 2, // literal expression
    OptE: 1, // optional expression
    TupT: 1, // tuple type
    NamedT: 1, // named type
};

/**
 * Provides hover content for the AST node at the given position.
 * @param uri The URI of the document.
 * @param position The position in the document.
 * @param astResolver The AST resolver.
 * @param lines The lines of the document.
 * @param documentVersion The text document version, used to cache comment/string scans.
 * @param settings The Motoko settings.
 * @returns An object containing the documentation and range, or undefined if no content is found.
 */
export async function getAstHoverContent(
    uri: string,
    position: Position,
    astResolver: AstResolver,
    lines: string[],
    documentVersion: number | undefined,
    settings: MotokoSettings | undefined,
): Promise<{ docs: string[]; range: Range | undefined } | undefined> {
    const hoveredInfo = findHoveredWord(lines, position);
    const hovered = hoveredInfo.word;
    if (!hoveredInfo.isAllowedChar) {
        return;
    }

    const isNonNodeKeyword = nonNodeKeywords.includes(hovered.word);
    if (
        isNonNodeKeyword &&
        !isPositionInsideCommentOrString(uri, lines, position, documentVersion)
    ) {
        const description = await readKeywordDescription(hovered.word);
        if (!description) {
            return;
        }
        return {
            docs: [`\`\`\`motoko\n${hovered.word}\n\`\`\``, description],
            range: hovered.range,
        };
    }

    const status = astResolver.requestTyped(uri);
    if (!status || status.outdated || !status.ast) {
        return;
    }

    const node = findMostSpecificNodeForPosition(
        status.ast,
        position,
        (candidate) => {
            if (
                ignoredNodeNamesForHover.has(candidate.name) ||
                ((candidate.name === 'TupE' || candidate.name === 'TupP') &&
                    candidate.type !== '()')
            ) {
                return false;
            }
            if (candidate.name === 'NamedT' && hoveredInfo.isAllowedSymbol) {
                return false;
            }
            if (candidate.name === 'OptE' && !hoveredInfo.isQuestion) {
                return false;
            }

            if (candidate.name === 'ID' && candidate.args?.[0] === '$') {
                return 0;
            }

            return nodePriorities[candidate.name] || 0;
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

    const typeRangeInfo = getTypeRangeInfo(status.ast, node, hovered);
    if (typeRangeInfo.range) {
        range = typeRangeInfo.range;
    }

    const nodeDocs =
        typeRangeInfo.type &&
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

interface HoveredInfo {
    word: HoveredWord;
    isAllowedChar: boolean;
    isAllowedSymbol: boolean;
    isQuestion: boolean;
}

interface HoveredWord {
    word: string;
    range: Range;
}

interface TypeRangeInfo {
    type: string | undefined;
    range?: Range;
}

interface TypeContext {
    ast: AST;
    node: Node;
    hovered: HoveredWord;
}

type TypeResolver = (context: TypeContext) => TypeRangeInfo;

const nodeTypeResolvers: Record<string, TypeResolver> = {
    ExpD: ({ node, hovered }) => getTypeInfoFromExpD(node, hovered),
    LetD: ({ node, hovered }) => {
        if (asNode(node.args?.[1])?.name === 'ImportE') {
            return { type: undefined };
        }
        return getTypeInfoFromLetD(node, hovered);
    },
    TagE: ({ node, hovered }) => {
        const idNode = asNode(node.args?.[0]);
        if (
            idNode &&
            idNode.name === 'ID' &&
            hovered.word === '#' + idNode.args?.[0]
        ) {
            return handleTag(idNode, hovered);
        }
        return { type: undefined };
    },
    TagP: ({ node, hovered }) => {
        if (hovered.word === node.args?.[0]) {
            return handleTag(node, hovered);
        }
        return { type: undefined };
    },
    TupT: ({ node, hovered }) => handlePath(node, hovered),
    NamedT: ({ node, hovered }) => handlePath(node, hovered),
};

function resolveTypeRange(
    context: TypeContext,
    hovered: HoveredWord,
): TypeRangeInfo {
    const { node } = context;
    const handler = nodeTypeResolvers[node.name];
    if (handler) {
        const resolved = handler(context);
        if (resolved.type !== undefined || resolved.range) {
            return resolved;
        }
    }

    if (node.type) {
        if (node.parent?.name === 'TagE') {
            return handleTag(node, hovered);
        }
        return handleAsyncNode(node);
    }

    return getTypeInfoFromUntypedNode(node, context.ast, context.hovered.word);
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
        const candidate = asNode(parent.args[i]);
        if (candidate?.type) {
            return candidate;
        }
    }
    return;
}

const ignoredExpDChildren = new Set(['IfE', 'RetE', 'SwitchE']);

function getTypeInfoFromExpD(node: Node, hovered: HoveredWord): TypeRangeInfo {
    if (node.args?.[0]) {
        const child = asNode(node.args[0]);
        if (child) {
            if (ignoredExpDChildren.has(child.name)) {
                return { type: undefined };
            }
            if (child.name === 'AwaitE' || child.name === 'ObjBlockE') {
                const defined = findTypeDeclarationRange(child, hovered);
                if (defined) {
                    return defined;
                }
            }
        }
    }
    return { type: undefined };
}

function getTypeInfoFromLetD(node: Node, hovered: HoveredWord): TypeRangeInfo {
    if (node.args?.[0]) {
        const child = asNode(node.args[0]);
        if (child?.name === 'VarP') {
            const defined = findTypeDeclarationRange(child, hovered);
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
                    type,
                };
            }
        } else if (pathT.type) {
            return { type: pathT.type };
        }
    }
    if (parent.parent?.name === 'DotH' && typeof node.args?.[0] === 'string') {
        const type = findImportedModuleType(ast, node.args[0]);
        if (type) {
            return { type };
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
            type,
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

function handleTag(node: Node, hovered: HoveredWord): TypeRangeInfo {
    return { type: node.type, range: hovered.range };
}

function handlePath(node: Node, hovered: HoveredWord): TypeRangeInfo {
    if (node.args && hovered.word !== '') {
        const nameNum = node.args.indexOf(hovered.word);
        if (nameNum === -1) {
            return { type: undefined };
        }
        const typeNode = asNode(node.args[nameNum + 1]);
        if (typeNode) {
            return { type: typeNode.type, range: hovered.range };
        }
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

function resolveNormalizedType(result: TypeRangeInfo): TypeRangeInfo {
    const normalized =
        result.type === '???' ? '()' : result.type?.replace(/<\$>\s?/g, '');
    return {
        type:
            typeof normalized !== 'undefined'
                ? formatMotoko(normalized)
                : undefined,
        range: result.range,
    };
}

function getTypeRangeInfo(
    ast: AST,
    node: Node,
    hovered: HoveredWord,
): TypeRangeInfo {
    if (node.start && node.start[0] - 1 !== hovered.range.start.line) {
        return { type: undefined };
    }

    const context: TypeContext = {
        ast,
        node,
        hovered,
    };

    return resolveNormalizedType(resolveTypeRange(context, hovered));
}

export function getPreviousSiblingNode(current: Node): AST | undefined {
    const parent = current.parent;
    if (!parent) return undefined;

    const index = parent.args?.indexOf(current);
    if (index === undefined || index === -1) return undefined;

    const prev = parent.args?.[index - 1];

    return prev;
}

function findTypeDeclarationRange(
    child: Node,
    hovered: HoveredWord,
): TypeRangeInfo | undefined {
    const type = child.type;
    if (type) {
        const declaration = type.split(' ')[0];
        if (/[^\w#]/.test(declaration)) {
            return undefined;
        }
        return {
            type,
            range: hovered.range,
        };
    }

    return undefined;
}

function findImportedModuleType(ast: AST, module: string): string | undefined {
    const prog = findNodes(ast, (candidate) => candidate.name === 'Prog')[0];

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

/**
 * Extracts contextual information about the token under the cursor.
 * Collects a word made of `[a-zA-Z0-9_#]`, captures its range, and flags bracket/question tokens.
 * @param lines - Full document text split per line.
 * @param position - Cursor position within the document.
 * @returns Hover metadata for the current position.
 */
function findHoveredWord(lines: string[], position: Position): HoveredInfo {
    const lineString = lines[position.line];
    const hoveredChar = lineString[position.character];
    const isAllowedChar = allowedChars.test(hoveredChar);
    const isAllowedSymbol = allowedSymbols.test(hoveredChar);
    const isQuestion = hoveredChar === '?';

    let start = position.character;
    while (start > 0 && /[\w#]/.test(lineString[start - 1])) {
        start--;
    }

    let end = position.character;
    while (end < lineString.length && /[\w#]/.test(lineString[end])) {
        end++;
    }

    return {
        word: {
            word: lineString.substring(start, end),
            range: {
                start: {
                    line: position.line,
                    character: start,
                },
                end: {
                    line: position.line,
                    character: end,
                },
            },
        },
        isAllowedChar,
        isAllowedSymbol,
        isQuestion,
    };
}
