import { resolve } from 'path';

const path = __filename.endsWith('rust.ts')
    ? '../../rust/dist/index.node'
    : './vscode_motoko.node';

const rust = require(path);

export function vesselSources(directory?: string | undefined) {
    const message = rust.vesselSources(resolve(String(directory || '')));
    return message;
}

export default rust;
