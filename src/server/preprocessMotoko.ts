// // Hack: use a special package name to load sibling canisters from `dfx.json`
// const canisterPackagePrefix = '_'.repeat('canister:'.length - 'mo:'.length);

// export function getCanisterPackageName(name: string) {
//     return canisterPackagePrefix + name;
// }

export function preprocessMotoko(source: string): string {
    // // Hack: replace canister import statements based on a regular expression.
    // return source.replace(
    //     /(import[^"\n]+")canister:([^"]+)(";?)/g,
    //     (match, before, name, after) => {
    //         if(dfxConfig.canisters.hasOwnProperty()){
    //             return `${before}mo:${getCanisterPackageName(name)}${after}`;
    //         }
    //         return match
    //     },
    // );
    return source;
}
