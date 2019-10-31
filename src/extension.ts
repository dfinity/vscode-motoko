/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { workspace, ExtensionContext, window } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as which from 'which';

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from 'vscode-languageclient';

const config = workspace.getConfiguration("motoko");

let client: LanguageClient;

export function activate(_context: ExtensionContext) {
  let canisterMain = getCanisterMain();
  let moIde = getMoIde();
  if (moIde === undefined){
    throw "Error cannot locate mo-ide"
  }
  let args: string[];
  if (canisterMain === undefined){
    args = []
  }else{
    args = ["--canister-main", canisterMain.main]
  }

  /* --------------- *
   * Language Server *
   * --------------- */
  let serverOptions: ServerOptions = {
    run: {
      command: moIde,
      args: args
    },
    debug: {
      command: moIde,
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

// This is a subset of a normal Dfx.json
interface DfxJson {
  canisters: Map<string, Canister>
}
interface Canister {
  main: string
}
function canister(path: string): Canister {
  return {main: path};
}

function getCanisterMain(): Canister | undefined {
  const canisterMainPath = config.get("canisterMainPath") as string;
  const workspaceFolders = workspace.workspaceFolders;
  let dfxPath = undefined;
  if (workspaceFolders === undefined){
    return undefined
  }else{
    const projectRoot:string = workspaceFolders[0].uri.fsPath;
    const dfxJson =  "dfx.json"; 
    dfxPath = path.join(projectRoot, dfxJson);
  }

  // users have troube differentiating between empty strings and whitespace
  if (canisterMainPath.trim() !== ""){
    window.showWarningMessage(
       "Reading canister main path from motoko.canisterMainPath, this is probably not what you want"
    )
    return canister(canisterMainPath);
  }else{
    if (!fs.existsSync(dfxPath)){
      return undefined;
    } else{
      const contents: string = fs.readFileSync(dfxPath).toString();
      const dfxJson: DfxJson = JSON.parse(contents);
      // these shenaigans are because JSON.parse parses Maps into objects
      const canisterMap: Map<string, Canister> = new Map(Object.entries(dfxJson.canisters));
      const canisterKeys: string[] = Array.from(canisterMap.keys());

      switch (canisterKeys.length) {
        case 0:
          window.showErrorMessage("No canister roots found in your dfx.json");
          return undefined;
        case 1:
          return canisterMap.get(canisterKeys[0]);
        default:
          const root = canisterKeys[0];
          window.showWarningMessage(`Multiple canisters found so canister ${root} was chosen`);
          return canisterMap.get(canisterKeys[0]);
      }
    }
  }
}

function getMoIde(): string | undefined {
  const moIde = config.get("moIde") as string;
  try {
      return which.sync(moIde);
  } catch (ex) {
    if (!fs.existsSync(moIde)){
      window.showErrorMessage(
        `Failed to locate the Motoko IDE at ${moIde} try changing motoko.moIde in settings`
      );
      return undefined;
    }else{
      return moIde;
    }
  }
}