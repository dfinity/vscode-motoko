import { resolve } from 'path';

// const path = __filename.endsWith('rust.ts')
//     ? '../../rust/index.node'
//     : './vscode_motoko.node';

let rust: any;
// try {
//     rust = require(path);
// } catch (err) {
//     console.error(err);
// }

export function vesselSources(directory?: string | undefined) {
    if (!rust) {
        throw new Error(
            "Couldn't find a Vessel installation on your system path",
        );
    }
    return rust.vesselSources(resolve(String(directory || '')));
}

export default rust;
