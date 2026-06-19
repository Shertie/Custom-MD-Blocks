import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as os from 'os';

export async function setupGitIgnore(workspaceRoot: string) {
    const gitignorePath = path.join(workspaceRoot, '.gitignore');
    const envEntry = '.md_env';
    
    if (fs.existsSync(gitignorePath)) {
        const content = fs.readFileSync(gitignorePath, 'utf8');
        if (!content.includes(envEntry)) {
            fs.appendFileSync(gitignorePath, `\n${envEntry}\n`);
        }
    } else {
        fs.writeFileSync(gitignorePath, `${envEntry}\n`);
    }
}

export async function handleMissingDependency(
    language: string, 
    moduleName: string, 
    workspaceRoot: string
): Promise<boolean> {
    const envPath = path.join(workspaceRoot, '.md_env');
    if (!fs.existsSync(envPath)) {
        fs.mkdirSync(envPath, { recursive: true });
    }
    await setupGitIgnore(workspaceRoot);

    return new Promise((resolve) => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Installing ${moduleName} for ${language}...`,
            cancellable: false
        }, async (progress) => {
            let cmd = '';
            let cwd = envPath;

            if (['python', 'py'].includes(language.toLowerCase())) {
                const isWin = os.platform() === 'win32';
                const pyExe = isWin ? path.join(envPath, 'Scripts', 'python.exe') : path.join(envPath, 'bin', 'python');
                const pipExe = isWin ? path.join(envPath, 'Scripts', 'pip.exe') : path.join(envPath, 'bin', 'pip');
                
                if (!fs.existsSync(pyExe)) {
                    progress.report({ message: 'Creating Python virtual environment...' });
                    try {
                        cp.execSync(`python -m venv "${envPath}"`);
                    } catch(e) {
                        vscode.window.showErrorMessage('Failed to create Python venv. Ensure Python is in PATH.');
                        return resolve(false);
                    }
                }
                
                progress.report({ message: `Running pip install ${moduleName}...` });
                cmd = `"${pipExe}" install ${moduleName}`;
            } else if (['javascript', 'js', 'node', 'typescript', 'ts'].includes(language.toLowerCase())) {
                if (!fs.existsSync(path.join(envPath, 'package.json'))) {
                    fs.writeFileSync(path.join(envPath, 'package.json'), '{"name": "md-env", "version": "1.0.0"}');
                }
                cmd = `npm install ${moduleName}`;
            } else {
                vscode.window.showErrorMessage(`Auto-install not supported for language: ${language}`);
                return resolve(false);
            }

            cp.exec(cmd, { cwd }, (err, stdout, stderr) => {
                if (err) {
                    vscode.window.showErrorMessage(`Installation failed: ${stderr || err.message}`);
                    resolve(false);
                } else {
                    vscode.window.showInformationMessage(`Successfully installed ${moduleName}!`);
                    resolve(true);
                }
            });
        });
    });
}
