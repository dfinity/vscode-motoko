# Motoko + Viper

> #### Experimental formal verification support for Motoko.

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/dfinity-foundation.motoko-viper?color=brightgreen&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=dfinity-foundation.motoko-viper)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/dfinity/prettier-plugin-motoko/issues)

### Important Note

This is an experimental fork of the official [Motoko VS Code extension](https://marketplace.visualstudio.com/items?itemName=dfinity-foundation.vscode-motoko). If you are interested in trying this extension, make sure to disable the official extension to avoid incompatibilities. 

### Usage

To enable formal verification, insert an `@verify` line comment at the top of your Motoko file.

### Example

```motoko
// @verify

actor {

  var claimed = false;

  var count = 0 : Int;

  assert:invariant count == 0 or count == 1;
  assert:invariant not claimed implies count == 0;

  public shared func claim() : async () {
    if (not claimed) {
      claimed := true;

      await async {
        assert:1:async (claimed and count == 0);
        count += 1;
      };
    };
  };

}
```

### Building from Source

- Clone [vscode-motoko](https://github.com/dfinity/vscode-motoko/tree/viper)
- In your terminal, run `cd vscode-motoko`
- Switch to the `viper` branch (`git switch viper`)
- Execute `git submodule update --init` to obtain the corresponding Motoko compiler
- Install the `npm` modules needed as dependencies: `npm install`
- Run `npm run package` (this will rebuild the compiler bindings)
- Right-click the generated `/motoko-viper-*.vsix` file and select "Install extension VSIX"
