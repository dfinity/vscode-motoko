import Bottom "Bottom"

module {
    public object top {
        public func foo() : () { return Bottom.bottom.bar(); };
    };
}
