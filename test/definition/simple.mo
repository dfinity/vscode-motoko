import Vector "mo:vector";
import Array "mo:base/Array";

persistent actor A {
    let a : Vector.Vector<Int> = Vector.new();
    let b : [var Int] = Array.init(2, 42);
    let c : Vector
           .Vector<Int> = Vector.new();
};
