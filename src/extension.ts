import { workspace, ExtensionContext, window } from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as which from "which";

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions
} from "vscode-languageclient";

const config = workspace.getConfiguration("motoko");

let client: LanguageClient;

export function activate(_context: ExtensionContext) {
  if (isDfxProject()) {
    return launchDfxProject();
  }

  const prompt = `We failed to detect a dfx project for this Motoko file. What file do you want to use as an entry point?`;
  const currentDocument = window.activeTextEditor?.document?.fileName;

  window
    .showInputBox({ prompt, value: currentDocument })
    .then(entryPoint => {
      if (entryPoint) {
        const serverCommand = {
          command: config.standaloneBinary,
          args: ["--canister-main", entryPoint].concat(
            config.standaloneArguments.split(" ")
          )
        };
        launchClient({ run: serverCommand, debug: serverCommand });
      }
    });
}

function launchDfxProject() {
  const dfx = getDfx();

  const canister = config.get("canister") as string;

  const args = ["_language-service"];
  if (canister !== "") {
    args.push(canister);
  }

  const serverCommand = { command: dfx, args };
  launchClient({ run: serverCommand, debug: serverCommand });
}

function launchClient(serverOptions: ServerOptions) {
  let clientOptions: LanguageClientOptions = {
    // Register the server for motoko source files
    documentSelector: [{ scheme: "file", language: "motoko" }],
    synchronize: {
      // Notify the server about file changes to '.clientrc files contained in the workspace
      fileEvents: workspace.createFileSystemWatcher("**/.clientrc")
    }
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    "motoko",
    "Motoko language server",
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

function isDfxProject(): boolean {
  const wsf = workspace.workspaceFolders;
  if (wsf) {
    return fs.existsSync(path.join(wsf[0].uri.fsPath, "dfx.json"));
  } else {
    return false;
  }
}

function getDfx(): string {
  const dfx = config.get("dfx") as string;
  try {
    return which.sync(dfx);
  } catch (ex) {
    if (!fs.existsSync(dfx)) {
      window.showErrorMessage(
        `Failed to locate dfx at ${dfx} check that dfx is installed or try changing motoko.dfx in settings`
      );
      throw Error("Failed to locate dfx");
    } else {
      return dfx;
    }
  }
}
