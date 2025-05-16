module {
    public let value = 0;
    public let other = ();
    public func inc(x : Nat) : Nat {
        return x + 1;
    };

    public module Inner {
        public let inner = 42;
    }
};
