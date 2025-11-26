import { getContext } from '../context';
import { AST, Node } from 'motoko/lib/ast';
import {
    CancellationToken,
    Location,
    ReferenceParams,
} from 'vscode-languageserver/node';
import {
    Definition,
    findDefinitions,
    locationFromDefinition,
    locationFromUriAndRange,
    rangeFromNode,
    sameDefinition,
} from '../navigation';
import { findNodes, getIdName, matchNode } from '../syntax';
import { LocationSet } from '../utils';

export function mkOnReferencesHandler(
    isVirtualFileSystemReady: boolean,
): (event: ReferenceParams, _token: CancellationToken) => Location[] {
    return (event, _token) => {
        console.log('[References]');

        function idOfVar(node: AST): Node | undefined {
            return (
                matchNode(node, 'VarE', (id: Node) => id) ||
                matchNode(node, 'VarP', (id: Node) => id) ||
                matchNode(node, 'VarD', (id: Node) => id) ||
                matchNode(node, 'ID', (_id: string) => node as Node) ||
                undefined
            );
        }

        function searchAstStatus(
            definitions: Definition[],
            uri: string,
            ast: AST,
        ): LocationSet {
            const references = new LocationSet();
            const nodes = findNodes(ast, (node, _parents) =>
                definitions.some(
                    (definition) =>
                        getIdName(idOfVar(node)) === definition.name,
                ),
            );
            for (const node of nodes) {
                try {
                    const range = rangeFromNode(node);
                    if (!range) {
                        continue;
                    }
                    const referenceDefinitions = findDefinitions(
                        uri,
                        range.start,
                    );
                    if (
                        !definitions.some((definition) =>
                            referenceDefinitions.some((referenceDefinition) =>
                                sameDefinition(definition, referenceDefinition),
                            ),
                        )
                    ) {
                        continue;
                    }
                    // We might get a definition that includes the entire body
                    // of the declaration but we only want the range for its ID.
                    const reference = rangeFromNode(idOfVar(node));
                    references.add(locationFromUriAndRange(uri, reference!));
                    if (event.context.includeDeclaration) {
                        referenceDefinitions.forEach((refDef) => {
                            const range = rangeFromNode(
                                idOfVar(refDef.cursor),
                            )!;
                            const location = locationFromUriAndRange(
                                refDef.uri,
                                range,
                            );
                            references.add(location);
                        });
                    } else {
                        referenceDefinitions.forEach((refDef) => {
                            references.delete(locationFromDefinition(refDef));
                        });
                    }
                } catch (err) {
                    console.error(
                        `Error while finding references for node of ${uri}:`,
                    );
                    console.error(err);
                }
            }

            return references;
        }

        function astReferences(
            uri: string,
            event: ReferenceParams,
        ): LocationSet {
            const references = new LocationSet();
            const definitions = findDefinitions(uri, event.position);
            if (!definitions.length) {
                console.log(
                    `No definitions for (${event.position.line}, ${event.position.character}) at ${uri}`,
                );
                return references;
            }

            const context = getContext(uri);
            const statuses = context.astResolver.requestAll(
                isVirtualFileSystemReady,
            );
            for (const status of statuses) {
                try {
                    if (!status.ast) {
                        throw new Error(`AST for ${status.uri} not found`);
                    }
                    references.union(
                        searchAstStatus(definitions, status.uri, status.ast),
                    );
                } catch (err) {
                    console.error(
                        `Error while finding references for ${status.uri}:`,
                    );
                    console.error(err);
                }
            }

            if (!event.context.includeDeclaration) {
                for (const definition of definitions) {
                    references.delete(locationFromDefinition(definition));
                }
            }

            return references;
        }

        const references = new LocationSet();
        const uri = event.textDocument.uri;
        try {
            references.union(astReferences(uri, event));
        } catch (err) {
            console.error('Error while finding references:');
            console.error(err);
            // throw err;
        }

        return Array.from(references.values());
    };
}
