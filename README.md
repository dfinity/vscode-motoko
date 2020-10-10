# `vscode-motoko`

Motoko language support.

## Features

- Syntax highlighting (currently based on the Swift® grammar definitions)
- Integration with the Motoko language service

## Installation

Install through the Marketplace. The extension is published by the `DFINITY Foundation` publisher as `Motoko`:
https://marketplace.visualstudio.com/items?itemName=dfinity-foundation.vscode-motoko

## Requirements

- `dfx`

## Extension Commands

This extension contributes the following commands:

- `motoko.startService` Starts/Restarts the language service. This is automatically triggered when opening a Motoko project.

## Extension Settings

This extension contributes the following settings:

- `motoko.dfx`: The location of the `dfx` binary
- `motoko.canister`: By default we'll let you choose what canister defined in your project you want to use, use this setting to change that to a specific one
- `motoko.standaloneArguments`: Additional arguments to pass to the language service when running in a non-dfx project
- `motoko.standaloneBinary`: The location of the `mo-ide` binary (when running in a non-dfx project)

## Contributing

When hacking on the extension you can package your local version by running:

```bash
npm install
npm run package
```

This should leave you with a `vscode-motoko-x.x.x.vsix` file in the project root.

Next run `code --install-extension vscode-motoko-x.x.x.vsix` to install your development version. If this doesn't work, you can also use the VSCode UI to install from a local `.vsix` file.
