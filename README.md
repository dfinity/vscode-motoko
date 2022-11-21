> **Important note:** This is an experimental fork of the official [Motoko VS Code extension](https://marketplace.visualstudio.com/items?itemName=dfinity-foundation.vscode-motoko). Make sure to disable the official extension to avoid conflicting behavior. 

# Motoko + Viper

> #### Experimental formal verification support for Motoko.

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/dfinity-foundation.motoko-viper?color=brightgreen&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=dfinity-foundation.motoko-viper)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/dfinity/prettier-plugin-motoko/issues)

### Usage

To enable formal verification, insert a line comment containing `@verify` at the top of your Motoko file.

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

- Clone [vscode-motoko](https://github.com/dfinity/vscode-motoko/tree/viper) with
  following command: `git clone https://github.com/dfinity/vscode-motoko -b viper --recurse-submodules`
- In your terminal, run `cd vscode-motoko`
- Install the `npm` modules needed as dependencies: `npm install`
- Run `npm run package` (this will rebuild the compiler bindings)
- Right-click the generated `/motoko-viper-*.vsix` file and select "Install extension VSIX"
