# Motoko - VS Code Extension

> #### Motoko language support for [Visual Studio Code](https://code.visualstudio.com/).

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/dfinity-foundation.vscode-motoko?color=brightgreen&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=dfinity-foundation.vscode-motoko)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/dfinity/prettier-plugin-motoko/issues)

## Overview

[Motoko](https://github.com/dfinity/motoko) is a high-level smart contract language for the [Internet Computer](https://internetcomputer.org/).

This IDE extension provides type checking, formatting, snippets, and more for [Motoko canister development](https://internetcomputer.org/docs/current/developer-docs/build/cdks/motoko-dfinity/motoko/).

[![Showcase](./guide/assets/intro.gif?raw=true)](https://marketplace.visualstudio.com/items?itemName=dfinity-foundation.vscode-motoko)

## Installation

Get this extension through the [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=dfinity-foundation.vscode-motoko), or alternatively the [Extensions panel](https://code.visualstudio.com/docs/editor/extension-marketplace) in your VS Code project.

VSCodium users can download the extension through [Open VSX](https://open-vsx.org/extension/dfinity-foundation/vscode-motoko) or the [GitHub releases](https://github.com/dfinity/vscode-motoko/releases) page.

## Features

- Syntax highlighting
- Code formatter
- Type checking
- Automatic imports
- Snippets ([contributions welcome](https://github.com/dfinity/node-motoko/blob/main/contrib/snippets.json))
- Go-to-definition
- Organize imports
- Documentation tooltips

## Integrations

- Validation and autocompletion for [`dfx`](https://internetcomputer.org/docs/current/developer-docs/build/install-upgrade-remove/) config files
- Code formatter using [`prettier-plugin-motoko`](https://npmjs.com/package/prettier-plugin-motoko)
- Support for the [Vessel](https://github.com/dfinity/vessel/) and [MOPS](https://mops.one/) package managers

## Commands

- `Motoko: Restart language server`: Starts (or restarts) the language server

## Settings

- `motoko.dfx`: The location of the `dfx` binary
- `motoko.canister`: The default canister name to use in multi-canister projects
- `motoko.formatter`: The formatter used by the extension
- `motoko.legacyDfxSupport`: Uses legacy `dfx`-dependent features when a relevant `dfx.json` file is available

## Advanced Configuration

If you want VS Code to automatically format Motoko files on save, consider adding the following to your `settings.json` configuration:

```json
{
  "[motoko]": {
    "editor.defaultFormatter": "dfinity-foundation.vscode-motoko",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
        "source.organizeImports": true
    }
  }
}
```

## Recent Changes

Projects using `dfx >= 0.11.1` use a new, experimental language server.

To continue using the original language server, you can modify your `dfx.json` file to use version `0.11.0` or earlier:

```json
{
  "dfx": "0.11.0"
}
```

If you encounter any bugs, please [open a GitHub issue](https://github.com/dfinity/vscode-motoko/issues) with steps to reproduce so that we can fix the problem for everyone. 

## Contributing

### Set up your local development environment:

Ensure that [Node.js >= 14.x](https://nodejs.org/en/) and [Cargo](https://doc.rust-lang.org/cargo/getting-started/installation.html) are installed on your system.

```bash
git clone https://github.com/dfinity/vscode-motoko
cd vscode-motoko
npm install
```

### Run unit tests:

```bash
npm test
```

### Build the extension:

```bash
npm run package
```

This generates a file named `vscode-motoko-*.*.*.vsix` in the project root.

### Install in VS Code:

```bash
code --install-extension vscode-motoko-*.*.*.vsix
```

Alternatively, right-click the `.vsix` file and then select the "Install Extension VSIX" option.

---

Community [PRs](https://github.com/dfinity/vscode-motoko/pulls) are welcome! Be sure to check the list of [open issues](https://github.com/dfinity/vscode-motoko/issues) in case anything catches your eye.
