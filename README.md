# vscode-motoko

Motoko language support.

## Features

- Syntax highlighting (currently based on the Swift TM grammar definitions)
- Integration with the Motoko language service

## Installation

Until we've published the extension to the Marketplace you need to package it yourself.

After cloning this repo run
```bash
npm install
npm run package
```
This should leave you with a `vscode-motoko-0.2.0.vsix` file in the project root.

Next run `code --install-extension vscode-motoko-0.2.0.vsix` and the plugin should be ready to go the next time you open a Motoko file in a `dfx` project. If this doesn't work you can also use the VSCode UI to install from a local `.vsix` file.

## Requirements

- `dfx`

## Extension Commands

This extension contributes the following commands:

* `motoko.startService` Starts/Restarts the language service. This is automatically triggered when opening a Motoko project.

## Extension Settings

This extension contributes the following settings:

* `motoko.dfx`: The location of the `dfx` binary
* `motoko.canister`: By default we'll let you choose what canister defined in your project you want to use, use this setting to change that to a specific one
* `motoko.standaloneArguments`: Additional arguments to pass to the language service when running in a non-dfx project
* `motoko.standaloneBinary`: The location of the `mo-ide` binary (when running in a non-dfx project)
