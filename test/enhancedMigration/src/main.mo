import Prim "mo:prim";
import State "../types/State";

actor {
    let counter : Nat;
    let name : Text;

    public func greet() : async State.Counter {
        Prim.debugPrint(debug_show { counter; name });
        { counter; name };
    };
};
