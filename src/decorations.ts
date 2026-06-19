import * as vscode from 'vscode';
import { getRules } from './config';

let decorationTypes: { [color: string]: vscode.TextEditorDecorationType } = {};

export function updateDecorations(activeEditor: vscode.TextEditor | undefined) {
    if (!activeEditor || activeEditor.document.languageId !== 'markdown') return;

    const rules = getRules();
    const text = activeEditor.document.getText();
    const decorationsMap: { [color: string]: vscode.DecorationOptions[] } = {};

    for (const [blockType, blockConfig] of Object.entries<any>(rules)) {
        if (!blockConfig || !blockConfig.symbols) continue;

        const blockRegex = new RegExp(`\`\`\`${blockType}[\\s\\S]*?\`\`\``, 'g');
        let blockMatch;

        while ((blockMatch = blockRegex.exec(text))) {
            const blockStart = blockMatch.index;
            const blockContent = blockMatch[0];

            for (const [symbol, color] of Object.entries<string>(blockConfig.symbols)) {
                const escapedSymbol = symbol.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
                const symbolRegex = new RegExp(escapedSymbol, 'g');
                let symbolMatch;

                if (!decorationsMap[color]) decorationsMap[color] = [];

                while ((symbolMatch = symbolRegex.exec(blockContent))) {
                    const startPos = activeEditor.document.positionAt(blockStart + symbolMatch.index);
                    const endPos = activeEditor.document.positionAt(blockStart + symbolMatch.index + symbolMatch[0].length);
                    decorationsMap[color].push({ range: new vscode.Range(startPos, endPos) });
                }
            }
        }
    }

    for (const color in decorationTypes) { activeEditor.setDecorations(decorationTypes[color], []); }
    for (const [color, ranges] of Object.entries(decorationsMap)) {
        if (!decorationTypes[color]) {
            decorationTypes[color] = vscode.window.createTextEditorDecorationType({ color: color, fontWeight: 'bold' });
        }
        activeEditor.setDecorations(decorationTypes[color], ranges);
    }
}

export function clearDecorations() {
    for (const color in decorationTypes) { decorationTypes[color].dispose(); }
    decorationTypes = {};
}