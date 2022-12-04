use std::path::Path;

use node_bindgen::derive::node_bindgen;
// use node_bindgen::sys::napi_value;
// use node_bindgen::core::NjError;
use vessel::Vessel;

// #[node_bindgen]
// fn hello() {
//     println!("Hello")
// }

#[node_bindgen]
fn vessel_sources(package_set: &str) -> String {
    vessel_sources_(package_set)
        .err()
        .unwrap_or_else(|| "".to_string())
}

fn vessel_sources_(package_set: &str) -> Result<(), String> {
    let vessel = Vessel::new(&Path::new(package_set))
        .map_err(|err| format!("error loading package-set: {}", err))?;
    let sources = vessel
        .install_packages(false)
        .map_err(|err| format!("error installing packages: {}", err))?
        .into_iter()
        .map(|(name, path)| format!("--package {} {}", name, path.display()))
        .collect::<Vec<_>>()
        .join(" ");
    println!("{}", sources);
    Ok(())
}
