module {
    public let x : Nat = 0;
    public object a {
        public let x : Nat = 0;
        public object b {
            public let x : Nat = 0;
            public object c {
                public let x : Nat = 0;
            }
        }
    };

    public let y : Nat = a.b.c.x;
}
