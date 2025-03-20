import { Terminal, window, workspace } from 'vscode';

export class TerminalProvider {
    private activeTerminal: Terminal | undefined;

    public get(): Terminal {
        if (this.activeTerminal && !this.activeTerminal?.exitStatus) {
            return this.activeTerminal;
        }

        if (this.activeTerminal?.exitStatus) {
            this.activeTerminal.dispose();
        }

        this.activeTerminal = window.createTerminal({
            cwd: workspace.rootPath,
            name: 'ICP terminal',
        });

        return this.activeTerminal;
    }
}
