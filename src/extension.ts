import * as vscode from 'vscode';
import { updateDecorations, clearDecorations } from './decorations';
import { updateWebview } from './webview';
import { registerAllCommands } from './commands';
import { registerTreeFormatter } from './treeFormatter';
import { registerCompletionProvider } from './providers/completionProvider';

export function activate(context: vscode.ExtensionContext) {
	// 1. Register commands from commands.ts
	registerAllCommands(context);
	
	// Register new providers and formatters
	registerTreeFormatter(context);
	registerCompletionProvider(context);

	context.subscriptions.push(
		vscode.languages.registerDocumentPasteEditProvider(
			{ language: 'markdown' },
			new MarkdownPasteEditProvider(),
			{
				providedPasteEditKinds: [vscode.DocumentDropOrPasteEditKind.Empty.append('text.markdown.link')]
			}
		)
	);

	// 2. Listen for active editor changes
	vscode.window.onDidChangeActiveTextEditor(editor => {
		updateDecorations(editor);
		updateWebview(editor);
	}, null, context.subscriptions);

	// 3. Listen for text document changes
	vscode.workspace.onDidChangeTextDocument(event => {
		const editor = vscode.window.activeTextEditor;
		if (editor && event.document === editor.document) {
			updateDecorations(editor);
			updateWebview(editor);
		}
	}, null, context.subscriptions);

	// 4. Listen for global changes in settings.json
	vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('customMdBlocks.rules')) {
			clearDecorations();
			updateDecorations(vscode.window.activeTextEditor);
			updateWebview(vscode.window.activeTextEditor);
		}
	}, null, context.subscriptions);

	// Trigger decorations on first launch
	updateDecorations(vscode.window.activeTextEditor);
}

export function deactivate() { }

class MarkdownPasteEditProvider implements vscode.DocumentPasteEditProvider {
    async provideDocumentPasteEdits(
        document: vscode.TextDocument,
        ranges: readonly vscode.Range[],
        dataTransfer: vscode.DataTransfer,
        context: vscode.DocumentPasteEditContext,
        token: vscode.CancellationToken
    ): Promise<vscode.DocumentPasteEdit[] | undefined> {
        const urlItem = dataTransfer.get('text/plain');
        if (!urlItem) return undefined;
        
        const url = await urlItem.asString();
        if (!/^https?:\/\/[^\s]+$/.test(url.trim())) return undefined;

        const edit = new vscode.WorkspaceEdit();
        let hasSelection = false;

        for (const range of ranges) {
            if (!range.isEmpty) {
                hasSelection = true;
                const text = document.getText(range);
                edit.replace(document.uri, range, `[${text}](${url.trim()})`);
            }
        }

        if (!hasSelection) return undefined;

        const pasteEdit = new vscode.DocumentPasteEdit('', 'Auto-link Paste', vscode.DocumentDropOrPasteEditKind.Empty.append('text.markdown.link'));
        pasteEdit.additionalEdit = edit;
        return [pasteEdit];
    }
}