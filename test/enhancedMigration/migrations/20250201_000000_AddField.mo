module {
    public func migration(old : { a : Nat; b : Text }) : {
        a : Nat;
        b : Text;
        c : Bool;
    } {
        { old with c = true };
    };
};
