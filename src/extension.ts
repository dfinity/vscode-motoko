/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { workspace, ExtensionContext, window } from 'vscode';
import * as fs from 'fs';
import * as which from 'which';

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from 'vscode-languageclient';

const config = workspace.getConfiguration("motoko");

let client: LanguageClient;

export function activate(_context: ExtensionContext) {
  const dfx = getDfx();
  if (dfx === undefined){
    throw "Error cannot locate mo-ide"
  }

  const args = ["ide"]

  /* --------------- *
   * Language Server *
   * --------------- */
  let serverOptions: ServerOptions = {
    run: {
      command: dfx,
      args: args
    },
    debug: {
      command: dfx,
      args: args
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

function getDfx(): string | undefined {
  const dfx = config.get("dfx") as string;
  try {
      return which.sync(dfx);
  } catch (ex) {
    if (!fs.existsSync(dfx)){
      window.showErrorMessage(
        `Failed to locate dfx at ${dfx} check that dfx is installed or try changing motoko.dfx in settings`
      );
      return undefined;
    }else{
      return dfx;
    }
  }
}