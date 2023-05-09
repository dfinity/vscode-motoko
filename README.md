# Motoko &middot; VS Code Extension

> #### Motoko language support for [Visual Studio Code](https://code.visualstudio.com/).

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/dfinity-foundation.vscode-motoko?color=brightgreen&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=dfinity-foundation.vscode-motoko)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/dfinity/prettier-plugin-motoko/issues)

## Overview

[Motoko](https://github.com/dfinity/motoko) is a high-level smart contract language for the [Internet Computer](https://internetcomputer.org/).

This IDE extension provides type checking, formatting, snippets, and more for [Motoko canister development](https://internetcomputer.org/docs/current/developer-docs/build/cdks/motoko-dfinity/motoko/).

[![Showcase](https://github.com/dfinity/vscode-motoko/raw/master/guide/assets/intro.webp)](https://marketplace.visualstudio.com/items?itemName=dfinity-foundation.vscode-motoko)

## Installation

Get this extension through the [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=dfinity-foundation.vscode-motoko), or alternatively the [Extensions panel](https://code.visualstudio.com/docs/editor/extension-marketplace) in your VS Code project.

VSCodium users can download the extension through [Open VSX](https://open-vsx.org/extension/dfinity-foundation/vscode-motoko) or the [GitHub releases](https://github.com/dfinity/vscode-motoko/releases) page.

## Keyboard Shortcuts

Below are the default key bindings for commonly used features supported in the extension:

- **Code formatter** (`Shift` + `Alt` + `F`): format a Motoko file using [prettier-plugin-motoko](https://github.com/dfinity/prettier-plugin-motoko).
- **Organize imports** (`Shift` + `Alt` + `O`): group and sort imports at the top of your Motoko file.
- **Import code action** (`Ctrl/Cmd` + `.` while hovering over an unresolved variable): show quick-fix options. 
- **Go to definition** (`F12`): jump to the definition of a local or imported identifier.
- **IntelliSense** (`Ctrl` + `Space`): view all available autocompletions and code snippets. 

[![Snippets](https://github.com/dfinity/vscode-motoko/raw/master/guide/assets/snippets.png)](https://marketplace.visualstudio.com/items?itemName=dfinity-foundation.vscode-motoko)

## Other Features

- [Vessel](https://github.com/dfinity/vessel) and [MOPS](https://mops.one/) (the two most popular Motoko package managers) are supported out-of-the-box in this extension. 
- Quickly convert between Motoko types using code snippets such as `array-2-buffer` or `principal-2-text`.
- In case you're hoping to learn Motoko without installing `dfx`, the Motoko VS Code extension works standalone on all major operating systems (including Windows). 
- This extension also provides schema validation and autocompletion for `dfx.json` config files.
- View type information and documentation by hovering over function names, imports, and other expressions.

[![Tooltips](https://github.com/dfinity/vscode-motoko/raw/master/guide/assets/tooltips.png)](https://marketplace.visualstudio.com/items?itemName=dfinity-foundation.vscode-motoko)

## Commands

- `Motoko: Restart language server`: Starts (or restarts) the language server
- `Motoko: Deploy to Internet Computer (20 minutes)`: Temporarily deploys the currently open file via [Motoko Playground](https://m7sm4-2iaaa-aaaab-qabra-cai.raw.ic0.app/)

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
