import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { findExecutable } from './executableLocator';

export class ShellSession {
    private processes: Map<string, cp.ChildProcessWithoutNullStreams> = new Map();
    private outputBuffers: Map<string, string> = new Map();
    private isExecuting: Map<string, boolean> = new Map();
    private resolveExecution: Map<string, ((value: string) => void) | null> = new Map();
    private readonly endMarker = '___AG_CMD_END___';

    constructor() {
        this.startSession('shell');
    }

    private startSession(type: string, interpreterPath?: string, runnerScript?: string) {
        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();
        let cmd = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
        let args: string[] = [];

        if (type === 'python') {
            cmd = interpreterPath || 'python';
            args = ['-u', runnerScript!];
        } else if (type === 'javascript') {
            cmd = interpreterPath || 'node';
            args = [runnerScript!];
        }

        const proc = cp.spawn(cmd, args, { cwd, env: process.env });

        proc.stdout.on('data', (data) => {
            const str = data.toString();
            if (str.includes(this.endMarker)) {
                let buf = this.outputBuffers.get(type) || '';
                buf += str.split(this.endMarker)[0];
                this.outputBuffers.set(type, buf);
                
                const resolver = this.resolveExecution.get(type);
                if (resolver) {
                    resolver(buf.trim());
                    this.resolveExecution.set(type, null);
                }
                this.isExecuting.set(type, false);
            } else {
                this.outputBuffers.set(type, (this.outputBuffers.get(type) || '') + str);
            }
        });

        proc.stderr.on('data', (data) => {
            this.outputBuffers.set(type, (this.outputBuffers.get(type) || '') + data.toString());
        });

        proc.on('close', () => {
            this.processes.delete(type);
        });

        this.processes.set(type, proc);
    }

    public async executeCodeBlock(code: string, language: string, workspaceRoot: string): Promise<string> {
        let sessionType = 'shell';
        if (['python', 'py'].includes(language.toLowerCase())) sessionType = 'python';
        if (['javascript', 'js', 'node'].includes(language.toLowerCase())) sessionType = 'javascript';

        if (this.isExecuting.get(sessionType)) {
            return 'Error: Another command is currently executing in this environment.';
        }

        this.isExecuting.set(sessionType, true);
        this.outputBuffers.set(sessionType, '');

        return new Promise(async (resolve) => {
            this.resolveExecution.set(sessionType, resolve);
            
            const isWin = os.platform() === 'win32';
            const suffix = isWin ? `\r\nWrite-Output "${this.endMarker}"\r\n` : `\necho "${this.endMarker}"\n`;
            
            if (sessionType === 'shell') {
                if (!this.processes.has('shell')) this.startSession('shell');
                this.processes.get('shell')?.stdin.write(code + suffix);
                return;
            }

            const envPath = path.join(workspaceRoot, '.md_env');
            if (!fs.existsSync(envPath)) fs.mkdirSync(envPath, { recursive: true });
            
            let interpreter = await findExecutable(language);
            if (sessionType === 'python') {
                const localPy = isWin ? path.join(envPath, 'Scripts', 'python.exe') : path.join(envPath, 'bin', 'python');
                if (fs.existsSync(localPy)) interpreter = localPy;
            }
            if (!interpreter) interpreter = sessionType === 'python' ? 'python' : 'node';

            const runnerFile = path.join(envPath, `ag_runner.${sessionType === 'python' ? 'py' : 'js'}`);
            if (!fs.existsSync(runnerFile)) {
                if (sessionType === 'python') {
                    fs.writeFileSync(runnerFile, `import sys, os\nenv = {}\nwhile True:\n  try:\n    path = sys.stdin.readline().strip()\n    if not path: continue\n    with open(path, 'r', encoding='utf-8') as f: code = f.read()\n    exec(code, env)\n    print('${this.endMarker}')\n    sys.stdout.flush()\n  except Exception as e:\n    import traceback\n    traceback.print_exc()\n    print('${this.endMarker}')\n    sys.stdout.flush()\n`);
                } else {
                    fs.writeFileSync(runnerFile, `const fs = require('fs'), readline = require('readline'), vm = require('vm');\nconst ctx = vm.createContext({ console, require, process, module, __dirname, __filename, exports, Buffer });\nconst rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });\nrl.on('line', (line) => {\n  if (!line) return;\n  try { vm.runInContext(fs.readFileSync(line, 'utf8'), ctx); } catch(e) { console.error(e); }\n  console.log('${this.endMarker}');\n});\n`);
                }
            }

            if (!this.processes.has(sessionType)) {
                this.startSession(sessionType, interpreter, runnerFile);
            }

            const tempFile = path.join(envPath, `temp_script${sessionType === 'python' ? '.py' : '.js'}`);
            fs.writeFileSync(tempFile, code);

            this.processes.get(sessionType)?.stdin.write(tempFile + '\n');
        });
    }

    public restart() {
        for (const proc of this.processes.values()) {
            proc.kill();
        }
        this.processes.clear();
        this.startSession('shell');
    }
    
    public dispose() {
        for (const proc of this.processes.values()) {
            proc.kill();
        }
        this.processes.clear();
    }
}
