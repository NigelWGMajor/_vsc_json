# Quick Reference

## Common Development Tasks

### Building
```bash
npm run compile        # One-time build
npm run watch         # Continuous build
```

### Testing
```bash
Press F5              # Start debugging
Ctrl+R (in dev host)  # Reload extension
Ctrl+Shift+P          # Command Palette
```

### Testing the Extension

1. **Open JSON with Custom Editor**
   - Right-click JSON file → "Open With..." → "JSON Viewer"

2. **Export to HTML**
   - Open JSON file
   - Click export icon in toolbar OR
   - Ctrl+Shift+P → "Export JSON as HTML"

3. **View Console Logs**
   - Help → Toggle Developer Tools → Console tab

### File Locations

| Purpose | Location |
|---------|----------|
| Source code | `src/*.ts` |
| Compiled output | `out/*.js` |
| Test data | `.data/*.json` |
| Build config | `tsconfig.json` |
| Extension manifest | `package.json` |
| Debug config | `.vscode/launch.json` |
| Tasks | `.vscode/tasks.json` |

## Extension Configuration

### package.json Key Sections

```json
{
  "main": "./out/extension.js",           // Entry point
  "activationEvents": [],                  // Auto-generated
  "contributes": {
    "customEditors": [...],                // JSON Viewer registration
    "commands": [...],                     // Export command
    "menus": {
      "editor/title": [...],               // Toolbar button
      "commandPalette": [...]              // Command palette
    }
  }
}
```

### Custom Editor Registration

```json
{
  "viewType": "jsonViewer.editor",
  "displayName": "JSON Viewer",
  "selector": [{"filenamePattern": "*.json"}],
  "priority": "option"
}
```

## Code Patterns

### Adding a New Command

1. **Register in package.json**:
```json
{
  "contributes": {
    "commands": [{
      "command": "jsonViewer.myCommand",
      "title": "My Command",
      "icon": "$(icon-name)"
    }]
  }
}
```

2. **Implement in extension.ts**:
```typescript
const myCommand = vscode.commands.registerCommand(
  'jsonViewer.myCommand',
  async () => {
    // Command logic here
  }
);
context.subscriptions.push(myCommand);
```

### Reading a JSON File

```typescript
const fileContent = await vscode.workspace.fs.readFile(uri);
const jsonText = Buffer.from(fileContent).toString('utf8');
const jsonData = JSON.parse(jsonText);
```

### Showing Messages

```typescript
vscode.window.showInformationMessage('Success!');
vscode.window.showWarningMessage('Warning!');
vscode.window.showErrorMessage('Error!');
```

### Updating Webview Content

```typescript
webviewPanel.webview.html = generateHtmlContent(data);
```

## VSCode API Quick Reference

### Common Imports
```typescript
import * as vscode from 'vscode';
```

### Useful Types
- `vscode.Uri` - File/resource identifiers
- `vscode.TextDocument` - Opened documents
- `vscode.WebviewPanel` - Webview container
- `vscode.ExtensionContext` - Extension lifecycle

### Useful Functions
- `vscode.workspace.fs.readFile(uri)` - Read file
- `vscode.workspace.fs.writeFile(uri, data)` - Write file
- `vscode.window.showSaveDialog()` - Save dialog
- `vscode.window.activeTextEditor` - Current editor
- `vscode.commands.registerCommand()` - Register command

## Debugging Tips

### Setting Breakpoints
1. Click left margin in source file (TypeScript)
2. Press F5 to start debugging
3. Breakpoint hits when code executes in dev host

### Console Logging
```typescript
console.log('Debug message:', data);
```
View in: Help → Toggle Developer Tools → Console

### Output Channel
```typescript
const output = vscode.window.createOutputChannel('JSON Viewer');
output.appendLine('Log message');
output.show();
```

### Common Issues

| Issue | Solution |
|-------|----------|
| Extension not activating | Check Output → Extension Host for errors |
| Changes not appearing | Ensure compile ran, reload dev host (Ctrl+R) |
| Breakpoints not hitting | Check source maps enabled, verify `outFiles` in launch.json |
| Command not found | Verify command registered in package.json and extension.ts |

## Git Workflow

### Initial Setup
```bash
git init
git add .
git commit -m "Initial commit"
```

### Regular Workflow
```bash
git status                    # Check changes
git add .                     # Stage all changes
git commit -m "message"       # Commit
git log --oneline             # View history
```

### Recommended .gitignore
```
node_modules/
out/
*.vsix
.vscode-test/
```

## Publishing

### Create Package
```bash
npm install -g @vscode/vsce
vsce package
# Creates vsc-json-extension-0.0.1.vsix
```

### Install Locally
```bash
code --install-extension vsc-json-extension-0.0.1.vsix
```

### Publish to Marketplace
```bash
vsce publish
# Requires publisher account and token
```

## Keyboard Shortcuts (in Extension Development Host)

| Shortcut | Action |
|----------|--------|
| F5 | Start debugging |
| Ctrl+R | Reload window |
| Ctrl+Shift+P | Command Palette |
| Ctrl+Shift+I | Developer Tools |
| Ctrl+W | Close editor |
| Ctrl+K Ctrl+W | Close all editors |

## Resources

- [VSCode Extension API](https://code.visualstudio.com/api)
- [Custom Editor Guide](https://code.visualstudio.com/api/extension-guides/custom-editors)
- [Extension Publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
