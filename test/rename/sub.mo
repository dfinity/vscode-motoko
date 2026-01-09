persistent actor {
  class Class1() {
    public func meth(_ : Int) : Nat {
      1
    }
  };

  class Class2() {
    public func meth(_ : Nat) : Int {
      2
    }
  };

  public func test() : async Int {
    let c : Class2 = Class1();
    c.meth(42)
  }
}
