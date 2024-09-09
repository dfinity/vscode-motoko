import * as vscode from 'vscode';
import { exec } from 'child_process';

function stripAnsiCodes(input: string): string {
    const ansiRegex =
        /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
    return input.replace(ansiRegex, '');
}

export async function startReplica(
    outputChannel: vscode.OutputChannel,
): Promise<boolean> {
    outputChannel.show(true);
    outputChannel.appendLine(`Starting replica...`);

    const command = `dfx start`;
    const replicaProcess = exec(command, { cwd: vscode.workspace.rootPath });

    if (replicaProcess.stdout) {
        replicaProcess.stdout.on('data', (data) => {
            const cleanData = stripAnsiCodes(data.toString());
            outputChannel.appendLine(cleanData);
        });
    }

    if (replicaProcess.stderr) {
        replicaProcess.stderr.on('data', (data) => {
            const cleanData = stripAnsiCodes(data.toString());
            outputChannel.appendLine(cleanData);
        });
    }

    replicaProcess.on('close', (code) => {
        outputChannel.appendLine(`Replica process exited with code ${code}`);
    });
    return true;
}
