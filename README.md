# Motoko - VS Code Extension

> #### Motoko language support for [Visual Studio Code](https://code.visualstudio.com/).

[![Visual Studio Marketplace](https://vsmarketplacebadge.apphb.com/installs-short/dfinity-foundation.vscode-motoko.svg)](https://marketplace.visualstudio.com/items?itemName=dfinity-foundation.vscode-motoko)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/dfinity/prettier-plugin-motoko/issues)

## Features

- Syntax highlighting
- Code formatter
- When using a [dfx.json](https://medium.com/@chiedo/6-steps-to-deploying-your-first-dapp-on-the-internet-computer-b9a36b45f91e) config file:
  - Autocompletion
  - Error checking
  - Go to definition

## Installation

Install through the [Marketplace page](https://marketplace.visualstudio.com/items?itemName=dfinity-foundation.vscode-motoko), or alternatively the [Extensions panel](https://code.visualstudio.com/docs/editor/extension-marketplace) in your VS Code project.

## Integrations

- [`dfx`](https://internetcomputer.org/docs/current/developer-docs/build/install-upgrade-remove/) (autocompletion, error checking, go-to-definition)
- [`prettier-plugin-motoko`](https://npmjs.com/package/prettier-plugin-motoko) (code formatter)

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

## License

Copyright 2020 DFINITY Foundation

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
