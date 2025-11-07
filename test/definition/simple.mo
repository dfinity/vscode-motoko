import Vector "mo:vector";
import Array "mo:core/Array";

persistent actor A {
    let a : Vector.Vector<Int> = Vector.new();
    let b : [var Int] = Array.repeat(42, 2);
    let c : Vector
           .Vector<Int> = Vector.new();
};
