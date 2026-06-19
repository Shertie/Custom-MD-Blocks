import * as vscode from 'vscode';

export function getRules() {
    const config = vscode.workspace.getConfiguration('customMdBlocks');
    return config.get<any>('rules') || {};
}