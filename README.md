# Custom MD Blocks 🚀

**Custom MD Blocks** is a powerful extension designed to transform standard, static Markdown files into dynamic, interactive workspaces. It brings code execution, smart syntax formatting, automated dependency management, and sharing capabilities right into the VS Code Markdown preview.

---

## 🌟 Key Features

### 💻 Interactive Code Execution

Execute your code directly from the markdown preview. Out of the box, the extension supports running `Python`, `Node.js / JavaScript`, `TypeScript`, `Bash`, and `PowerShell`.

- **Persistent Shell Sessions:** Variables initialized in one block (e.g., `export KEY="123"` in bash) are carried over to the next executed block.
- **Auto-Locator:** The extension automatically scans your operating system (using `where` or `which`) to find the exact absolute paths to the interpreters, ignoring faulty default directories.

### 📦 Smart Dependency Installer

Ever shared a markdown file with a script, only to have it crash because the reader didn't have `requests` or `axios` installed?

- If a block crashes due to a missing module (e.g., `ModuleNotFoundError`), the extension intercepts the error and offers to **automatically create a hidden virtual environment (`.md_env`)**.
- It will install the missing package via `pip` or `npm`, silently add the directory to your `.gitignore`, and re-run your code flawlessly!

### 🌲 Smart Tree Formatting

Building ASCII folder structures in markdown is tedious. The ` ```tree` language block handles the heavy lifting for you:

- **`Enter`:** Automatically clones the indentation and inserts a new `└──` branch. Converts previous branches to `├──`.
- **`Tab` (Spaces):** Nests the current branch, mapping parent lines seamlessly.

### 🛑 `DontRun` Directives

Sometimes a code block is just for documentation.

- Add `# DontRun` (for Python/Shell) or `// DontRun` (for JS/TS) to the very first line of a block.
- The `▶ Run` button will be completely removed for that block.
- The comment itself is **hidden** in the preview, keeping your documentation clean!

### 📥 Runtime Variables

Use the `{{VARIABLE_NAME}}` syntax inside your code blocks. The Webview preview will automatically parse these and generate interactive HTML `<input>` text boxes above the code. Type your value, hit run, and the extension injects your input directly into the script before execution.

### 🎨 Visuals & Diagrams

- **Mermaid.js:** Write ` ```mermaid` blocks and watch them automatically render into interactive charts and diagrams within the preview.
- **Syntax Highlighting:** Output and blocks are beautifully themed using Prism.js (Tomorrow Night Theme).

### 📤 Export & Share

- **Silent PDF Export:** Click the "Export PDF" button to generate a beautifully styled PDF document of your markdown file. It saves automatically and silently right next to your original file!
- **Share to Gist:** Instantly publish individual code blocks as **Secret Gists** to your GitHub account using VS Code's native authentication.

---

## ⚙️ Configuration & Settings

You can customize how specific blocks replace symbols and local images by editing your workspace or global `settings.json`. The extension provides the `customMdBlocks.rules` configuration object.

```json
"customMdBlocks.rules": {
    "info": {
        "symbols": {
            "[warn]": "#ff9900",
            "[error]": "#ff0000",
            "[success]": "#89d185"
        },
        "images": {
            "[logo]": "assets/logo.png"
        }
    }
}
```

*Note: Image paths must be relative to your workspace root to be dynamically resolved.*

### 💡 IntelliSense / Snippets

Once symbols or images are defined in your settings, typing `[` inside a Markdown file will trigger VS Code's IntelliSense to automatically suggest and auto-complete your configured tags!

---

## 🛠️ Adding Custom Script Languages

By default, the `▶ Run` button only appears for natively recognized executable languages. If you want to support additional languages (e.g., `Ruby`, `Go`, `PHP`), you can easily extend the source code:

1. Open the project and navigate to `src/executableLocator.ts`.
2. Locate the `LANGUAGE_EXECUTABLE_MAP` object.
3. Map your markdown language tag to its respective system binary:
   ```typescript
   export const LANGUAGE_EXECUTABLE_MAP: Record<string, string> = {
       // ... existing mappings ...
       'ruby': 'ruby',
       'php': 'php',
       'go': 'go run' // You can map to specific run commands
   };
   ```
4. Recompile the extension by running `npm run compile`.
5. Package the new version using `npx vsce package`.

The extension's Auto-Locator will now automatically handle finding the absolute path for your newly added language using system utilities.

---

## 🚀 Getting Started

1. Open any Markdown (`.md`) file.
2. Look at the top right of your editor title bar and click the **Custom MD Preview** icon (or run the command from the Command Palette).
3. Start writing code blocks, variables, and tree structures, and watch your markdown come to life!
