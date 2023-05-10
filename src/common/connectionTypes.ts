import { NotificationType, RequestType } from 'vscode-languageserver';

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

export const DEPLOY_PLAYGROUND = new RequestType<
    DeployParams,
    DeployResult,
    any
>('vscode-motoko/deploy-playground');

export interface DeployParams {
    uri: string;
}

export interface DeployResult {
    canisterId: string;
}

export const DEPLOY_PLAYGROUND_MESSAGE =
    new NotificationType<NotifyDeployParams>(
        'vscode-motoko/notify-deploy-playground',
    );

export interface NotifyDeployParams {
    message: string;
}
