module {
    public class Class1() {
        public func meth(_ : Int) : Nat {
            1
        };
    };

    public class Class2() {
        public func meth(_ : Nat) : Int {
            2
        };
    };

    public func test(b : Bool) : () {
        let t0 : ({meth : Nat -> Int}, Class2) = (Class1(), Class2())     ; // <- 1, 2 (Con)
        let (c0 : Class2, c1 : Class2) = t0                               ; // <- 1 2, 1 2 <-

        let c2                       =        Class1()                    ; // 1
        let c3 : Class1              =        Class1()                    ; // 1
        let c4 : Class2              =        Class1()                    ; // 1 2
        let c5 : {meth : Nat -> Int} =        Class1()                    ; // <- 1
        let c6 : Class2              =                          Class2()  ; // 2 (adds 1)
        let c7 : {meth : Nat -> Int} =                          Class2()  ; // <- 2 (adds 1)
        let c8                       = if b { Class1() } else { Class2() }; // 1 2
        let c9                       = if b { Class2() } else { Class1() }; // 1 2
        let cA : {meth : Nat -> Int} =        Class1()   else   return    ; // <- 1
        let cB                       = t0.0                               ; // <- 1
        let cC                       = t0.1                               ; // <- 1 2 (adds <- 1)
    };
};
