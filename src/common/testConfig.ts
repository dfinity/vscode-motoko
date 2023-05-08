export const TEST_FILE_REQUEST = 'vscode-motoko:run-test-file';

export interface TestParams {
    uri: string;
}

export interface TestResult {
    passed: boolean;
    stdout: string;
    stderr: string;
}
