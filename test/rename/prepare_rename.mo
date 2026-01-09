import Vector "mo:vector";
import ImportMe "import_me";

type record = { field : Nat };

func _test() : Nat {
    let value : record = { field = ImportMe.reference_me() };
    value.field
};

let _vec : Vector.Vector<Nat> = Vector.new();
