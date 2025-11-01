# Development Guide

## Project Structure

```
vsc-json-extension/
├── .vscode/
│   ├── launch.json       # Debug configuration
│   └── tasks.json        # Build tasks
├── .data/                # Test data and samples
│   ├── test-first.html   # Reference HTML output from C# version
│   ├── test-html.json    # Complex test data
│   └── upstream.json     # Simple test data
├── src/
│   ├── extension.ts      # Extension entry point
│   ├── jsonViewerProvider.ts  # Custom editor provider
│   └── htmlGenerator.ts  # HTML content generation
├── out/                  # Compiled JavaScript output
├── package.json          # Extension manifest
├── tsconfig.json         # TypeScript configuration
└── test.json            # Simple test file
```

## Build and Test Configuration

### Default Build Task
The `compile` task is set as the default build task in `tasks.json`. This ensures:
- TypeScript is compiled before debugging
- The `preLaunchTask` in `launch.json` completes properly
- Source maps are generated for debugging

### Watch Mode (Optional)
You can run `npm run watch` separately for continuous compilation during development:
- Terminal → Run Task → npm: watch

### Testing the Extension

1. **Press F5** to start debugging
2. The Extension Development Host will launch with the current workspace
3. You should see: "JSON Viewer extension activated!" popup
4. Open any `.json` file and test the features

## Key Files

### extension.ts
- Entry point for the extension
- Registers the custom editor provider for JSON files
- Registers the "Export JSON as HTML" command
- Handles extension activation/deactivation

### jsonViewerProvider.ts
- Implements `CustomReadonlyEditorProvider`
- Manages webview lifecycle
- Handles JSON parsing and error display
- Watches for file changes and updates the webview

### htmlGenerator.ts
- Generates the HTML content for the JSON viewer
- Contains all CSS styling and JavaScript logic
- Implements the hierarchical data presentation
- Handles array navigation and nested objects

## Extension Features

### Custom Editor
- **View Type**: `jsonViewer.editor`
- **File Pattern**: `*.json`
- **Priority**: `option` (appears in "Open With..." menu)
- Right-click any JSON file → "Open With..." → "JSON Viewer"

### Export Command
- **Command ID**: `jsonViewer.exportHtml`
- **Icon**: `$(export)` in editor toolbar
- Exports JSON as standalone HTML file
- Available in Command Palette and toolbar when JSON file is active

## Debugging Tips

### Console Output
The extension logs to the console:
- "JSON Viewer extension is now active" - on activation
- "Custom editor provider registered for jsonViewer.editor" - after registration

### Breakpoints
Set breakpoints in the TypeScript source files - source maps are enabled for proper debugging.

### Common Issues

**Extension doesn't activate:**
- Check the Output panel → "Extension Host"
- Look for activation errors or missing dependencies

**Custom editor doesn't appear:**
- Verify the custom editor is registered in `package.json` contributions
- Check that activation events are properly configured

**Changes not reflected:**
- Ensure the compile task runs (check Terminal output)
- Reload the Extension Development Host window (Ctrl+R)

## NPM Scripts

```json
"compile": "tsc -p ./"           // One-time compilation
"watch": "tsc -watch -p ./"      // Continuous compilation
"lint": "eslint src --ext ts"    // Lint TypeScript files
"package": "vsce package"        // Create .vsix package
```

## Next Steps

See [implementation-roadmap.md](implementation-roadmap.md) for planned features and improvements.
