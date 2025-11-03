# C# Debug JSON Dump Feature - Export Documentation

## Overview

This document provides complete instructions and sample code to implement the C# Debug JSON Dump feature in another VS Code extension. This feature allows users to:

1. Select a C# variable or expression in the editor
2. Automatically generate JSON serialization code
3. Submit it to the debug REPL
4. Retrieve the JSON response from clipboard
5. Open and format it as a JSON document

## Prerequisites

- VS Code Extension API knowledge
- TypeScript for extension development
- Active C# debug session in VS Code
- System.Text.Json available in the debugged application

## Architecture

The feature uses the following VS Code APIs and workflow:

```
User Selection → JSON Serialization Code → Temp C# Document →
Debug REPL → Clipboard → JSON Document → Format
```

## Complete Implementation

### 1. Package.json Configuration

Add the command to your extension's `package.json`:

```json
{
  "contributes": {
    "commands": [
      {
        "command": "your-extension.toDebugDump",
        "title": "to-DebugDump"
      }
    ]
  }
}
```

**Optional**: Add a keybinding for quick access:

```json
{
  "contributes": {
    "keybindings": [
      {
        "command": "your-extension.toDebugDump",
        "key": "ctrl+shift+j",
        "mac": "cmd+shift+j",
        "when": "editorTextFocus && editorLangId == csharp && inDebugMode"
      }
    ]
  }
}
```

### 2. Extension.ts Implementation

Add this command registration in your `activate` function:

```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

    const toDebugDump = vscode.commands.registerCommand('your-extension.toDebugDump', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        // Check if the active document is C#
        if (editor.document.languageId !== 'csharp') {
            vscode.window.showErrorMessage('This command only works with C# files');
            return;
        }

        // Check if there's an active debug session
        const debugSession = vscode.debug.activeDebugSession;
        if (!debugSession) {
            vscode.window.showErrorMessage('No active debug session. Please start debugging first.');
            return;
        }

        const selection = editor.selection;
        const selectedText = editor.document.getText(selection).trim();

        if (!selectedText) {
            vscode.window.showErrorMessage('Please select a variable or expression to dump');
            return;
        }

        // Build the serialization expression
        const expression = `System.Text.Json.JsonSerializer.Serialize(${selectedText})`;

        try {
            // Create temp document with expression
            const tempDoc = await vscode.workspace.openTextDocument({
                content: expression,
                language: 'csharp'
            });

            const tempEditor = await vscode.window.showTextDocument(tempDoc, {
                preview: false,
                preserveFocus: false
            });

            // Select all text
            const fullRange = new vscode.Range(
                tempDoc.lineAt(0).range.start,
                tempDoc.lineAt(tempDoc.lineCount - 1).range.end
            );
            tempEditor.selection = new vscode.Selection(fullRange.start, fullRange.end);

            // Send to REPL
            await vscode.commands.executeCommand('editor.debug.action.selectionToRepl');

            // Wait for output to appear in clipboard
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Close temp document
            await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');

            // Create JSON document
            const jsonDoc = await vscode.workspace.openTextDocument({
                content: '',
                language: 'json'
            });

            const jsonEditor = await vscode.window.showTextDocument(jsonDoc, {
                viewColumn: vscode.ViewColumn.Beside,
                preserveFocus: false
            });

            // Wait a moment for focus
            await new Promise(resolve => setTimeout(resolve, 200));

            // Get clipboard content
            const clipboardText = await vscode.env.clipboard.readText();

            // Insert clipboard content
            const success = await jsonEditor.edit(editBuilder => {
                editBuilder.insert(new vscode.Position(0, 0), clipboardText);
            });

            if (success) {
                // Format the document
                await vscode.commands.executeCommand('editor.action.formatDocument');
                vscode.window.showInformationMessage('JSON dumped and formatted!');
            }

        } catch (error: any) {
            const errorMsg = error?.message || error?.toString() || 'Unknown error';
            vscode.window.showErrorMessage(`Failed: ${errorMsg}`);
        }
    });

    // Register the command
    context.subscriptions.push(toDebugDump);
}
```

## Component Breakdown

### Step 1: Validation

```typescript
// Validate active editor
if (!editor) {
    vscode.window.showErrorMessage('No active editor found');
    return;
}

// Validate C# file
if (editor.document.languageId !== 'csharp') {
    vscode.window.showErrorMessage('This command only works with C# files');
    return;
}

// Validate debug session
const debugSession = vscode.debug.activeDebugSession;
if (!debugSession) {
    vscode.window.showErrorMessage('No active debug session. Please start debugging first.');
    return;
}
```

### Step 2: Get Selection

```typescript
const selection = editor.selection;
const selectedText = editor.document.getText(selection).trim();

if (!selectedText) {
    vscode.window.showErrorMessage('Please select a variable or expression to dump');
    return;
}
```

### Step 3: Generate Serialization Code

```typescript
// Wraps the selected text with JSON serializer
const expression = `System.Text.Json.JsonSerializer.Serialize(${selectedText})`;
```

### Step 4: Create and Submit Temporary C# Document

```typescript
// Create temporary document
const tempDoc = await vscode.workspace.openTextDocument({
    content: expression,
    language: 'csharp'
});

// Show the document
const tempEditor = await vscode.window.showTextDocument(tempDoc, {
    preview: false,
    preserveFocus: false
});

// Select all content
const fullRange = new vscode.Range(
    tempDoc.lineAt(0).range.start,
    tempDoc.lineAt(tempDoc.lineCount - 1).range.end
);
tempEditor.selection = new vscode.Selection(fullRange.start, fullRange.end);

// Submit to REPL
await vscode.commands.executeCommand('editor.debug.action.selectionToRepl');
```

### Step 5: Wait and Clean Up

```typescript
// Wait for REPL to process and copy to clipboard
await new Promise(resolve => setTimeout(resolve, 1000));

// Close the temporary document
await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
```

### Step 6: Create JSON Document and Format

```typescript
// Create JSON document
const jsonDoc = await vscode.workspace.openTextDocument({
    content: '',
    language: 'json'
});

// Show beside current editor
const jsonEditor = await vscode.window.showTextDocument(jsonDoc, {
    viewColumn: vscode.ViewColumn.Beside,
    preserveFocus: false
});

// Brief wait for focus
await new Promise(resolve => setTimeout(resolve, 200));

// Read from clipboard
const clipboardText = await vscode.env.clipboard.readText();

// Insert content
const success = await jsonEditor.edit(editBuilder => {
    editBuilder.insert(new vscode.Position(0, 0), clipboardText);
});

if (success) {
    // Auto-format
    await vscode.commands.executeCommand('editor.action.formatDocument');
    vscode.window.showInformationMessage('JSON dumped and formatted!');
}
```

## Key VS Code APIs Used

| API | Purpose |
|-----|---------|
| `vscode.window.activeTextEditor` | Get current editor |
| `vscode.debug.activeDebugSession` | Check debug session |
| `editor.document.languageId` | Validate C# file |
| `editor.selection` | Get selected text |
| `vscode.workspace.openTextDocument()` | Create temp documents |
| `vscode.window.showTextDocument()` | Display documents |
| `vscode.commands.executeCommand()` | Execute VS Code commands |
| `vscode.env.clipboard.readText()` | Read clipboard |
| `editor.edit()` | Insert content |
| `vscode.ViewColumn.Beside` | Show document side-by-side |

## Important Commands

| Command | Purpose |
|---------|---------|
| `editor.debug.action.selectionToRepl` | Submit selection to debug REPL |
| `workbench.action.revertAndCloseActiveEditor` | Close without save prompt |
| `editor.action.formatDocument` | Format JSON document |

## Usage Instructions

### For Extension Users:

1. **Start a debug session** for your C# application
2. **Set a breakpoint** and pause execution
3. **Select a variable or expression** in your C# code (e.g., `myObject`, `customer.Orders`)
4. **Run the command**:
   - Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
   - Type "to-DebugDump"
   - Press Enter
5. **View the result**: A formatted JSON document opens beside your code

### Example Workflow:

```csharp
public class Customer
{
    public int Id { get; set; }
    public string Name { get; set; }
    public List<Order> Orders { get; set; }
}

// In debugger, select "customer" and run to-DebugDump
var customer = new Customer
{
    Id = 1,
    Name = "John",
    Orders = new List<Order>()
};
```

Result opens as formatted JSON:
```json
{
  "Id": 1,
  "Name": "John",
  "Orders": []
}
```

## Customization Options

### 1. Change Serialization Library

Replace `System.Text.Json.JsonSerializer.Serialize` with:
- **Newtonsoft.Json**: `Newtonsoft.Json.JsonConvert.SerializeObject`
- **Custom formatter**: Your own serialization logic

### 2. Add Serialization Options

```typescript
const expression = `System.Text.Json.JsonSerializer.Serialize(${selectedText}, new System.Text.Json.JsonSerializerOptions { WriteIndented = true, ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.Preserve })`;
```

### 3. Adjust Timing

```typescript
// Increase wait time for slower machines
await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds
```

### 4. Change Document Position

```typescript
// Open in new column instead of beside
const jsonEditor = await vscode.window.showTextDocument(jsonDoc, {
    viewColumn: vscode.ViewColumn.Two, // or Three, Active, etc.
    preserveFocus: false
});
```

### 5. Add Context Menu

```json
{
  "contributes": {
    "menus": {
      "editor/context": [
        {
          "command": "your-extension.toDebugDump",
          "when": "editorLangId == csharp && inDebugMode && editorHasSelection",
          "group": "debug"
        }
      ]
    }
  }
}
```

## Limitations and Considerations

1. **Requires Active Debug Session**: Won't work outside debugging
2. **Clipboard Dependency**: Uses clipboard as transport mechanism
3. **Timing Sensitive**: May need adjustment for different machines/workloads
4. **Circular References**: May fail with circular object graphs (use ReferenceHandler)
5. **Large Objects**: Very large objects may cause performance issues
6. **System.Text.Json Availability**: Target application must have .NET Core 3.0+ or include the NuGet package

## Troubleshooting

### Issue: "No active debug session"
**Solution**: Start debugging your C# application first (F5)

### Issue: Empty JSON document
**Solution**: Increase wait time after REPL submission:
```typescript
await new Promise(resolve => setTimeout(resolve, 2000));
```

### Issue: Serialization error in REPL
**Solution**: Check if System.Text.Json is available. Alternative:
```typescript
const expression = `Newtonsoft.Json.JsonConvert.SerializeObject(${selectedText})`;
```

### Issue: Clipboard not capturing output
**Solution**: Ensure `editor.debug.action.selectionToRepl` is copying to clipboard in your VS Code settings

## Testing Checklist

- [ ] Test with simple primitive variables (int, string)
- [ ] Test with complex objects with nested properties
- [ ] Test with collections (List, Array, Dictionary)
- [ ] Test with null values
- [ ] Test error handling (no selection, no debug session)
- [ ] Test on different operating systems (Windows, macOS, Linux)
- [ ] Test with different C# target frameworks (.NET Core, .NET Framework)

## Dependencies

**Required VS Code Engine**:
```json
{
  "engines": {
    "vscode": "^1.60.0"
  }
}
```

**TypeScript Types**:
```json
{
  "devDependencies": {
    "@types/vscode": "^1.60.0",
    "@types/node": "^16.x",
    "typescript": "^4.4.3"
  }
}
```

## License Considerations

This implementation uses only VS Code Extension API and standard TypeScript. No special licensing required beyond your extension's own license.

## Source Reference

Original implementation: `caser` extension by Nigel Major
- File: [src/extension.ts:1823-1914](src/extension.ts#L1823-L1914)
- Command: `caser.toDebugDump`
- Repository: https://github.com/NigelWGMajor/vscode-format-tools

## Additional Enhancements (Optional)

### 1. Progress Indicator

```typescript
await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: "Dumping to JSON...",
    cancellable: false
}, async (progress) => {
    // Your implementation here
});
```

### 2. Configuration Settings

```json
{
  "contributes": {
    "configuration": {
      "title": "Debug JSON Dump",
      "properties": {
        "debugJsonDump.replTimeout": {
          "type": "number",
          "default": 1000,
          "description": "Milliseconds to wait for REPL response"
        },
        "debugJsonDump.serializerOptions": {
          "type": "string",
          "default": "",
          "description": "Additional JsonSerializerOptions to pass"
        }
      }
    }
  }
}
```

### 3. Save to File Option

```typescript
// Add save dialog
const uri = await vscode.window.showSaveDialog({
    filters: { 'JSON': ['json'] }
});
if (uri) {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(clipboardText, 'utf8'));
}
```

## Summary

This feature provides a powerful debugging tool for C# developers, allowing quick inspection of runtime object state in a readable JSON format. The implementation is straightforward, requires no external dependencies, and integrates seamlessly with VS Code's debugging infrastructure.

**Key Benefits**:
- No manual JSON serialization code needed
- Automatic formatting
- Side-by-side viewing with source code
- Fast workflow for debugging complex objects
- Works with any C# project that includes System.Text.Json

**Implementation Time**: ~1 hour including testing

**Lines of Code**: ~90 lines total (command + registration)
