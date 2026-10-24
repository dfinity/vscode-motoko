import State "../types/State";

module {
    public func migration(old : { a : Nat; b : Text; c : Bool }) : State.Counter {
        { counter = old.a; name = old.b };
    };
};
