import Text "mo:base/Text";
import Int "mo:base/Int";
import Blob "mo:base/Blob";

import Lib1 "lib1";
import Lib "lib";

func greet(fname : Text) : Text {
  let x = Lib.f(1, Int.toText(2));
  return Text.concat("Hello, ", fname) # x;
};

greet(Lib1.world());
