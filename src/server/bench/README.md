# How to run benchmarks ?

```bash
npm run compile:benchmark-init
node ./out/benchmark-init.js --verbose --root=<path_to_root> | grep BENCH
# BENCHMARK: Single initialize request result: 1.73 ms
# BENCHMARK: Initialization time: 9408.56 ms

npm run compile:benchmark-did-change
node ./out/benchmark-did-change.js --verbose --root=<path_to_root> --file=game-launcher/src/game_launcher_backend/launchpad/swap.mo | grep BENCH
# BENCHMARK: Initialization time: 9393.99 ms
# BENCHMARK: Single textDocument/documentSymbol request result: 692.52 ms
# BENCHMARK: Single textDocument/hover request result: 7241.47 ms
```

`<path_to_root>` is a folder path where VSCode Extension will be launched. The example above is using a folder with a couple of large motoko projects: `game-launcher` and `power-equalizer` which could be installed via:

```bash
git clone https://github.com/BoomDAO/game-launcher.git
git clone https://github.com/flowerpowerdao/power-equalizer.git
```