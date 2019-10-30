/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { workspace, ExtensionContext } from 'vscode';

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from 'vscode-languageclient';

const config = workspace.getConfiguration("motoko");
const { moIde } = config;

let client: LanguageClient;

export function activate(context: ExtensionContext) {

  /* --------------- *
   * Language Server *
   * --------------- */
  let serverOptions: ServerOptions = {
    run: {
      command: moIde,
      args: []
    },
    debug: {
      command: moIde,
      args: []
    }
  };

  // Options to control the language client
  let clientOptions: LanguageClientOptions = {
    // Register the server for motoko source files
    documentSelector: [{ scheme: 'file', language: 'motoko' }],
    synchronize: {
      // Notify the server about file changes to '.clientrc files contained in the workspace
      fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
    }
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    'motoko',
    'Motoko language server',
    serverOptions,
    clientOptions
  );

  // Start the client. This will also launch the server
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
