# Motoko - VS Code Extension

> #### Motoko language support for [Visual Studio Code](https://code.visualstudio.com/).

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/dfinity-foundation.vscode-motoko?color=brightgreen&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=dfinity-foundation.vscode-motoko)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/dfinity/prettier-plugin-motoko/issues)

## Features

- Syntax highlighting
- Code formatter
- Error checking
- When using a [dfx.json](https://medium.com/@chiedo/6-steps-to-deploying-your-first-dapp-on-the-internet-computer-b9a36b45f91e) config file:
  - Autocompletion
  - Go to definition

## Installation

Get this extension through the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=dfinity-foundation.vscode-motoko), or alternatively the [Extensions panel](https://code.visualstudio.com/docs/editor/extension-marketplace) in your VS Code project.

## Integrations

- [`dfx`](https://internetcomputer.org/docs/current/developer-docs/build/install-upgrade-remove/) (autocompletion, error checking, go-to-definition)
- [`prettier-plugin-motoko`](https://npmjs.com/package/prettier-plugin-motoko) (code formatter)

## Extension Commands

- `motoko.startService`: Starts (or restarts) the language service. This is automatically triggered when opening a Motoko project.

## Extension Settings

- `motoko.dfx`: The location of the `dfx` binary
- `motoko.canister`: The default canister name to use in multi-canister projects
- `motoko.standaloneArguments`: Additional arguments to pass to the language service when running in a non-dfx project
- `motoko.standaloneBinary`: The location of the `mo-ide` binary (when running in a non-dfx project)
- `motoko.formatter`: The formatter used by the extension
- `motoko.legacyDfxSupport`: Uses legacy `dfx`-dependent features when a `dfx.json` file is available

## Contributing

### Set up your local development environment:

```bash
git clone https://github.com/dfinity/vscode-motoko
cd vscode-motoko
npm install
```

### Build the extension with your local changes:

```bash
npm run package
```

This generates a file named `vscode-motoko-x.x.x.vsix` in the project root.

### Install your local extension in VS Code:

```bash
code --install-extension vscode-motoko-x.x.x.vsix
```

Alternatively, right-click the `.vsix` file and then select the "Install Extension VSIX" option.

---

Community [PRs](https://github.com/dfinity/vscode-motoko/pulls) are welcome! Be sure to check the list of [open issues](https://github.com/dfinity/vscode-motoko/issues) in case anything catches your eye.
