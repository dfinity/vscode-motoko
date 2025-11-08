Bind a name to the result of an expression, creating an immutable variable.

In a `let` declaration, the expression on the right-hand side is evaluated once, and its resulting value is associated with the given name. This value cannot be changed after the initial assignment. The Motoko compiler enforces this immutability by generating a compile-time error if there is any attempt to modify the variable later in the code.

In concurrent code, immutable declarations should be preferred over mutable declarations, since they prevent concurrent modification.

```motoko
let x = 10;
x := 20; // Error: Cannot assign to immutable variable
```

The left hand side of a `let` can be also be a more general pattern, naming the components of a value by matching its structure:

For example, the declaration:

```motoko
let (fst, snd) = (1, 2);
```

uses the pattern `(fst, snd)` to name the components of the pair `(1,2)`. The value of `fst` is `1` and the value of `snd` is `2`. Both `fst` and `snd` are immutable.
