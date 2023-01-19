import Principal "mo:base/Principal"

/// An example Motoko canister (implemented as an "actor").
actor {
    /// Say hello to whoever called this canister method.
    public shared ({ caller }) func sayHello() : async Text {
        "Hello, " # Principal.toText(caller) # "!";
    };
};
