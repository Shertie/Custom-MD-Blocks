import * as vscode from 'vscode';
import { getRules } from './config';

export function registerTreeFormatter(context: vscode.ExtensionContext) {
    let isFormatting = false;

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(async event => {
            if (isFormatting || event.contentChanges.length === 0) return;

            const editor = vscode.window.activeTextEditor;
            if (!editor || event.document !== editor.document || editor.document.languageId !== 'markdown') return;

            const change = event.contentChanges[0];
            const text = change.text;

            // Zmiana na nową linię (Enter)
            if (text === '\n' || text === '\r\n') {
                const position = change.range.start;
                const line = editor.document.lineAt(position.line);

                // Sprawdzamy czy jesteśmy wewnątrz bloku ```tree
                if (!isInsideTreeBlock(editor.document, position.line)) return;

                const match = line.text.match(/^(\s*)([├└]──\s)?(.*)$/);
                if (match) {
                    const indent = match[1];
                    // Automatyczne wstawienie nowej gałęzi poniżej
                    const insertText = indent + '└── ';
                    
                    isFormatting = true;
                    await editor.edit(editBuilder => {
                        // Jeśli stara linia to było └──, zmieniamy ją na ├──
                        if (line.text.includes('└──')) {
                            const oldLineRange = new vscode.Range(
                                position.line,
                                line.text.indexOf('└──'),
                                position.line,
                                line.text.indexOf('└──') + 3
                            );
                            editBuilder.replace(oldLineRange, '├──');
                        }
                        
                        editBuilder.insert(new vscode.Position(position.line + 1, 0), insertText);
                    });
                    isFormatting = false;
                }
            } 
            // Zmiana polegająca na tabulacji / spacji
            else if (text === '\t' || text === '    ' || text === '  ') {
                const position = change.range.start;
                if (!isInsideTreeBlock(editor.document, position.line)) return;

                const line = editor.document.lineAt(position.line);
                if (line.text.includes('└──')) {
                    isFormatting = true;
                    await editor.edit(editBuilder => {
                        // Zmieniamy wyższą gałąź w strukturze? Wg polecenia:
                        // "a wciśnięcie tabu, przeniesie o jeden poziom głębiej (czyli pipe i po \t └)"
                        const replaceRange = new vscode.Range(position.line, 0, position.line, line.text.length);
                        // Zbudujmy nowy zagnieżdżony element
                        const parts = line.text.split('└──');
                        if (parts.length >= 2) {
                            const newIndent = parts[0] + '│   ';
                            editBuilder.replace(replaceRange, newIndent + '└── ' + parts[1].trim());
                        }
                    });
                    isFormatting = false;
                }
            }
        })
    );
}

function isInsideTreeBlock(document: vscode.TextDocument, lineIdx: number): boolean {
    let inside = false;
    for (let i = 0; i <= lineIdx; i++) {
        const text = document.lineAt(i).text.trim();
        if (text.startsWith('```tree')) {
            inside = true;
        } else if (text.startsWith('```') && inside) {
            inside = false;
        }
    }
    return inside;
}
