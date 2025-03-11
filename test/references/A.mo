import B "B";
import C "C";

actor {
    public func name() : async Nat {
        let a = B.obj;
        return a.meth(C.Inner.inner);
    };
};
