import * as vscode from 'vscode';
import { getRules } from '../config';

export function registerCompletionProvider(context: vscode.ExtensionContext) {
    const provider = vscode.languages.registerCompletionItemProvider('markdown', {
        provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
            const rules = getRules();
            const completions: vscode.CompletionItem[] = [];

            // We iterate through rules and gather all symbols and images as completion items
            for (const [blockType, blockConfig] of Object.entries<any>(rules)) {
                if (blockConfig.symbols) {
                    for (const symbol of Object.keys(blockConfig.symbols)) {
                        const item = new vscode.CompletionItem(symbol, vscode.CompletionItemKind.Keyword);
                        item.detail = `Symbol (${blockType})`;
                        completions.push(item);
                    }
                }
                
                if (blockConfig.images) {
                    for (const imageTag of Object.keys(blockConfig.images)) {
                        const item = new vscode.CompletionItem(imageTag, vscode.CompletionItemKind.Reference);
                        item.detail = `Image (${blockType})`;
                        completions.push(item);
                    }
                }
            }

            return completions;
        }
    }, '['); // Trigger character e.g. for image tags like [warn]

    context.subscriptions.push(provider);
}
