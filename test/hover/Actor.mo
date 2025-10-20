import Module "Module";

/// Actor documentation
persistent actor {
  /// Mutable variable documentation
  var value = 42;

  /// Actor class documentation
  persistent actor class _ActorClass(initialValue : Nat) {
    let _actorClassValue = initialValue;
  };

  let _record : Module.Record = {
    name = "John";
    var age = 30;
  };

  public func inc() : async () {
    value := Module.inc(value);
  };
};
