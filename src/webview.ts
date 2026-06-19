import * as vscode from 'vscode';
import * as path from 'path';
import MarkdownIt = require('markdown-it');
import markdownItKatex = require('@iktakahiro/markdown-it-katex');
import markdownItTaskLists = require('markdown-it-task-lists');
import { getRules } from './config';
import { ShellSession } from './shellSession';
import { exportToGist } from './githubGist';
import { LANGUAGE_EXECUTABLE_MAP } from './executableLocator';
import { handleMissingDependency } from './dependencyManager';

let previewPanel: vscode.WebviewPanel | undefined = undefined;
let shellSession: ShellSession | undefined = undefined;
let currentDocumentUri: vscode.Uri | undefined = undefined;

export function updateWebview(activeEditor: vscode.TextEditor | undefined) {
    if (!previewPanel || !activeEditor || activeEditor.document.languageId !== 'markdown') return;

    currentDocumentUri = activeEditor.document.uri;
    let text = activeEditor.document.getText();
    
    let themeVars = '';
    const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (fmMatch) {
        text = text.substring(fmMatch[0].length);
        const lines = fmMatch[1].split('\n');
        const fm: Record<string, string> = {};
        for (const line of lines) {
            const parts = line.split(':');
            if (parts.length >= 2) fm[parts[0].trim()] = parts.slice(1).join(':').trim();
        }
        
        if (fm['font']) themeVars += `font-family: ${fm['font']} !important; `;
        if (fm['padding']) themeVars += `padding: ${fm['padding']} !important; `;
        if (fm['theme'] === 'dark') themeVars += `background-color: #1e1e1e !important; color: #d4d4d4 !important; `;
        if (fm['theme'] === 'light') themeVars += `background-color: #ffffff !important; color: #000000 !important; `;
    }

    const md = new MarkdownIt({ html: true });
    md.use(markdownItKatex);
    md.use(markdownItTaskLists, { enabled: true });
    let htmlContent = md.render(text);
    const rules = getRules();

    htmlContent = htmlContent.replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g, (match: string, innerHtml: string) => {
        return `<div class="mermaid">${innerHtml.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')}</div>`;
    });

    const regex = /<pre><code class="language-([a-zA-Z0-9_-]+)">([\s\S]*?)<\/code><\/pre>/g;
    htmlContent = htmlContent.replace(regex, (match: string, blockType: string, innerHtml: string) => {
        let styledHtml = innerHtml;
        const cleanTextContent = innerHtml.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        
        if (blockType.toLowerCase() === 'chart') {
            const chartDataRaw = cleanTextContent.replace(/&quot;/g, '"');
            const encodedChart = encodeURIComponent(chartDataRaw);
            return `<div class="chart-container" style="margin: 20px 0; background: var(--vscode-editor-background); padding: 20px; border-radius: 8px; border: 1px solid var(--vscode-editorWidget-border);"><canvas class="ag-chart" data-chart="${encodedChart}"></canvas></div>`;
        }

        if (blockType.toLowerCase() === 'html') {
            const blockId = 'block_' + Math.random().toString(36).substr(2, 9);
            return `
                <div class="code-block-container" style="position: relative; margin-bottom: 1em;">
                    <div class="code-header" style="display: flex; justify-content: space-between; background: var(--vscode-editor-inactiveSelectionBackground); padding: 4px 8px; border-radius: 6px 6px 0 0; align-items: center;">
                        <span class="lang-label" style="font-size: 0.9em; opacity: 0.8;">html</span>
                        <button class="run-btn" onclick="previewHtml('${blockId}')" style="background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; padding: 2px 8px;">👁️ Live Preview</button>
                    </div>
                    <pre style="margin-top: 0; border-radius: 0 0 6px 6px;"><code class="language-html" id="${blockId}">${innerHtml}</code></pre>
                    <div id="html_preview_${blockId}" style="display: none; margin-top: 10px; border: 1px solid var(--vscode-editorWidget-border); border-radius: 6px; padding: 0; overflow: hidden;">
                        <iframe id="iframe_${blockId}" style="width: 100%; border: none; height: 300px; background: white;"></iframe>
                    </div>
                </div>
            `;
        }
        
        // Check for DontRun comment
        const isDontRun = cleanTextContent.trim().split('\n')[0].includes('DontRun');
        if (isDontRun) {
            // Remove the DontRun line from the visible output
            styledHtml = styledHtml.replace(/^.*DontRun.*$(\r?\n)?/m, '');
        }
        
        const blockConfig = rules[blockType];
        if (blockConfig) {
            if (blockConfig.symbols) {
                for (const [symbol, color] of Object.entries<string>(blockConfig.symbols)) {
                    const escapedSymbol = symbol.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
                    styledHtml = styledHtml.replace(
                        new RegExp(escapedSymbol, 'g'),
                        `<span style="color: ${color}; font-weight: bold;">${symbol}</span>`
                    );
                }
            }

            if (blockConfig.images) {
                for (const [symbol, imgUrl] of Object.entries<string>(blockConfig.images)) {
                    const escapedSymbol = symbol.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
                    
                    let imgUrlResolved = imgUrl;
                    if (!imgUrl.startsWith('http') && !imgUrl.startsWith('data:')) {
                        if (vscode.workspace.workspaceFolders) {
                            const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
                            const uri = vscode.Uri.file(path.join(root, imgUrl));
                            imgUrlResolved = previewPanel!.webview.asWebviewUri(uri).toString();
                        }
                    }

                    styledHtml = styledHtml.replace(
                        new RegExp(escapedSymbol, 'g'),
                        `<img src="${imgUrlResolved}" alt="${symbol}" style="max-height: 1.2em; vertical-align: middle;" />`
                    );
                }
            }
        }

            const blockId = 'block_' + Math.random().toString(36).substr(2, 9);
            
            let variablesHtml = '';
            const varRegex = /\{\{([A-Za-z0-9_]+)\}\}/g;
            let varMatch;
            const vars = new Set<string>();
            while ((varMatch = varRegex.exec(styledHtml)) !== null) {
                vars.add(varMatch[1]);
            }
            if (vars.size > 0) {
                variablesHtml = `<div class="vars-container" id="vars_${blockId}" style="margin-bottom: 8px;">`;
                for (const v of vars) {
                    variablesHtml += `<input type="text" data-var="${v}" placeholder="${v}" style="margin-right: 8px; padding: 4px; border-radius: 4px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground);" />`;
                }
                variablesHtml += `</div>`;
            }
            
            const isExecutable = Object.keys(LANGUAGE_EXECUTABLE_MAP).includes(blockType.toLowerCase()) || blockType.toLowerCase() === 'ai';
            let runButtonsHtml = '';
            
            if (isExecutable && !isDontRun) {
                runButtonsHtml = `
                    <div>
                        <button class="run-btn" onclick="exportToGist('${blockId}')" style="background: transparent; color: var(--vscode-button-foreground); border: 1px solid var(--vscode-button-foreground); border-radius: 4px; cursor: pointer; padding: 2px 8px; margin-right: 5px;">Share Gist</button>
                        <button class="run-btn" onclick="runCode('${blockId}', '${blockType}')" style="background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; padding: 2px 8px;">▶ Run${blockType.toLowerCase() === 'ai' ? ' AI' : ''}</button>
                    </div>
                `;
            }

            return `
                <div class="code-block-container" style="position: relative; margin-bottom: 1em;">
                    <div class="code-header" style="display: flex; justify-content: space-between; background: var(--vscode-editor-inactiveSelectionBackground); padding: 4px 8px; border-radius: 6px 6px 0 0; align-items: center;">
                        <span class="lang-label" style="font-size: 0.9em; opacity: 0.8;">${blockType}</span>
                        ${runButtonsHtml}
                    </div>
                    ${variablesHtml}
                    <pre style="margin-top: 0; border-radius: 0 0 6px 6px;"><code class="language-${blockType}" id="${blockId}">${styledHtml}</code></pre>
                    <pre class="output-container" id="output_${blockId}" style="display: none; background: #1e1e1e; color: #d4d4d4; border: 1px solid var(--vscode-editorWidget-border); padding: 10px; margin-top: 8px; border-radius: 6px; white-space: pre-wrap; font-family: monospace;"></pre>
                </div>
            `;
        });

    previewPanel.webview.html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: var(--vscode-editor-font-family); color: var(--vscode-editor-foreground); padding: 20px; line-height: 1.6; ${themeVars} }
                pre { background-color: var(--vscode-textCodeBlock-background); padding: 16px; border-radius: 6px; overflow-x: auto; }
                code { font-family: var(--vscode-editor-font-family); }
                .top-bar { display: flex; justify-content: flex-end; margin-bottom: 20px; gap: 10px; }
                .top-btn { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; padding: 6px 12px; cursor: pointer; border-radius: 4px; }
                .error-text { color: #f48771; }
                .success-text { color: #89d185; }
            </style>
            <link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css" rel="stylesheet" />
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.8/katex.min.css">
            <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-bash.min.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-javascript.min.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-python.min.js"></script>
            <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
        </head>
        <body>
            <div class="top-bar" data-html2canvas-ignore="true">
                <button class="top-btn" onclick="startPresentation()">▶ Present</button>
                <button class="top-btn" onclick="restartSession()">🔄 Restart Shell Session</button>
                <button class="top-btn" onclick="exportPDF()" style="background: var(--vscode-button-background); color: var(--vscode-button-foreground);">📄 Export PDF</button>
            </div>
            
            <div id="pdf-content">
                ${htmlContent}
            </div>
            
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            <script>
                mermaid.initialize({ startOnLoad: true, theme: 'dark' });
                const vscode = acquireVsCodeApi();
                
                document.querySelectorAll('canvas.ag-chart').forEach(canvas => {
                    try {
                        const data = JSON.parse(decodeURIComponent(canvas.getAttribute('data-chart')));
                        new Chart(canvas, data);
                    } catch(e) { console.error('Chart parse error', e); }
                });

                function previewHtml(blockId) {
                    const codeElement = document.getElementById(blockId);
                    const container = document.getElementById('html_preview_' + blockId);
                    const iframe = document.getElementById('iframe_' + blockId);
                    if (!codeElement || !container || !iframe) return;
                    container.style.display = 'block';
                    iframe.srcdoc = codeElement.innerText;
                }

                function startPresentation() {
                    document.querySelector('.top-bar').style.display = 'none';
                    const content = document.getElementById('pdf-content');
                    const html = content.innerHTML;
                    const slides = html.split(/<hr\\s*\\/?>/i);
                    let slidesHtml = '';
                    slides.forEach(slide => { slidesHtml += '<section>' + slide + '</section>'; });
                    content.innerHTML = '<div class="reveal" style="height: 100vh;"><div class="slides">' + slidesHtml + '</div></div>';
                    
                    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.3.1/reveal.min.css'; document.head.appendChild(link);
                    const theme = document.createElement('link'); theme.rel = 'stylesheet'; theme.href = 'https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.3.1/theme/dracula.min.css'; document.head.appendChild(theme);
                    const script = document.createElement('script'); script.src = 'https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.3.1/reveal.min.js';
                    script.onload = () => { Reveal.initialize({ width: '100%', height: '100%', margin: 0.1 }); };
                    document.body.appendChild(script);
                    document.body.style.padding = '0';
                }
                
                function runCode(blockId, language) {
                    const codeElement = document.getElementById(blockId);
                    if (!codeElement) return;
                    
                    let code = codeElement.innerText;
                    
                    const varsContainer = document.getElementById('vars_' + blockId);
                    if (varsContainer) {
                        const inputs = varsContainer.querySelectorAll('input');
                        inputs.forEach(input => {
                            const varName = input.getAttribute('data-var');
                            const val = input.value;
                            code = code.split('{{' + varName + '}}').join(val);
                        });
                    }
                    
                    vscode.postMessage({
                        command: 'runScript',
                        blockId: blockId,
                        language: language,
                        code: code
                    });
                    
                    const outputContainer = document.getElementById('output_' + blockId);
                    outputContainer.style.display = 'block';
                    outputContainer.innerText = 'Running...\\n';
                    outputContainer.className = 'output-container';
                }
                
                function exportToGist(blockId) {
                    const codeElement = document.getElementById(blockId);
                    if (!codeElement) return;
                    vscode.postMessage({ command: 'exportGist', code: codeElement.innerText });
                }
                
                function restartSession() {
                    vscode.postMessage({ command: 'restartSession' });
                }
                
                function exportPDF() {
                    const element = document.getElementById('pdf-content');
                    vscode.postMessage({ command: 'pdfExportStarted' });
                    html2pdf().from(element).outputPdf('datauristring').then(function (pdfAsString) {
                        vscode.postMessage({ command: 'pdfExportReady', data: pdfAsString });
                    });
                }
                
                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.command === 'scriptResult') {
                        const outputContainer = document.getElementById('output_' + message.blockId);
                        if (outputContainer) {
                            if (message.result.includes('Error') || message.result.includes('Exception')) {
                                outputContainer.innerHTML += '<span class="error-text">' + message.result + '</span>';
                            } else {
                                outputContainer.innerHTML += '<span class="success-text">' + message.result + '</span>';
                            }
                        }
                    }
                });

                document.addEventListener('change', function(e) {
                    if (e.target && e.target.classList.contains('task-list-item-checkbox')) {
                        const checkboxes = Array.from(document.querySelectorAll('.task-list-item-checkbox'));
                        const index = checkboxes.indexOf(e.target);
                        vscode.postMessage({ command: 'toggleCheckbox', index: index, checked: e.target.checked });
                    }
                });
            </script>
        </body>
        </html>
    `;
}

export function showPreviewCommand(context: vscode.ExtensionContext) {
    if (!shellSession) shellSession = new ShellSession();

    if (previewPanel) {
        previewPanel.reveal(vscode.ViewColumn.Beside);
    } else {
        previewPanel = vscode.window.createWebviewPanel(
            'customMdPreview',
            'Custom MD Preview',
            vscode.ViewColumn.Beside,
            { enableScripts: true, localResourceRoots: vscode.workspace.workspaceFolders ? [vscode.workspace.workspaceFolders[0].uri] : [] }
        );
        
        previewPanel.onDidDispose(() => { 
            previewPanel = undefined; 
            shellSession?.dispose();
            shellSession = undefined;
        }, null, context.subscriptions);
        
        previewPanel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'runScript':
                        if (message.language.toLowerCase() === 'ai') {
                            const apiKey = vscode.workspace.getConfiguration('customMdBlocks').get<string>('geminiApiKey');
                            if (!apiKey) {
                                previewPanel?.webview.postMessage({ command: 'scriptResult', blockId: message.blockId, result: 'Error: Please set customMdBlocks.geminiApiKey in settings.' });
                                return;
                            }
                            
                            try {
                                const fetch = require('node-fetch');
                                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ contents: [{ parts: [{ text: message.code }] }] })
                                });
                                const data = await response.json();
                                const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
                                
                                if (currentDocumentUri) {
                                    const doc = await vscode.workspace.openTextDocument(currentDocumentUri);
                                    const fullText = doc.getText();
                                    const idx = fullText.indexOf(message.code);
                                    if (idx !== -1) {
                                        const endIdx = fullText.indexOf('```', idx + message.code.length);
                                        if (endIdx !== -1) {
                                            const pos = doc.positionAt(endIdx + 3);
                                            const edit = new vscode.WorkspaceEdit();
                                            edit.insert(currentDocumentUri, pos, `\n\n${text}\n`);
                                            await vscode.workspace.applyEdit(edit);
                                        }
                                    }
                                }
                                previewPanel?.webview.postMessage({ command: 'scriptResult', blockId: message.blockId, result: 'Success! Answer injected below.' });
                            } catch (e: any) {
                                previewPanel?.webview.postMessage({ command: 'scriptResult', blockId: message.blockId, result: 'Error: ' + String(e.message) });
                            }
                            return;
                        }

                        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 
                            (currentDocumentUri ? path.dirname(currentDocumentUri.fsPath) : undefined);
                            
                        if (!workspaceRoot || !shellSession) {
                            previewPanel?.webview.postMessage({
                                command: 'scriptResult',
                                blockId: message.blockId,
                                result: 'Error: Cannot determine workspace root or shell session.'
                            });
                            return;
                        }

                        let result = '';
                        try {
                            result = await shellSession.executeCodeBlock(message.code, message.language, workspaceRoot);
                        } catch (err: any) {
                            previewPanel?.webview.postMessage({
                                command: 'scriptResult',
                                blockId: message.blockId,
                                result: `Execution Error: ${err.message || String(err)}`
                            });
                            return;
                        }
                        
                        const missingModuleMatch = result.match(/ModuleNotFoundError: No module named '([^']+)'/) || 
                                                   result.match(/Error: Cannot find module '([^']+)'/);
                        
                        if (missingModuleMatch) {
                            const moduleName = missingModuleMatch[1];
                            const choice = await vscode.window.showErrorMessage(
                                `Missing library: ${moduleName}`,
                                'Install in .md_env',
                                'Ignore (DontRun)',
                                'Show Error'
                            );

                            if (choice === 'Install in .md_env') {
                                const success = await handleMissingDependency(message.language, moduleName, workspaceRoot);
                                if (success) {
                                    // Retry execution
                                    const retryResult = await shellSession.executeCodeBlock(message.code, message.language, workspaceRoot);
                                    previewPanel?.webview.postMessage({
                                        command: 'scriptResult',
                                        blockId: message.blockId,
                                        result: retryResult || '(no output)'
                                    });
                                }
                                return;
                            } else if (choice === 'Ignore (DontRun)') {
                                const editor = vscode.window.activeTextEditor;
                                if (editor) {
                                    const fullText = editor.document.getText();
                                    const idx = fullText.indexOf(message.code);
                                    if (idx !== -1) {
                                        const pos = editor.document.positionAt(idx);
                                        const prefix = ['python', 'bash', 'pwsh', 'powershell', 'sh'].includes(message.language.toLowerCase()) ? '#' : '//';
                                        await editor.edit(builder => {
                                            builder.insert(pos, `${prefix} DontRun\n`);
                                        });
                                        vscode.window.showInformationMessage('Added DontRun comment to block.');
                                    }
                                }
                                return; // don't output error
                            } else if (choice === 'Show Error') {
                                // Fall through to postMessage
                            } else {
                                return; // user closed dialog
                            }
                        }
                        
                        previewPanel?.webview.postMessage({
                            command: 'scriptResult',
                            blockId: message.blockId,
                            result: result || '(no output)'
                        });
                        return;
                    
                    case 'exportGist':
                        exportToGist(message.code, 'script.md', false);
                        return;
                        
                    case 'toggleCheckbox':
                        if (!currentDocumentUri) return;
                        const doc = await vscode.workspace.openTextDocument(currentDocumentUri);
                        const fullText = doc.getText();
                        let matchCount = 0;
                        const regex = /^[\s\>]*[\*\-\+]\s+\[([ x])\]/gm;
                        let match;
                        while ((match = regex.exec(fullText)) !== null) {
                            if (matchCount === message.index) {
                                const bracketInnerPos = match.index + match[0].length - 2; 
                                const range = new vscode.Range(doc.positionAt(bracketInnerPos), doc.positionAt(bracketInnerPos + 1));
                                const edit = new vscode.WorkspaceEdit();
                                edit.replace(currentDocumentUri, range, message.checked ? 'x' : ' ');
                                await vscode.workspace.applyEdit(edit);
                                break;
                            }
                            matchCount++;
                        }
                        return;

                    case 'restartSession':
                        shellSession?.restart();
                        vscode.window.showInformationMessage('Shell session restarted.');
                        return;
                        
                    case 'pdfExportStarted':
                        vscode.window.setStatusBarMessage('Generating PDF...', 3000);
                        return;
                        
                    case 'pdfExportReady':
                        const activeUri = currentDocumentUri || vscode.window.activeTextEditor?.document.uri;
                        if (activeUri) {
                            let pdfPath = activeUri.fsPath;
                            if (pdfPath.endsWith('.md')) {
                                pdfPath = pdfPath.substring(0, pdfPath.length - 3) + '.pdf';
                            } else {
                                pdfPath += '.pdf';
                            }
                            
                            const uri = vscode.Uri.file(pdfPath);
                            const base64Data = message.data.split(';base64,').pop();
                            if (base64Data) {
                                const buffer = Buffer.from(base64Data, 'base64');
                                await vscode.workspace.fs.writeFile(uri, buffer);
                                vscode.window.showInformationMessage(`PDF exported silently to ${path.basename(pdfPath)}`);
                            }
                        }
                        return;
                }
            },
            undefined,
            context.subscriptions
        );
        
        updateWebview(vscode.window.activeTextEditor);
    }
}