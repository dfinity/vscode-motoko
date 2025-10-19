import Module "Module";

/// Actor documentation
persistent actor {
  /// Mutable variable documentation
  var myVariable = 42;

  /// Actor class documentation
  persistent actor class _MyClass(init: Nat) {
    let _classVariable = init;
  };

  let _record : Module.MyRecord = {
    name = "John";
    var age = 30;
  };

  public func inc() : async () {
     myVariable := Module.inc(myVariable);
  };
};
