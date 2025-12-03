module {
    type Foo = { bar : Nat };

    public func test1() : Nat {
        let foo : Foo = { bar = 42 };
        foo.bar
    };

    public func test2() : Nat {
        let foo : { bar : Nat } = { bar = 42 };
        foo.bar
    };

    public func test3() : Nat {
        switch ({ bar = 42 }) {
            case (foo : { bar : Nat }) foo.bar
        }
    };
}
