import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';

// Create a connection for the language server
const connection = createConnection(ProposedFeatures.all);

export default connection;
