import { NotificationType, RequestType, TextEdit } from 'vscode-languageserver';

export const TEST_FILE_REQUEST = new RequestType<TestParams, TestResult, any>(
    'vscode-motoko/run-test-file',
);

export interface TestParams {
    uri: string;
}

export interface TestResult {
    passed: boolean;
    stdout: string;
    stderr: string;
}

export const DEPLOY_TEMPORARY = new RequestType<
    DeployParams,
    DeployResult,
    any
>('vscode-motoko/deploy-temporary');

export const DEPLOY_TEMPORARY_MESSAGE =
    new NotificationType<NotifyDeployParams>(
        'vscode-motoko/notify-deploy-temporary',
    );

export interface DeployParams {
    uri: string;
}

export interface DeployResult {
    canisterId: string;
}

export interface NotifyDeployParams {
    message: string;
}

export const ERROR_MESSAGE = new NotificationType<NotifyErrorParams>(
    'vscode-motoko/notify-error',
);

export interface NotifyErrorParams {
    message: string;
    detail?: string | undefined;
}

export const IMPORT_MOPS_PACKAGE = new RequestType<
    {
        uri: string;
        name: string;
    },
    Promise<TextEdit[]>,
    any
>('vscode-motoko/install-mops-package');

export const TEST_GET_DEPENDENCY_GRAPH = new RequestType<
    {
        uri: string;
    },
    [string, string[]][],
    any
>('vscode-motoko/test-get-dependency-graph');

// Server emits this notification when initialized. Useful for benchmarking.
export const TEST_SERVER_INITIALIZED = new NotificationType<{}>(
    'custom/initialized',
);
