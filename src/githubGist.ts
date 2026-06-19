import * as vscode from 'vscode';

export async function exportToGist(content: string, filename: string = 'custom-md-block.md', isPublic: boolean = false) {
    try {
        const session = await vscode.authentication.getSession('github', ['gist'], { createIfNone: true });
        if (!session) {
            vscode.window.showErrorMessage('GitHub authentication failed.');
            return;
        }

        const gistData = {
            description: 'Exported from Custom MD Blocks',
            public: isPublic,
            files: {
                [filename]: {
                    content: content
                }
            }
        };

        const response = await fetch('https://api.github.com/gists', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session.accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(gistData)
        });

        if (response.ok) {
            const data = (await response.json()) as any;
            const action = await vscode.window.showInformationMessage(`Gist created successfully!`, 'Open in Browser');
            if (action === 'Open in Browser') {
                vscode.env.openExternal(vscode.Uri.parse(data.html_url));
            }
        } else {
            vscode.window.showErrorMessage(`Failed to create gist: ${response.statusText}`);
        }
    } catch (e: any) {
        vscode.window.showErrorMessage(`Error creating gist: ${e.message}`);
    }
}
