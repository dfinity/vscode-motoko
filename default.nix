{ system ? builtins.currentSystem
, pkgs ? let
  commonSrc = builtins.fetchGit {
    url = "ssh://git@github.com/dfinity-lab/common";
    rev = "90ebf67c410745b113a4ea2308b2c94fda2f0787";
  }; in
  import commonSrc {
    inherit system;
  }
}:
let
  nodePackages = import ./package.nix {
    inherit system pkgs;
  };

  withVsix = nodePackages // {
    package = nodePackages.package.override {
      postInstall = "vsce package";
    };
  };

  name = "vscode-motoko";

in {
  vsix = pkgs.stdenv.mkDerivation {
    inherit name;

    src = ./.;

    buildInputs = [withVsix.package];

    installPhase = ''
      mkdir -p $out
      cp ${withVsix.package}/lib/node_modules/vscode-motoko/vscode-motoko-0.0.1.vsix $out/${name}.vsix
    '';
  };
}
