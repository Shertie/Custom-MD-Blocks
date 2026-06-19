import * as vscode from 'vscode';
import { showPreviewCommand } from './webview';

export function registerAllCommands(context: vscode.ExtensionContext) {
    // Preview command
    context.subscriptions.push(
        vscode.commands.registerCommand('customMdBlocks.showPreview', () => {
            showPreviewCommand(context);
        })
    );

    // Import template command
    context.subscriptions.push(
        vscode.commands.registerCommand('customMdBlocks.importTemplate', async () => {
            const url = await vscode.window.showInputBox({
                prompt: 'Paste URL to the JSON template file (e.g., GitHub Raw)',
                placeHolder: 'https://raw.githubusercontent.com/.../template.json'
            });

            if (!url) return;

            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error('Network error');
                const newData = (await response.json()) as Record<string, any>;

                const config = vscode.workspace.getConfiguration('customMdBlocks');
                const currentRules = config.get<Record<string, any>>('rules') || {};
                const updatedRules = { ...currentRules, ...newData };

                await config.update('rules', updatedRules, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage('🔥 Template imported successfully!');
            } catch (error) {
                vscode.window.showErrorMessage('❌ Failed to fetch template. Check the link.');
            }
        })
    );
}