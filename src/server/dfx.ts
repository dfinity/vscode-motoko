import { readFileSync } from 'fs';

interface DfxCanister {
    type?: string;
    main?: string;
}

interface DfxConfig {
    canisters: { [name: string]: DfxCanister };
}

export default class DfxResolver {
    private _cache: DfxConfig | undefined | null;
    private _findDfx: () => string | undefined;

    constructor(findDfx: () => string | undefined) {
        this._findDfx = findDfx;
    }

    clear() {
        this._cache = undefined;
    }

    readConfigFile(filePath: string | undefined): DfxConfig | undefined | null {
        if (!filePath) {
            return null;
        }
        try {
            return JSON.parse(readFileSync(filePath, 'utf8')) as DfxConfig;
        } catch (err) {
            console.error(`Error while reading dfx.json config: ${err}`);
            return;
        }
    }

    /**
     * Retrieves a cached `dfx.json` configuration.
     * @param uri The URI of the document requesting the dfx configuration
     * @returns `null` if not found, `undefined` if an error occurred, and a `DfxConfig` object if successful
     */
    getConfig(_uri: string): DfxConfig | undefined | null {
        if (this._cache === undefined) {
            this._cache = this.readConfigFile(this._findDfx());
        }
        return this._cache;
    }
}
