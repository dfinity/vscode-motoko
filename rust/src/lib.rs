use neon::prelude::*;
use std::path::Path;
use vessel::Vessel;

#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    cx.export_function("vesselSources", vessel_sources)?;
    Ok(())
}

fn vessel_sources(mut cx: FunctionContext) -> JsResult<JsValue> {
    let directory: String = cx.argument::<JsString>(0)?.value(&mut cx);

    let cwd = std::env::current_dir().unwrap();
    std::env::set_current_dir(directory).unwrap();

    let result = vessel_sources_cwd().unwrap();
    std::env::set_current_dir(cwd).unwrap();
    Ok(neon_serde3::to_value(&mut cx, &result).unwrap())
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
