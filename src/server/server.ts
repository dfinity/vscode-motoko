import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';
import { addHandlers } from './handlers';

const server = createConnection(ProposedFeatures.all);
addHandlers(server);
server.listen();
