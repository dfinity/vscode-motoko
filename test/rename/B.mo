import C "C";

module {
    public let value = C.other;
    public func test() : Nat {
        return C.inc(C.value);
    };

    public object obj {
        public func meth(x: Nat) : Nat {
            return x + C.Inner.inner;
        }
    };
}
