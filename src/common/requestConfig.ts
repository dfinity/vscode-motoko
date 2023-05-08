import { RequestType } from 'vscode-languageclient';

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
    file: string;
}

export type DeployResult =
    | {
          error: string;
      }
    | {
          canisterId: string;
      };
