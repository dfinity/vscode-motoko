import { TextDocument } from 'vscode-languageserver-textdocument';
import { AST, Node } from 'motoko/lib/ast';
import {
    SignatureHelp,
    SignatureHelpParams,
    CancellationToken,
    TextDocuments,
} from 'vscode-languageserver/node';

import { getContext } from '../context';
import { findNodes } from '../syntax';

/**
 * Creates a handler for the onSignatureHelp event
 *
 * @param documents The document manager
 * @returns The onSignatureHelp event handler
 */
export function mkOnSignatureHelpHandler(
    documents: TextDocuments<TextDocument>,
): (
    params: SignatureHelpParams,
    _token: CancellationToken,
) => SignatureHelp | null {
    const paramsRe = /^.*?\((.+)\)\s*->/; // Regular expression to extract parameters from function type
    return (params, _token) => {
        const { textDocument, position, context } = params;
        if (!context) return null;
        const { uri } = textDocument;
        const doc = documents.get(uri);
        if (!doc) return null;
        const { astResolver } = getContext(uri);
        const status = astResolver.requestTyped(uri);
        if (!status || !status.ast) return null;
        const cursorOffset = doc.offsetAt(position);
        const funcNodes = findFuncNodes(status.ast, doc, cursorOffset);
        if (!funcNodes.length) return null;
        const text = doc.getText();
        let i = 0;
        let activeParameter = undefined;
        let fInfo = null;
        while (i < funcNodes.length && activeParameter === undefined) {
            fInfo = funcInfo(funcNodes[i], doc);
            activeParameter = getActiveParamIndex(
                fInfo.offset,
                text,
                cursorOffset,
            );
            i++;
        }
        if (activeParameter === undefined) return null;
        const { funcName, funcType } = fInfo as any;
        const paramsString = funcType.match(paramsRe)?.[1] ?? '';
        const startIndex = funcName.length + funcType.indexOf(paramsString);
        const funcParams = splitParams(paramsString, startIndex);
        return {
            signatures: [
                {
                    label: `${funcName}${funcType}`,
                    parameters: funcParams.map((p) => ({ label: p })),
                },
            ],
            activeSignature: 0,
            activeParameter: activeParameter,
        };
    };
}

/**
 * Calculates the current parameter index
 *
 * @param paramOffset Usually the offset of the first caracter after function name
 * @param text Document text
 * @param cursorOffset Offset of current cursor position
 * @returns Parameter index or undefined if current cursor position is outside
 * function signature
 */
function getActiveParamIndex(
    paramOffset: number,
    text: string,
    cursorOffset: number,
): number | undefined {
    let paren = 0,
        brack = 0,
        brace = 0,
        angle = 0,
        index = 0;
    if (cursorOffset == paramOffset) return undefined;
    let i = paramOffset;
    while (i < cursorOffset) {
        i = skipBlockComment(text, i, cursorOffset);
        i = skipString(text, i, cursorOffset);
        if (i > cursorOffset) break;
        const ch = text[i];
        if (ch === '(') paren++;
        if (ch === ')') {
            paren--;
            if (paren === 0) return undefined;
        }
        if (ch === '[') brack++;
        if (ch === ']') brack--;
        if (ch === '{') brace++;
        if (ch === '}') brace--;
        if (ch === '<') angle++;
        if (ch === '>') angle--;
        if (ch === ',' && paren == 1 && !brack && !brace && !angle) {
            index++;
        }
        i++;
    }
    if (paren <= 0) return undefined;
    return index;
}

/**
 * Skips block comment if it starts at `offset`. Returns the offset of the first
 * character after the end of comment. Otherwise returns original offset.
 *
 * @param text The text of document
 * @param offset Current offset in the document
 * @return Offset of the first caracter after the comment or original offset
 * */
function skipBlockComment(
    text: string,
    offset: number,
    cursorOffset: number,
): number {
    if (text.slice(offset, offset + 2) === '/*') {
        let i = offset + 2;
        while (i < cursorOffset && text.slice(i, i + 2) !== '*/') i++;
        return i + 2;
    }
    return offset;
}

/**
 * Skips string if it starts at `offset`. Returns the offset of the first
 * character after the end of string. Otherwise returns original offset.
 *
 * @param text The text of document
 * @param offset Current offset in the document
 * @return Offset of the first caracter after the string or original offset
 * */
function skipString(
    text: string,
    offset: number,
    cursorOffset: number,
): number {
    if (text[offset] === '"') {
        let i = offset + 1;
        while (i < cursorOffset && !(text[i] === '"' && text[i - 1] !== '\\'))
            i++;
        return i + 1;
    }
    return offset;
}

/**
 * Splits the single parameters string to the list of parameters
 *
 * @param pString Function parameters string
 * @returns List of parameters
 */
function splitParams(
    paramsString: string,
    startIndex: number,
): [number, number][] {
    let paren = 0;
    let brack = 0;
    let brace = 0;
    let start = 0;
    const params: [number, number][] = [];
    for (let i = 0; i < paramsString.length; i++) {
        const ch = paramsString[i];
        if (ch === '(') paren++;
        if (ch === ')') paren--;
        if (ch === '[') brack++;
        if (ch === ']') brack--;
        if (ch === '{') brace++;
        if (ch === '}') brace--;
        if (ch === ',' && !paren && !brack && !brace) {
            params.push([startIndex + start, startIndex + i]);
            start = i + 1;
        }
    }
    params.push([startIndex + start, startIndex + paramsString.length]);
    return params;
}

/**
 * Finds all nodes with function names before current cursor position related to
 * function calls. Returns nodes in order starting from nearest to current cursor
 * position.
 *
 * @param ast Current AST
 * @param doc Current document
 * @param cursorOffset The offset of current cursor position
 * @returns List of Nodes near to the current cursor position containing function
 * information
 * */
function findFuncNodes(
    ast: AST,
    doc: TextDocument,
    cursorOffset: number,
): Node[] {
    function posDesc(a: Node, b: Node): number {
        if (!(a.start && b.start)) return 0;
        const aStartOffset = doc.offsetAt({
            line: a.start[0] - 1,
            character: a.start[1],
        });
        const bStartOffset = doc.offsetAt({
            line: b.start[0] - 1,
            character: b.start[1],
        });
        return bStartOffset - aStartOffset;
    }
    const nodes = findNodes(ast, funcNodesPred(doc, cursorOffset))
        .map((n) => n as any)
        .sort(posDesc);
    return nodes;
}

/**
 * Creates a predicate for `findNodes` function to find nodes related to function calls
 *
 * @param doc Current document
 * @param cursorOffset Current cursor offset
 * @returns Predicate for `findNodes`
 * */
function funcNodesPred(
    doc: TextDocument,
    cursorOffset: number,
): (node: Node, parents: Node[]) => any {
    return (node: Node, _parents: Node[]) => {
        if (!(node.start && node.end && node.typeRep)) return false;
        const endOffset = doc.offsetAt({
            line: node.end[0] - 1,
            character: node.end[1] - 1,
        });
        const funcCond =
            node.name === 'ID' &&
            node.typeRep.name === 'Func' &&
            cursorOffset > endOffset;
        if (funcCond) return true;
        return false;
    };
}

/**
 * Extracts function name, function type and offset of function name end position.
 *
 * @param node The node containing function information found by `findFuncNodes`
 * @param doc Current document
 * @returns An object with function information
 * */
function funcInfo(
    node: Node,
    doc: TextDocument,
): { funcName: string; offset: number; funcType: string } {
    return {
        funcName: (node as any).args[0],
        offset: doc.offsetAt({
            line: (node as any).end[0] - 1,
            character: (node as any).end[1],
        }),
        funcType: node.type as string,
    };
}
