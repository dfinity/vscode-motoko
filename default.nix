{ pkgs ? import <nixpkgs> {}
, system ? builtins.currentSystem }:
let
  nodePackages = import ./package.nix {
    inherit pkgs system;
  };

in
  nodePackages // {
    package = nodePackages.package.override {
      postInstall = "vsce package";
    };
  }


