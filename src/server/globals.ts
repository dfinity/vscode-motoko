import { FormatterKind } from './formatter';

export interface Settings {
    motoko: MotokoSettings;
}

export interface InitializationOptions {
    formatter?: FormatterKind;
    useDefaultMocJs?: boolean;
}

export interface MotokoSettings {
    hideWarningRegex?: string;
    maxNumberOfProblems?: number;
    debugHover?: boolean;
    extraFlags?: string[];
    formatter?: FormatterKind;
    mocJsPath?: string;
}

export let settings: MotokoSettings = {};
export function setSettings(motokoSettings: MotokoSettings) {
    settings = motokoSettings;
}
export let initializationOptions: InitializationOptions = {};
export function setInitializationOptions(options: InitializationOptions) {
    initializationOptions = options;
}

export const DEFAULT_FORMATTER: FormatterKind = 'prettier';
