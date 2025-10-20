/// Module documentation
module {
  /// Variable documentation
  public let value = 42;

  /// Increment the value by one
  ///
  /// #### Example
  ///
  /// ```
  /// let x = 41;
  /// let y = inc(x);
  /// assert Nat.equal(y, 42);
  /// ```
  public func inc(x : Nat) : Nat {
    /// Mutable variable documentation
    var result = x + 1;

    return result;
  };

  /// Async function documentation
  func _asyncFunc() : async () {};

  func _option(value : Bool) : ?Int {
    if (value) ?42 else null;
  };

  func _option2(value : Bool) : ?Int {
    if (value) {
      ?42;
    } else {
      null;
    };
  };

  /// Class documentation
  public class Class(initialValue : Nat) {
    /// Constructor documentation
    public let classValue = initialValue;

    /// Class method documentation
    public func classMethod() {};
  };

  /// Object documentation
  public object Object = {
    /// Member documentation
    public let objectValue = 42;

    /// Object method documentation
    public func objectMethod() {};
  };

  /// Record documentation
  public type Record = {
    name : Text;
    var age : Nat;
  };

  /// Variant documentation
  type Tree = {
    #node : {
      var value : Nat;
      left : Tree;
      right : Tree;
    };
    #leaf;
  };
};
