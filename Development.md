# Development

## Running the extension with local Motoko compiler changes

Assumption: `motoko`, `node-motoko` and this repository are in the same directory, e.g.

```
~/node-motoko
~/motoko
~/vscode-motoko
```

#### 1. Inside the `motoko` directory
Prepare your local changes, make sure they compile.

#### 2. Inside the `node-motoko` directory
Build the project and execute the generate script to copy the compiled `moc.js` and `moc_interpreter.js`:

```bash
npm install
npm run build
npm run generate local
```

#### 3. Inside the `vscode-motoko` directory

1. Change the `motoko` dependency in `package.json` to point to the local repo:
```bash
npm install ../node-motoko 
```

It should look like this:
```
"motoko": "file:../node-motoko",
```

2. Make sure the `.vscodeignore` file is present and contains `../**/*` to ignore bundling `node_modules` from the `node-motoko` directory.

#### 4. Start debugging
Start debugging the extension using the `Run Extension with Local Motoko` configuration.
Choose this configuration and hit `F5`.

Alternatively, run `npm run package` to package the extension and install it manually.
