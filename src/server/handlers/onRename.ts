import {
    CancellationToken,
    RenameParams,
    TextEdit,
    WorkspaceEdit,
} from 'vscode-languageserver/node';
import { compareLocations } from '../utils';
import { mkOnReferencesHandler } from './onReferences';

export function mkOnRenameHandler(
    isVirtualFileSystemReady: boolean,
): (
    event: RenameParams,
    _token: CancellationToken,
) => WorkspaceEdit | null | undefined {
    return ({ position, textDocument, newName }, token) => {
        const references = mkOnReferencesHandler(isVirtualFileSystemReady)(
            { position, textDocument, context: { includeDeclaration: true } },
            token,
        );
        references.sort(compareLocations);

        const changes: { [uri: string]: TextEdit[] } = {};
        for (let i = 0; i < references.length; ) {
            const uri = references[i].uri;
            const edits: TextEdit[] = [];
            while (i < references.length && references[i].uri === uri) {
                edits.push({ range: references[i].range, newText: newName });
                ++i;
            }
            changes[uri] = edits;
        }

        return {
            changes,
        };
    };
}
