import Lib "lib";

func greet(fname : Text) : Text {
  let x = Lib.wss_func (1, "");
  return "Hello, " # fname # x;
};
