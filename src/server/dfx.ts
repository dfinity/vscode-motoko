import { readFileSync } from 'fs';
import { dirname } from 'path';

interface DfxCanister {
    type?: string;
    main?: string;
}

interface DfxConfig {
    canisters: { [name: string]: DfxCanister };
}

// `T`: success
// `undefined`: error or not yet resolved
type Cached<T> = T | undefined;

export default class DfxResolver {
    private readonly _findPath: () => Promise<string | null>;

    private _path: Cached<string | null>;
    private _cache: Cached<DfxConfig | null>;

    constructor(findPath: () => Promise<string | null>) {
        this._findPath = findPath;
    }

    clear() {
        this._cache = undefined;
    }

    async load(
        directory: Cached<string | null>,
    ): Promise<Cached<DfxConfig | null>> {
        if (!directory) {
            return null;
        }
        try {
            return JSON.parse(readFileSync(directory, 'utf8')) as DfxConfig;
        } catch (err) {
            console.error(`Error while reading dfx.json config: ${err}`);
            return;
        }
    }

    /**
     * Retrieves a cached `dfx.json` configuration.
     * @returns `null` if not found, `undefined` if an error occurred, and a `DfxConfig` object if successful
     */
    async getConfig(): Promise<Cached<DfxConfig | null>> {
        if (this._cache === undefined) {
            this._cache = await this.load(await this.getConfigPath());
        }
        return this._cache;
    }
    /**
     * Retrieves the path to the `dfx.json` configuration file.
     * @returns `null` if not found, `undefined` if an error occurred, and a file path `string` if successful
     */
    async getConfigPath(): Promise<Cached<string | null>> {
        if (this._path === undefined) {
            this._path = await this._findPath();
        }
        return this._path;
    }

    // Directory containing `dfx.json`
    async getProjectDirectory(): Promise<Cached<string | null>> {
        const path = await this.getConfigPath();
        return typeof path === 'string' ? dirname(path) : path;
    }

    // // `.dfx` directory
    // async getCacheDirectory(): Promise<Cached<string | null>> {
    //     const projectDir = this.getProjectDirectory();
    //     if (typeof projectDir !== 'string') {
    //         return projectDir;
    //     }
    //     const cacheDir = join(projectDir, '.dfx');
    //     if (!existsSync(cacheDir)) {
    //         return null;
    //     }
    //     return cacheDir;
    // }
}
