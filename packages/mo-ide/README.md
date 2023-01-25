# mo-ide &middot; [![npm version](https://img.shields.io/npm/v/mo-ide.svg?logo=npm)](https://www.npmjs.com/package/mo-ide) [![GitHub license](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

> #### The official [Language Server Protocol (LSP)](https://microsoft.github.io/language-server-protocol/) implementation for [Motoko](https://github.com/dfinity/motoko).

---

`mo-ide` exists for developers interested in using features from the [Motoko VS Code extension](https://github.com/dfinity/vscode-motoko) in an IDE without official Motoko language support. 

## Setup

Ensure that [Node.js](https://nodejs.org/en/download/) is installed on your system, and run the following command:

```bash
npm install -g mo-ide
```

This will add the `mo-ide` command to your path, which you can then use in your supported IDE of choice.

For environments without Node.js, you can also download a portable executable from the [GitHub releases](https://github.com/dfinity/vscode-motoko/releases) page.

## Getting Started

IDE-specific setup instructions are currently a work in progress. 

## Advanced Usage

Start the language server using the following commands:

```bash
mo-ide --stdio # standard I/O transport (when in doubt, try this option)

mo-ide --node-ipc # Node.js IPC transport (used in VS Code)

mo-ide --socket={number} # TCP socket transport
```
