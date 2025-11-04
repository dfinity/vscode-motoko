import Int "mo:base/Int";

module {
  public func wss_func (x: Int, c: Text): Text {
    return c # Int.toText(x);
  };
  
  public let wss_var: Text = "";

  public class Classwss() {
    public func wss_method() {}
  };
}
