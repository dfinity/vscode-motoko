module {
    public class O() {
        public let o : O = O();

        public func test() : O {
            o.o.o.o.o.o
        }
    };
}
