// import {
//     formatDir,
//     formatGithubDir,
//     parseGithubURL,
//     readConfig,
//     // @ts-ignore
// } from 'ic-mops/mops';
// // @ts-ignore
// import { readVesselConfig } from 'ic-mops/vessel';
// import { join, relative, resolve } from 'path';

// /**
//  * Retrieve package sources from MOPS.
//  *
//  * Modified from https://github.com/ZenVoich/mops/blob/master/cli/commands/sources.js
//  */
// export async function mopsSources(
//     directory: string,
// ): Promise<Record<string, string> | undefined> {
//     // TODO: move this logic back into the `ic-mops` package

//     // let root = rootDir();
//     let root = resolve(directory);
//     if (!root) {
//         return;
//     }

//     let packages: Record<any, any> = {};
//     let versions: Record<any, any> = {};

//     let compareVersions = (a: any, b: any) => {
//         let ap = a.split('.').map((x: any) => x | 0);
//         let bp = b.split('.').map((x: any) => x | 0);
//         if (ap[0] - bp[0]) {
//             return Math.sign(ap[0] - bp[0]);
//         }
//         if (ap[0] === bp[0] && ap[1] - bp[1]) {
//             return Math.sign(ap[1] - bp[1]);
//         }
//         if (ap[0] === bp[0] && ap[1] === bp[1] && ap[2] - bp[2]) {
//             return Math.sign(ap[2] - bp[2]);
//         }
//         return 0;
//     };

//     const gitVerRegex = new RegExp(/v(\d{1,2}\.\d{1,2}\.\d{1,2})(-.*)?$/);

//     const compareGitVersions = (repoA: any, repoB: any) => {
//         const { branch: a } = parseGithubURL(repoA);
//         const { branch: b } = parseGithubURL(repoB);

//         if (gitVerRegex.test(a) && gitVerRegex.test(b)) {
//             return compareVersions(a.substring(1), b.substring(1));
//         } else if (!gitVerRegex.test(a)) {
//             return -1;
//         } else {
//             return 1;
//         }
//     };

//     let collectDeps = async (config: any, isRoot = false) => {
//         for (const pkgDetails of Object.values(config.dependencies || {})) {
//             const { name, repo, version }: any = pkgDetails;

//             // take root dep version or bigger one
//             if (
//                 isRoot ||
//                 !packages[name] ||
//                 (!packages[name].isRoot &&
//                     ((repo &&
//                         packages[name].repo &&
//                         compareGitVersions(packages[name].repo, repo) === -1) ||
//                         compareVersions(packages[name].version, version) ===
//                             -1))
//             ) {
//                 packages[name] = pkgDetails;
//                 packages[name].isRoot = isRoot;
//             }

//             let nestedConfig;

//             if (repo) {
//                 const dir = formatGithubDir(name, repo);
//                 nestedConfig = (await readVesselConfig(dir)) || {};
//             } else {
//                 const dir = formatDir(name, version) + '/mops.toml';
//                 nestedConfig = readConfig(dir);
//             }

//             await collectDeps(nestedConfig);

//             if (!versions[name]) {
//                 versions[name] = [];
//             }

//             if (repo) {
//                 const { branch } = parseGithubURL(repo);
//                 versions[name].push(branch);
//             } else {
//                 versions[name].push(version);
//             }
//         }
//     };

//     let config = readConfig(join(root, 'mops.toml'));
//     await collectDeps(config, true);

//     // show conflicts
//     // if (verbose) {
//     //     for (let [dep, vers] of Object.entries(versions)) {
//     //         if (vers.length > 1) {
//     //             console.log(
//     //                 chalk.yellow('WARN:'),
//     //                 `Conflicting package versions "${dep}" - ${vers.join(
//     //                     ', ',
//     //                 )}`,
//     //             );
//     //         }
//     //     }
//     // }

//     const sources: any = {};

//     // sources
//     for (let [name, { repo, version }] of Object.entries(packages)) {
//         let pkgDir;
//         if (repo) {
//             pkgDir =
//                 relative(process.cwd(), formatGithubDir(name, repo)) + '/src';
//         } else {
//             pkgDir = relative(process.cwd(), formatDir(name, version)) + '/src';
//         }

//         console.log(`--package ${name} ${pkgDir}`);
//         sources[name] = pkgDir;
//     }

//     return sources;
// }
