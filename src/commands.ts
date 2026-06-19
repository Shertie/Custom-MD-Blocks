import * as vscode from 'vscode';
import { showPreviewCommand } from './webview';

export function registerAllCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('customMdBlocks.showPreview', () => {
            showPreviewCommand(context);
        }),
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
        }),
        vscode.commands.registerCommand('customMdBlocks.toggleBold', () => toggleFormat('**')),
        vscode.commands.registerCommand('customMdBlocks.toggleItalic', () => toggleFormat('*')),
        vscode.commands.registerCommand('customMdBlocks.generateTOC', generateTOCCommand)
    );
}

async function toggleFormat(char: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    
    const doc = editor.document;
    const selections = editor.selections;
    
    editor.edit(builder => {
        for (const selection of selections) {
            const text = doc.getText(selection);
            if (text.startsWith(char) && text.endsWith(char)) {
                builder.replace(selection, text.substring(char.length, text.length - char.length));
            } else {
                builder.replace(selection, `${char}${text}${char}`);
            }
        }
    });
}

async function generateTOCCommand() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    
    const doc = editor.document;
    const text = doc.getText();
    const lines = text.split('\n');
    let toc = '<!-- TOC -->\n## Table of Contents\n';
    
    const headingRegex = /^(#{1,6})\s+(.*)$/;
    let inCodeBlock = false;
    for (const line of lines) {
        if (line.trim().startsWith('```')) inCodeBlock = !inCodeBlock;
        if (inCodeBlock) continue;
        
        const match = line.match(headingRegex);
        if (match && match[2].trim() !== 'Table of Contents') {
            const level = match[1].length;
            const title = match[2].trim();
            const link = title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
            const indent = '  '.repeat(level - 1);
            toc += `${indent}- [${title}](#${link})\n`;
        }
    }
    toc += '<!-- /TOC -->\n';
    
    const tocRegex = /<!-- TOC -->[\s\S]*?<!-- \/TOC -->\n?/;
    editor.edit(builder => {
        const match = text.match(tocRegex);
        if (match) {
            const startPos = doc.positionAt(match.index!);
            const endPos = doc.positionAt(match.index! + match[0].length);
            builder.replace(new vscode.Range(startPos, endPos), toc);
        } else {
            builder.insert(new vscode.Position(0, 0), toc + '\n');
        }
    });
}