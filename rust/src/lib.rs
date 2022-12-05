use std::path::Path;

use node_bindgen::derive::node_bindgen;
// use node_bindgen::sys::napi_value;
// use node_bindgen::core::NjError;
use vessel::Vessel;

#[node_bindgen]
fn vessel_sources(directory: String) -> Result<Vec<(String, String)>, String> {
    let cwd = std::env::current_dir().unwrap();
    std::env::set_current_dir(directory).unwrap();

    let result = vessel_sources_cwd();

    std::env::set_current_dir(cwd).unwrap();
    result
}

fn vessel_sources_cwd() -> Result<Vec<(String, String)>, String> {
    let vessel = Vessel::new(&Path::new("package-set.dhall"))
        .map_err(|err| format!("Error while loading package-set: {}", err))?;
    let sources = vessel
        .install_packages(false)
        .map_err(|err| format!("Error while installing packages: {}", err))?
        .into_iter()
        .map(|(name, path)| (name, path.to_string_lossy().to_string()))
        .collect::<Vec<_>>();
    Ok(sources)
}
