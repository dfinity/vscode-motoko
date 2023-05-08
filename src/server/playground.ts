// import { Principal } from "@dfinity/principal";
import motoko from './motoko';

export async function deployPlayground() {}

interface CanisterInfo {
    //   id: Principal;
    id: string;
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

async function compileCandid(virtualFile: string): Promise<string | undefined> {
    const candid = motoko.candid(virtualFile);
    if (!candid) {
        throw new Error(`Cannot deploy: syntax error`);
    } else if (candid.trim() === '') {
        throw new Error(`Cannot deploy: ${virtualFile} has no actor`);
    }
    return candid;
}

async function compileWasm(
    virtualFile: string,
): Promise<CompileResult | undefined> {
    const result = motoko.wasm(virtualFile, 'ic');
    // if (!out.code ) {
    //     logger.log('syntax error');
    //     return;
    // }
    // if (out.code.candid.trim() === '') {
    //     logger.log(`cannot deploy: ${virtualFile} has no actor`);
    //     return;
    // }
    // if (out.code.stable === null) {
    //     logger.log(`cannot deploy: ${virtualFile} cannot generate stable signature`);
    //     return;
    // }
    // logger.log(
    //     `Compiled Wasm size: ${Math.floor(out.code.wasm.length / 1024)}KB`,
    // );
    return result.wasm /* .code */;
}

async function deploy(
    canisterName: string,
    canisterInfo: CanisterInfo | null,
    args: Uint8Array,
    mode: string,
    wasm: Uint8Array,
    profiling: boolean,
): Promise<CanisterInfo | undefined> {
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
    const timestamp = BigInt(Date.now()) * BigInt(1_000_000);
    const nonce = await worker.pow(timestamp);
    const info = await backend.getCanisterId(nonce);
    return {
        id: info.id,
        timestamp: info.timestamp,
    };
}

async function deleteCanister(info: CanisterInfo) {
    await backend.removeCode(info);
}

async function install(
    canisterInfo: CanisterInfo,
    module: Uint8Array,
    args: Uint8Array,
    mode: string,
    profiling: boolean,
): Promise<CanisterInfo> {
    if (!canisterInfo) {
        throw new Error('no canister id');
    }
    const canisterId = canisterInfo.id;
    const installArgs = {
        arg: [...args],
        wasm_module: [...module],
        mode: { [mode]: null },
        canister_id: canisterId,
    };
    const new_info = await backend.installCode(
        canisterInfo,
        installArgs,
        profiling,
    );
    canisterInfo = new_info;
    return canisterInfo;
}

function getCanisterName(file: string): string {
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
