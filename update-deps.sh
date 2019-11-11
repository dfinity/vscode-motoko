#!/usr/bin/env bash
set -euo pipefail

npm install

node2nix -d -i package.json --supplement-input supplement.json -c package.nix

sed -i '' 's/nodejs-8_x/nodejs-12_x/g' package.nix
