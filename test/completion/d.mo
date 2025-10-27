module {
    let globalVar = 1;
    /// Documentation to class A
    public class A(constructorParam: Int) {
        var state = "state";
        /// Documentation to method
        public func method(methodParam: Text) {

        };
    };

    /// Documentation to f
    public func f(functionParam: Int) {
        if (functionParam == 1) {
            let definedInIfBlock = functionParam;

        };

        for (counter in [1,2,3].vals()) {
            let definedInForBlock = counter;

        };
    };
};
