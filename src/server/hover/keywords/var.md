Defines a mutable variable whose value can be updated after it is initially assigned. Unlike `let`, which creates an immutable binding, `var` allows reassignment using the `:=` operator. This means that the variable can hold different values over time, making it suitable for scenarios where state changes are required.

```motoko
var y = 10;
y := 20; // Allowed, updates the value of y
```

Unlike, `let` declarations, `var` declarations do not support pattern matching. For example, the following is a syntax error:

```motoko
var (a, b) = (1, 2); // Not supported
```

### Compound assignment operations

The assignment operation `:=` is general and works for all types.

Motoko provides special assignment operators that combine assignment with a binary operation. These compound operators update a variable by applying the operation between its current value and a given operand.

For example, numbers permit a combination of assignment and addition:

```motoko
var count = 2;
count += 40;
```

After the second line, the variable `count` holds `42`.

Motoko includes other compound assignments as well, such as `#=`:

```motoko
var text = "Motoko";
text #= " Ghost"
```

As with `+=`, this combined form avoids repeating the assigned variable’s name on the right hand side of the special assignment operator `#=`.
