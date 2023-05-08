import { IDL } from '@dfinity/candid';
import { Principal } from '@dfinity/principal';
import { HttpAgent, replica } from 'ic0';
import { URI } from 'vscode-uri';
import { DeployParams, DeployResult } from '../common/requestConfig';
import motoko from './motoko';
import { resolveVirtualPath } from './utils';
import fetch, { Headers } from 'cross-fetch';

global.fetch = fetch;
global.Headers = Headers;

// const playground = ic('mwrha-maaaa-aaaab-qabqq-cai');
const playground = replica(
    new HttpAgent({
        host: 'http://127.0.0.1:4943',
        fetch,
    }),
    { local: true },
)('rrkah-fqaaa-aaaaa-aaaaq-cai'); // TODO: use global

export async function deployPlayground(
    params: DeployParams,
): Promise<DeployResult> {
    const virtualFile = resolveVirtualPath(URI.file(params.file).path);
    const name = chooseCanisterName(virtualFile);
    const info = await createCanister();
    const arg = IDL.encode([], []);
    const { wasm } = await compile(virtualFile);
    const profiling = false;
    await deploy(name, info, new Uint8Array(arg), 'install', wasm, profiling);
    return {
        canisterId: info.id.toString(),
    };
}

interface CanisterInfo {
    id: Principal;
    timestamp?: bigint;
    name?: string;
    candid?: string | null;
    stableSig?: string | null;
}

interface CompileResult {
    wasm: Uint8Array;
    candid: string;
    stable: string;
}

// async function compileCandid(virtualFile: string): Promise<string | undefined> {
//     const candid = motoko.candid(virtualFile);
//     if (!candid) {
//         throw new Error(`Cannot deploy: syntax error`);
//     } else if (candid.trim() === '') {
//         throw new Error(`Cannot deploy: ${virtualFile} has no actor`);
//     }
//     return candid;
// }

async function compile(virtualFile: string): Promise<CompileResult> {
    console.log('Compiling...');
    const result = motoko.wasm(virtualFile, 'ic');
    // if (!result.code ) {
    //     throw new Error('Syntax error');
    // }
    if (result.candid.trim() === '') {
        throw new Error(`${virtualFile} has no actor`);
    }
    if (result.stable === null) {
        throw new Error(`${virtualFile} cannot generate stable signature`);
    }
    return result;
}

async function deploy(
    canisterName: string,
    canisterInfo: CanisterInfo | null,
    args: Uint8Array,
    mode: 'install' | 'reinstall' | 'upgrade',
    wasm: Uint8Array,
    profiling: boolean,
): Promise<CanisterInfo | undefined> {
    console.log('Deploying...');
    try {
        let updatedState: CanisterInfo | null = null;
        if (!canisterInfo) {
            if (mode !== 'install') {
                throw new Error(`Cannot ${mode} for new canister`);
            }
            canisterInfo = await createCanister();
            updatedState = await install(
                canisterInfo,
                wasm,
                args,
                'install',
                profiling,
            );
        } else {
            if (mode !== 'reinstall' && mode !== 'upgrade') {
                throw new Error(`Unknown mode ${mode}`);
            }
            updatedState = await install(
                canisterInfo,
                wasm,
                args,
                mode,
                profiling,
            );
        }
        //updatedState.candid = candid_source;
        updatedState.name = canisterName;
        return updatedState;
    } catch (err) {
        // logger.log(err.message);
        throw err;
    }
}

async function createCanister(): Promise<CanisterInfo> {
    console.log('Creating canister...');
    const timestamp = BigInt(Date.now()) * BigInt(1_000_000);
    const nonce = pow(timestamp);
    const info: CanisterInfo = await playground.call('getCanisterId', nonce);
    return {
        id: info.id,
        timestamp: info.timestamp,
    };
}

// async function deleteCanister(info: CanisterInfo) {
//     await playground.call('removeCode', info);
// }

async function install(
    canisterInfo: CanisterInfo,
    module: Uint8Array,
    args: Uint8Array,
    mode: string,
    profiling: boolean,
): Promise<CanisterInfo> {
    console.log('Installing WebAssembly...');
    if (!canisterInfo) {
        throw new Error('No canister id');
    }
    const canisterId = canisterInfo.id;
    const installArgs = {
        arg: [...args],
        wasm_module: [...module],
        mode: { [mode]: null },
        canister_id: canisterId,
    };
    const newInfo: CanisterInfo = await playground.call(
        'installCode',
        canisterInfo,
        installArgs,
        profiling,
    );
    canisterInfo = newInfo;
    return canisterInfo;
}

function chooseCanisterName(file: string): string {
    const path = file.split('/');
    const name = path.pop()!.toLowerCase();
    if (name === 'main.mo' && path.length) {
        return path.pop()!.toLowerCase();
    } else {
        const suffix = name.lastIndexOf('.');
        if (suffix === -1) return name;
        return name.slice(0, suffix);
    }
}

const DOMAIN = 'motoko-playground';

function pow(timestamp: bigint) {
    console.log('Running proof of work...');
    console.time('PoW');
    let nonce = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
    const prefix = DOMAIN + timestamp;
    while (true) {
        const hash = motokoHash(prefix + nonce);
        if (hashOk(hash)) {
            break;
        }
        nonce += BigInt(1);
    }
    console.timeEnd('PoW');
    return {
        timestamp,
        nonce,
    };
}

function motokoHash(message: string): number {
    const base = 2 ** 32;
    var x = 5381;
    for (let i = 0; i < message.length; i++) {
        const c = message.charCodeAt(i);
        x = ((((x << 5) + x) % base) + c) % base;
    }
    return x;
}

function hashOk(hash: number): boolean {
    return (hash & 0xc0000000) === 0;
}
