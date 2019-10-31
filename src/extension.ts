/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { workspace, ExtensionContext, window } from 'vscode';
import * as fs from 'fs';

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from 'vscode-languageclient';
import { fstat } from 'fs';

const config = workspace.getConfiguration("motoko");
const { moIde } = config;

let client: LanguageClient;

export function activate(context: ExtensionContext) {

  if (!fs.existsSync(moIde)){
    window.showErrorMessage(
      `Failed to locate the Motoko IDE at ${moIde} try changing motoko.moIde in settings`
    );
    return;
  }
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
