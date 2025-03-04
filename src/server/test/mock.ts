import { Duplex } from 'node:stream';
import {
    Connection,
    createConnection,
    InitializeParams,
    ProposedFeatures,
} from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import { addHandlers } from '../handlers';
import { forwardMessage } from '../utils';

export class MockDuplex extends Duplex {
    _write(chunk: Buffer, _encoding: BufferEncoding, callback: Function) {
        this.emit('data', chunk);
        callback();
    }

    _read(_size: number) {}
}

export const configParams = {
    settings: {
        motoko: {
            dfx: 'dfx',
            legacyLanguageServer: true,
            maxNumberOfProblems: 100,
            hideWarningRegex: '',
            trace: {
                server: 'verbose',
            },
            debugHover: false,
            canister: '',
            formatter: 'prettier',
        },
    },
};

export const clientInitParams = (rootUri: URI): InitializeParams => {
    return {
        processId: null, // to prevent watchdog killing the process
        rootPath: rootUri.fsPath,
        rootUri: rootUri.toString(),
        workspaceFolders: [
            {
                name: 'fixture',
                uri: rootUri.toString(),
            },
        ],
        capabilities: {
            textDocument: {
                synchronization: {
                    dynamicRegistration: true,
                    willSave: true,
                    didSave: true,
                    willSaveWaitUntil: true,
                },
                hover: {
                    dynamicRegistration: true,
                    contentFormat: ['markdown', 'plaintext'],
                },
                completion: {
                    dynamicRegistration: true,
                    completionItem: { snippetSupport: true },
                },
                signatureHelp: { dynamicRegistration: true },
                references: { dynamicRegistration: true },
                documentHighlight: { dynamicRegistration: true },
                documentSymbol: { dynamicRegistration: true },
            },
            workspace: {
                applyEdit: true,
                workspaceEdit: { documentChanges: true },
                workspaceFolders: true,
            },
        },
    };
};

export const setupClientServer = (
    redirectConsole: boolean = false,
): [Connection, Connection] => {
    const up = new MockDuplex();
    const down = new MockDuplex();

    const client = createConnection(down, up);

    client.console.log = forwardMessage(console.log);
    client.console.warn = forwardMessage(console.warn);
    client.console.error = forwardMessage(console.error);

    const server = createConnection(ProposedFeatures.all, up, down);

    if (!redirectConsole) {
        server.console.log = forwardMessage(console.log);
        server.console.warn = forwardMessage(console.warn);
        server.console.error = forwardMessage(console.error);
    }

    client.onRequest('client/registerCapability', () => {});
    client.listen();

    addHandlers(server, redirectConsole);
    server.listen();

    return [client, server];
};
