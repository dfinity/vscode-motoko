import { Node } from 'motoko/lib/ast';
import { Position } from 'vscode-languageserver-protocol';
import { findDefinitions } from '../navigation';
import { asNode } from '../syntax';
import { getPreviousSiblingNode } from './getAstHoverContent';

/**
 * Finds the semantically-relevant documentation for a given AST node.
 * @param node The AST node to find documentation for.
 * @returns A documentation string, or null if not found.
 */
function findDocumentationForNode(node: Node): string | null {
    let current = node;
    let depth = 0;
    const maxDepth = 4;

    while (
        depth < maxDepth &&
        // Unresolved import
        !(
            current.name === 'LetD' &&
            asNode(current.args?.[1])?.name === 'ImportE'
        )
    ) {
        if (current.name === 'Prog' && !current.doc) {
            const expD = asNode(current.args?.[0]);
            if (expD && expD.doc) {
                return expD.doc;
            } else {
                return null;
            }
        }

        if (current.doc) {
            return current.doc;
        }

        if (current.parent) {
            current = current.parent;
            depth++;
        } else {
            return null;
        }
    }
    return null;
}

/**
 * Checks local documentation for specific identifier.
 * @param node The AST node to find documentation for.
 * @returns A documentation string, or null if not found.
 */
function findLocalDocComment(node: Node): string | null {
    const parent = node.parent;
    if (parent) {
        switch (parent.name) {
            case 'VarD': {
                if (node.doc) {
                    return node.doc;
                }
                break;
            }
            case 'TypD': {
                if (parent.parent?.doc) {
                    return parent.parent.doc;
                }
                break;
            }
            case 'ClassD': {
                if (
                    getPreviousSiblingNode(node) !== 'Object' &&
                    parent.parent?.doc
                ) {
                    return parent.parent.doc;
                }
                break;
            }
            default:
                break;
        }
    }

    return null;
}

/**
 * Finds the most relevant documentation comment for a given AST node and its position.
 * @param uri The document URI.
 * @param position The position within the document.
 * @param node The most specific AST node at the given position.
 * @returns The found documentation string, or null.
 */
export function findDocComments(
    uri: string,
    position: Position,
    node: Node,
): string[] {
    const docs: string[] = [];

    const localDoc = findLocalDocComment(node);
    if (localDoc) {
        docs.push(localDoc);
    }

    const definitions = findDefinitions(uri, position, true);

    for (const definition of definitions) {
        const doc = findDocumentationForNode(definition.cursor);
        if (doc) {
            docs.push(doc);
        }
    }

    return docs;
}
