import Lib "lib";

module {
    func test () {
        let x1 = f1(1, "qwerty");
        f2((1, "bar"), [1,2,3], {a = 1; b = "baz"});
        let x3 = f1(/* first parameter */ 1, /* second parameter */ "f1(1, \"qwerty\")"); // f1(1, "qwerty");
        let y = f1(f3</* integer(,*/ Int, /* text ,) */ Text>(1, "qwerty"), "qweqwe");
        f4(f1, 1, "");
        f2(
        Lib.ff(
    };

    func f1 (a: Int, b: Text): Int {return a}; 
    func f2 (a: (Int, Text), b: [Int], c: {a:Int; b: Text}) {};
    func f3<A, B> (a: A, b: B): Int {return 1;};
    func f4 (f: (a: Int, b: Text) -> Int, a: Int, b: Text) {}
}
