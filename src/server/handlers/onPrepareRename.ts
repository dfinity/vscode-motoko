import { getContext } from '../context';
import { Node } from 'motoko/lib/ast';
import { keywords, typeKeywords } from 'motoko/lib/keywords';
import {
    CancellationToken,
    PrepareRenameParams,
} from 'vscode-languageserver/node';
import { Range } from 'vscode-languageserver';
import {
    findDefinitions,
    findMostSpecificNodeForPosition,
    rangeFromNode,
} from '../navigation';
import { getIdName } from '../syntax';
import { isExternalUri } from '../utils';

export function mkOnPrepareRenameHandler(
    isVirtualFileSystemReady: boolean,
): (event: PrepareRenameParams, _token: CancellationToken) => Range | null {
    return ({ position, textDocument }, _token) => {
        const { uri } = textDocument;
        const context = getContext(uri);
        const status = context.astResolver.request(
            uri,
            isVirtualFileSystemReady,
        );
        if (!status?.ast) {
            console.warn('Missing AST for', uri);
            return null;
        }
        if (status.outdated) {
            console.log('Outdated AST for', uri);
            return null;
        }
        const node = findMostSpecificNodeForPosition(
            status.ast,
            position,
            (node: Node) => node.name === 'ID',
            true,
        );
        const name = getIdName(node);
        if (!name || keywords.includes(name) || typeKeywords.includes(name)) {
            return null;
        }

        // We should not be able to rename something that was externally imported.
        const definitions = findDefinitions(uri, position, true);
        for (const definition of definitions) {
            if (isExternalUri(definition.uri)) {
                return null;
            }
        }

        return rangeFromNode(node) ?? null;
    };
}
