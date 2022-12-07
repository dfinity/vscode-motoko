import { resolve } from 'path';

const path = __filename.endsWith('rust.ts')
    ? '../../rust/dist/index.node'
    : './vscode_motoko.node';

let rust: any;
try {
    rust = require(path);
}
catch(err) {
    console.error(err);
}

export function vesselSources(directory?: string | undefined) {
    if(!rust) {
        throw new Error('Couldn\'t find a Vessel installation on your system path');
    }
    const message = rust.vesselSources(resolve(String(directory || '')));
    return message;
}

export default rust;
