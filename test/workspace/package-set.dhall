let Package = { name : Text, version : Text, repo : Text, dependencies : List Text }

in [ { name = "base"
  , repo = "https://github.com/dfinity/motoko-base"
  , version = "master"
  , dependencies = [] : List Text
  }
] : List Package
