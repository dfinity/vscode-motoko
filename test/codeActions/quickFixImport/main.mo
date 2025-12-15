import Text "mo:base/Text";
import Int "mo:base/Int";

func greet(fname : Text) : Text {
  let x = Lib.f(1, Int.toText(2));
  return Text.concat("Hello, ", fname) # x;
};
