import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { findExecutable } from './executableLocator';

export class ShellSession {
    private process: cp.ChildProcessWithoutNullStreams | null = null;
    private outputBuffer: string = '';
    private isExecuting: boolean = false;
    private resolveExecution: ((value: string) => void) | null = null;
    private readonly endMarker = '___AG_CMD_END___';

    constructor() {
        this.startSession();
    }

    private startSession() {
        const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
        this.process = cp.spawn(shell, [], {
            cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir(),
            env: process.env
        });

        this.process.stdout.on('data', (data) => {
            const str = data.toString();
            if (str.includes(this.endMarker)) {
                this.outputBuffer += str.split(this.endMarker)[0];
                if (this.resolveExecution) {
                    this.resolveExecution(this.outputBuffer.trim());
                    this.resolveExecution = null;
                }
                this.isExecuting = false;
            } else {
                this.outputBuffer += str;
            }
        });

        this.process.stderr.on('data', (data) => {
            this.outputBuffer += data.toString();
        });

        this.process.on('close', () => {
            this.process = null;
        });
    }

    public async executeCodeBlock(code: string, language: string, workspaceRoot: string): Promise<string> {
        if (!this.process) {
            this.startSession();
        }

        if (this.isExecuting) {
            return 'Error: Another command is currently executing.';
        }

        this.isExecuting = true;
        this.outputBuffer = '';

        return new Promise(async (resolve) => {
            this.resolveExecution = resolve;
            
            const isWin = os.platform() === 'win32';
            const suffix = isWin ? `\r\nWrite-Output "${this.endMarker}"\r\n` : `\necho "${this.endMarker}"\n`;
            
            // For bash/powershell we can pipe directly
            if (['bash', 'sh', 'powershell', 'pwsh'].includes(language.toLowerCase())) {
                this.process?.stdin.write(code + suffix);
                return;
            }

            // For others like python/js, we need to save to a temp file and execute it
            const envPath = path.join(workspaceRoot, '.md_env');
            if (!fs.existsSync(envPath)) {
                fs.mkdirSync(envPath, { recursive: true });
            }
            
            const ext = language.toLowerCase() === 'python' || language.toLowerCase() === 'py' ? '.py' : '.js';
            const tempFile = path.join(envPath, `temp_script${ext}`);
            fs.writeFileSync(tempFile, code);

            let interpreter = await findExecutable(language);
            
            // If venv exists, prefer local venv python/node
            if (['python', 'py'].includes(language.toLowerCase())) {
                const localPy = isWin ? path.join(envPath, 'Scripts', 'python.exe') : path.join(envPath, 'bin', 'python');
                if (fs.existsSync(localPy)) interpreter = localPy;
            }

            if (!interpreter) interpreter = language; // fallback to generic command

            // Execute the script using the interpreter via our persistent shell
            const runCmd = `"${interpreter}" "${tempFile}"`;
            this.process?.stdin.write(runCmd + suffix);
        });
    }

    public restart() {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
        this.startSession();
    }
    
    public dispose() {
        if (this.process) {
            this.process.kill();
        }
    }
}
