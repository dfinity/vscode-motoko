fn main() {}

// use cargo_metadata::camino::Utf8PathBuf;
// use structopt::StructOpt;
// use watch::WatchOpt;

// use std::io::Result;
// use std::path::Path;
// use std::path::PathBuf;
// use std::process::Command;
// use std::process::Stdio;

// use cargo_metadata::Metadata;
// use cargo_metadata::Package;
// use cargo_metadata::Target;
// use cargo_metadata::{CargoOpt, MetadataCommand};

// /// Generate Node.js bindings for this Rust crate (removes the need to run `cargo install nj-cli`)
// fn main() {
//     build(BuildOpt {
//         output: "dist".to_string(),
//         release: true,
//         target: None,
//         extras: vec![],
//     })
// }

// // Derived from: https://github.com/infinyon/node-bindgen/blob/master/nj-cli/src/main.rs

// #[derive(Debug)]
// struct BuildOpt {
//     output: String,
//     release: bool,
//     target: Option<String>,
//     extras: Vec<String>,
// }

// fn build(opt: BuildOpt) {
//     let mut args = vec!["build".to_string()];
//     if opt.release {
//         args.push("--release".to_string());
//     }
//     if let Some(ref target) = opt.target {
//         args.push(format!("--target={target}"));
//     }
//     args.extend(opt.extras);

//     let mut build_command = Command::new("cargo")
//         .args(&args)
//         .stdout(Stdio::inherit())
//         .spawn()
//         .expect("Failed to execute command");

//     let status = build_command.wait().expect("failed to wait on child");
//     match status.code() {
//         Some(code) if code != 0 => {
//             std::process::exit(code);
//         }
//         None => {
//             //https://doc.rust-lang.org/std/process/struct.ExitStatus.html#method.code
//             #[cfg(unix)]
//             {
//                 use std::os::unix::process::ExitStatusExt;
//                 if let Some(signal) = status.signal() {
//                     std::process::exit(signal);
//                 } else {
//                     std::process::exit(1);
//                 }
//             }
//             #[cfg(not(unix))]
//             {
//                 std::process::exit(1);
//             }
//         }
//         Some(_) => {}
//     }

//     let target_mode = if opt.release { "release" } else { "debug" };

//     copy_lib(opt.output, target_mode, opt.target);
// }

// /// copy library to target directory
// fn copy_lib(out: String, target_mode: &str, target_tripple: Option<String>) {
//     let manifest_path = manifest_path();
//     let metadata = load_metadata(&manifest_path);
//     if let Some(package) = find_current_package(&metadata, &manifest_path) {
//         if let Some(target) = find_cdylib(package) {
//             let lib_path = lib_path(
//                 &metadata.target_directory,
//                 target_mode,
//                 &target.name,
//                 target_tripple,
//             );
//             let error_msg = format!("copy failed of {:?}", lib_path);
//             copy_cdylib(&lib_path, &out).expect(&error_msg);
//         } else {
//             eprintln!("no cdylib target was found");
//         }
//     } else {
//         eprintln!("no valid Cargo.toml was found");
//     }
// }

// fn find_cdylib(package: &Package) -> Option<&Target> {
//     package
//         .targets
//         .iter()
//         .find(|&target| target.name == package.name)
// }

// fn find_current_package<'a>(metadata: &'a Metadata, manifest_path: &Path) -> Option<&'a Package> {
//     metadata
//         .packages
//         .iter()
//         .find(|&package| package.manifest_path == manifest_path)
// }

// fn load_metadata(manifest_path: &Path) -> Metadata {
//     MetadataCommand::new()
//         .manifest_path(manifest_path)
//         .features(CargoOpt::AllFeatures)
//         .exec()
//         .expect("cargo metadata")
// }

// fn manifest_path() -> PathBuf {
//     let current_path = std::env::current_dir().expect("can't get current directory");
//     current_path.join("Cargo.toml")
// }

// fn lib_path(
//     target: &Utf8PathBuf,
//     build_type: &str,
//     target_name: &str,
//     target_tripple: Option<String>,
// ) -> Utf8PathBuf {
//     let file_name = if cfg!(target_os = "windows") {
//         format!("{}.dll", target_name)
//     } else if cfg!(target_os = "macos") {
//         format!("lib{}.dylib", target_name)
//     } else if cfg!(target_os = "linux") {
//         format!("lib{}.so", target_name)
//     } else {
//         panic!("Unsupported operating system.");
//     }
//     .replace('-', "_");
//     if let Some(target_tripple) = target_tripple {
//         target
//             .join(target)
//             .join(target_tripple)
//             .join(build_type)
//             .join(file_name)
//     } else {
//         target.join(target).join(build_type).join(file_name)
//     }
// }

// // where we are outputting
// fn output_dir(output: &str) -> Result<PathBuf> {
//     let current_path = std::env::current_dir().expect("can't get current directory");
//     let output_dir = current_path.join(output);
//     // ensure we have directory
//     std::fs::create_dir_all(&output_dir)?;

//     Ok(output_dir)
// }

// fn copy_cdylib(lib_path: &Utf8PathBuf, out: &str) -> Result<()> {
//     let dir = output_dir(out)?;
//     let output_path = dir.join("index.node");
//     std::fs::copy(lib_path, output_path)?;
//     Ok(())
// }
