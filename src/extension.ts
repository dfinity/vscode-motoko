import { workspace, ExtensionContext, window, commands, languages, TextDocument, TextEdit } from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as which from "which";
import { execSync } from "child_process";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from "vscode-languageclient/node";
import { formatDocument } from "./formatter";

const config = workspace.getConfiguration("motoko");

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  context.subscriptions.push(
    commands.registerCommand("motoko.startService", startServer)
  );
  context.subscriptions.push(
    languages.registerDocumentFormattingEditProvider('motoko', {
      provideDocumentFormattingEdits(document: TextDocument): TextEdit[] {
        return formatDocument(document, context);
      },
    }));
  startServer();
}

export function startServer() {
  if (client) {
    client.stop();
  }

  const dfxConfig = isDfxProject();
  if (dfxConfig !== null) {
    return launchDfxProject(dfxConfig);
  }

  const prompt = `We failed to detect a dfx project for this Motoko file. What file do you want to use as an entry point?`;
  const currentDocument = window.activeTextEditor?.document?.fileName;

  window.showInputBox({ prompt, value: currentDocument }).then((entryPoint) => {
    if (entryPoint) {
      const serverCommand = {
        command: config.standaloneBinary,
        args: ["--canister-main", entryPoint]
          .concat(vesselArgs())
          .concat(config.standaloneArguments.split(" ")),
      };
      launchClient({ run: serverCommand, debug: serverCommand });
    }
  });
}

function launchDfxProject(dfxConfig: DfxConfig) {
  const start = (canister: string) => {
    const serverCommand = {
      command: getDfx(),
      args: ["_language-service", canister],
    };
    launchClient({ run: serverCommand, debug: serverCommand });
  };

  let canister = config.get("canister") as string;
  let canisters = Object.keys(dfxConfig.canisters);

  if (canister !== "") start(canister);
  else if (canisters.length === 1) start(canisters[0]);
  else
    window
      .showQuickPick(canisters, {
        canPickMany: false,
        placeHolder: "What canister do you want to work on?",
      })
      .then((c) => {
        if (c) start(c);
      });
}

function launchClient(serverOptions: ServerOptions) {
  let clientOptions: LanguageClientOptions = {
    // Register the server for motoko source files
    documentSelector: [{ scheme: "file", language: "motoko" }],
    synchronize: {
      // Notify the server about file changes to '.clientrc files contained in the workspace
      fileEvents: workspace.createFileSystemWatcher("**/.clientrc"),
    },
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

interface DfxCanisters {
  [key: string]: { main: string };
}

type DfxConfig = {
  canisters: DfxCanisters;
};

function isDfxProject(): DfxConfig | null {
  const wsf = workspace.workspaceFolders;
  if (wsf) {
    try {
      return JSON.parse(
        fs
          .readFileSync(path.join(wsf[0].uri.fsPath, "dfx.json"))
          .toString("utf8")
      );
    } catch {
      return null;
    }
  } else {
    return null;
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

function vesselArgs(): string[] {
  try {
    let ws = workspace.workspaceFolders!![0].uri.fsPath;
    if (
      !fs.existsSync(path.join(ws, "vessel.dhall")) &&
      // TODO: Remove this once vessel has been using dhall for a while
      !fs.existsSync(path.join(ws, "vessel.json"))
    )
      return [];
    let flags = execSync("vessel sources", {
      cwd: ws,
    }).toString("utf8");
    return flags.split(" ");
  } catch (err) {
    console.log(err);
    return [];
  }
}
