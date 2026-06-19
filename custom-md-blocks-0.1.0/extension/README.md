# Custom MD Blocks

Custom MD Blocks is a powerful extension that transforms standard markdown files into dynamic, executable, and beautifully formatted workspaces.

## Features

- **Smart Tree Formatting:** Automatically formats ASCII-style tree structures inside ````tree` blocks. Pressing `Enter` adds a new branch, and pressing `Tab` automatically updates parent branches and nests elements.
- **Run Scripts Directly:** Execute your code blocks using the `▶ Run` button. Supports Python, Node.js, Bash, and PowerShell out of the box.
- **Missing Dependency Handling:** If your script crashes due to missing modules (e.g. `ModuleNotFoundError`), you'll be prompted to automatically create a lightweight `.md_env` environment and install it!
- **`DontRun` Ignoring:** Skip execution buttons by adding `# DontRun` (or `// DontRun`) to the first line of your block. The comment is safely hidden in the preview.
- **Syntax Highlighting & Mermaid:** Output is beautifully styled using Prism.js. ````mermaid` blocks render as interactive diagrams.
- **Input Variables:** Create runtime inputs using `{{VARIABLE}}` syntax. The preview generates input boxes above the code for interactive execution.
- **Export to PDF:** Generate flawless PDF exports of your formatted markdown with a single click in the preview window. The PDF is saved directly next to your original file.
- **Share to Gist:** Instantly publish blocks of code as Secret Gists on your GitHub.

## How to add custom script languages

By default, the `▶ Run` button only appears for recognized executable languages (`bash`, `python`, `node`, etc.). If you want to support additional languages (e.g. `ruby`, `go`, `php`), you can modify the extension source code:

1. Open `src/executableLocator.ts`.
2. Locate the `LANGUAGE_EXECUTABLE_MAP` object.
3. Map your language tag to its respective binary. For example:
   ```typescript
   export const LANGUAGE_EXECUTABLE_MAP: Record<string, string> = {
       // ... existing
       'ruby': 'ruby',
       'php': 'php',
       'go': 'go run'
   };
   ```
4. Recompile the extension (`npm run compile`) and package it (`vsce package`). The extension automatically handles locating the absolute binary path securely using your system's `where`/`which` utility.

## Extension Settings

You can define custom symbols and image replacements in `settings.json`:

```json
"customMdBlocks.rules": {
    "tree": {
        "symbols": {
            "[warn]": "#ff9900",
            "[error]": "#ff0000"
        },
        "images": {
            "[logo]": "assets/logo.png"
        }
    }
}
```

(Note: Image paths must be relative to the root of your workspace to be dynamically resolved.)
