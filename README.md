> **Important note:** This is an experimental fork of the official [Motoko VS Code extension](https://marketplace.visualstudio.com/items?itemName=dfinity-foundation.vscode-motoko). Please disable the official extension if you run into any unexpected behavior. 

# _Motoko-san_

> #### Experimental formal verification support for [Motoko](https://internetcomputer.org/docs/current/developer-docs/build/cdks/motoko-dfinity/motoko/).

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/dfinity-foundation.motoko-viper?color=brightgreen&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=dfinity-foundation.motoko-viper)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/dfinity/prettier-plugin-motoko/issues)

### Background

[Motoko](https://internetcomputer.org/docs/current/developer-docs/build/cdks/motoko-dfinity/motoko/) is a high-level smart contract language for the [Internet Computer](https://internetcomputer.org/). 

This extension makes it possible to write code specifications (such as actor-level invariants) for Motoko programs. The assertions are automatically checked, at compile time, by Viper [Viper](https://www.pm.inf.ethz.ch/research/viper.html), a formal verifier developed at ETH Zurich.

### Usage

To enable formal verification, insert `// @verify` at the top of your Motoko file.

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

### Further reading

A more detailed overview of _Motoko-san_ is available [here](https://github.com/dfinity/motoko/tree/master/src/viper).
