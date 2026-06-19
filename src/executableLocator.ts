import * as cp from 'child_process';
import * as os from 'os';

export const LANGUAGE_EXECUTABLE_MAP: Record<string, string> = {
    'python': 'python',
    'javascript': 'node',
    'js': 'node',
    'node': 'node',
    'typescript': 'ts-node',
    'ts': 'ts-node',
    'bash': 'bash',
    'sh': 'sh',
    'powershell': 'powershell',
    'pwsh': 'pwsh'
};

export async function findExecutable(language: string): Promise<string | null> {
    const executableName = LANGUAGE_EXECUTABLE_MAP[language];
    if (!executableName) return null;

    const command = os.platform() === 'win32' ? `where ${executableName}` : `which ${executableName}`;
    
    return new Promise((resolve) => {
        cp.exec(command, (error, stdout) => {
            if (error || !stdout.trim()) {
                resolve(null);
            } else {
                // Return the first line if multiple paths are found
                resolve(stdout.split('\n')[0].trim());
            }
        });
    });
}
