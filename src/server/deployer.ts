import { IDL } from '@dfinity/candid';
import { Principal } from '@dfinity/principal';
import { Headers } from 'cross-fetch';
import ic from 'ic0';
import { DeployParams, DeployResult } from '../common/connectionTypes';
import { getContext } from './context';
import { resolveVirtualPath } from './utils';

// Patch for `@dfinity/agent`
global.Headers = Headers;

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

interface ProfilingConfig {
    start_page: [] | [number];
    page_limit: [] | [number];
}

const deployer = ic('mwrha-maaaa-aaaab-qabqq-cai');

const origin = { origin: 'vscode', tags: [] };

const currentCanisterMap = new Map<string, CanisterInfo>();
const currentCanisterTimeoutMap = new Map<
    string,
    ReturnType<typeof setTimeout>
>();

export async function deployTemporary(
    { uri }: DeployParams,
    notify: (message: string) => void,
): Promise<DeployResult> {
    const name = chooseCanisterName(uri);

    // Compile WebAssembly
    const { wasm } = await compile(uri);

    // Reuse or create a canister
    const canister = currentCanisterMap.get(uri) || (await createCanister());
    clearTimeout(currentCanisterTimeoutMap.get(uri)!);
    currentCanisterTimeoutMap.set(
        uri,
        setTimeout(() => currentCanisterMap.delete(uri), 20 * 60 * 1000),
    );

    // TODO: custom init args?
    const arg = IDL.encode([], []);
    const profiling = null;

    // Deploy and reset canister state
    const updatedCanister = await deploy(
        name,
        canister,
        new Uint8Array(arg),
        'reinstall',
        wasm,
        profiling,
    );
    currentCanisterMap.set(uri, updatedCanister);

    return {
        canisterId: canister.id.toString(),
    };
    async function compile(uri: string): Promise<CompileResult> {
        notify('Compiling...');
        const context = getContext(uri);
        const { motoko } = context;
        const result = motoko.wasm(resolveVirtualPath(uri), 'ic');
        // if (!result.code ) {
        //     throw new Error('Syntax error');
        // }
        if (result.candid.trim() === '') {
            throw new Error(`${uri} has no actor`);
        }
        if (result.stable === null) {
            throw new Error(`${uri} cannot generate stable signature`);
        }
        return result;
    }

    async function deploy(
        canisterName: string,
        canisterInfo: CanisterInfo | null,
        args: Uint8Array,
        mode: 'install' | 'reinstall' | 'upgrade',
        wasm: Uint8Array,
        profiling: ProfilingConfig | null,
    ): Promise<CanisterInfo> {
        let updatedState: CanisterInfo | null = null;
        if (!canisterInfo) {
            if (mode !== 'install') {
                throw new Error(`Cannot '${mode}' for new canister`);
            }
            canisterInfo = await createCanister();
            notify(`Deploying ${canisterInfo.id}...`);
            updatedState = await install(
                canisterInfo,
                wasm,
                args,
                'install',
                profiling,
            );
        } else {
            if (mode !== 'reinstall' && mode !== 'upgrade') {
                throw new Error(`Unknown mode '${mode}'`);
            }
            notify(`Deploying ${canisterInfo.id}...`);
            updatedState = await install(
                canisterInfo,
                wasm,
                args,
                mode,
                profiling,
            );
        }
        console.log('Finished deploying canister');
        //updatedState.candid = candid_source;
        updatedState.name = canisterName;
        return updatedState;
    }

    async function createCanister(): Promise<CanisterInfo> {
        const nonce = pow();
        notify('Creating new canister...');
        const info: CanisterInfo = await deployer.call(
            'getCanisterId',
            nonce,
            origin,
        );
        return {
            id: info.id,
            timestamp: info.timestamp,
        };
    }

    async function install(
        canisterInfo: CanisterInfo,
        module: Uint8Array,
        args: Uint8Array,
        mode: string,
        profiling: ProfilingConfig | null,
    ): Promise<CanisterInfo> {
        notify('Installing WebAssembly...');
        if (!canisterInfo) {
            throw new Error('No canister ID');
        }
        const canisterId = canisterInfo.id;
        const installArgs = {
            arg: [...args],
            wasm_module: [...module],
            mode: { [mode]: null },
            canister_id: canisterId,
        };
        const installConfig = {
            profiling: !!profiling,
            start_page: profiling?.start_page ? [profiling.start_page] : [],
            page_limit: profiling?.page_limit ? [profiling.page_limit] : [],
            is_whitelisted: false,
            origin,
        };
        const newInfo: CanisterInfo = await deployer.call(
            'installCode',
            canisterInfo,
            installArgs,
            installConfig,
        );
        canisterInfo = newInfo;
        console.log(`Code installed at canister ID: ${canisterInfo.id}`);
        return canisterInfo;
    }

    function chooseCanisterName(uri: string): string {
        const path = uri.split('/');
        const name = path.pop()!.toLowerCase();
        if (name === 'main.mo' && path.length) {
            return path.pop()!.toLowerCase();
        } else {
            const suffix = name.lastIndexOf('.');
            if (suffix === -1) return name;
            return name.slice(0, suffix);
        }
    }

    // Proof-of-work algorithm
    function pow() {
        'use strict';
        const domain = 'motoko-playground';
        const timestamp = BigInt(Date.now()) * BigInt(1_000_000);
        notify('Running proof of work...');
        console.time('PoW');
        const prefix = domain + timestamp;
        const base = 2 ** 32;
        let nonce = Math.floor((Math.random() * Number.MAX_SAFE_INTEGER) / 2);
        while (true) {
            const message = prefix + nonce;
            let hash = 5381;
            for (let i = 0; i < message.length; i++) {
                const c = message.charCodeAt(i);
                hash = ((((hash << 5) + hash) % base) + c) % base;
            }
            if ((hash & 0xc0000000) === 0) {
                break;
            }
            nonce++;
        }
        console.timeEnd('PoW');
        return {
            timestamp,
            nonce,
        };
    }

    // async function deleteCanister(info: CanisterInfo) {
    //     await playground.call('removeCode', info);
    // }
}
