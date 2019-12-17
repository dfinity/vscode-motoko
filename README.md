# vscode-motoko

Motoko language support.

## Features

- Syntax highlighting (currently based on the Swift TM grammar definitions)
- Integration with the Motoko language service

## Installation

Until we've published the extension to the Marketplace you need to package it yourself.

After cloning this repo run `npm install && npm package`, which should leave you with a `vscode-motoko-0.0.1.vsix` file in the project root.

Next run `code --install-extension vscode-motoko-0.0.1.vsix` and the plugin should be ready to go the next time you open a Motoko file in a `dfx` project.

## Requirements

- `dfx`

## Extension Settings

For example:

This extension contributes the following settings:

* `motoko.dfx`: The location of the `dfx` binary
* `motoko.canister`: By default we'll choose the first canister defined in your project for now, use this setting to change that to a specific one
