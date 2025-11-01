# Architecture Notes

## VSCode Extension Architecture

### Extension Lifecycle

```
Extension Loaded (package.json read)
          ↓
Activation Event Triggered (JSON file opened)
          ↓
activate() function called
          ↓
Register Providers & Commands
          ↓
Extension Ready
          ↓
deactivate() on unload
```

### Custom Editor Flow

```
User opens .json file with JSON Viewer
          ↓
openCustomDocument() - Creates document handle
          ↓
resolveCustomEditor() - Creates webview
          ↓
Read file content
          ↓
Parse JSON
          ↓
Generate HTML (htmlGenerator.ts)
          ↓
Set webview.html
          ↓
Watch for file changes → Update webview
```

## Component Responsibilities

### extension.ts
**Role**: Extension host and coordinator

**Responsibilities**:
- Register custom editor provider
- Register commands (export HTML)
- Manage extension context and subscriptions
- Coordinate between VSCode API and extension logic

**Key Functions**:
- `activate(context)` - Entry point
- `deactivate()` - Cleanup
- Command registration and handling

### jsonViewerProvider.ts
**Role**: Custom editor implementation

**Responsibilities**:
- Implement `CustomReadonlyEditorProvider` interface
- Manage webview lifecycle
- Handle file I/O
- Parse JSON and handle errors
- Watch for file changes
- Generate error displays

**Key Methods**:
- `openCustomDocument()` - Create document handle
- `resolveCustomEditor()` - Setup webview
- `updateWebview()` - Refresh on file change
- `generateErrorHtml()` - Error UI
- `generateStandaloneHtml()` - Delegates to htmlGenerator

**Design Notes**:
- Read-only viewer (no editing capabilities)
- Webview retains context when hidden
- Single editor per document
- Automatic refresh on file save

### htmlGenerator.ts
**Role**: HTML content generation

**Responsibilities**:
- Generate complete standalone HTML
- Embed CSS styling
- Embed JavaScript for interactivity
- Render JSON data hierarchy
- Handle light/dark themes
- Implement array navigation logic

**Structure**:
```
Generated HTML
├── <head>
│   ├── Meta tags (charset, viewport)
│   ├── <style> - Embedded CSS
│   └── <script> - Embedded JavaScript
└── <body>
    ├── Header (title, buttons)
    ├── JSON data presentation
    └── Event handlers
```

**Design Principles**:
- Self-contained (no external dependencies)
- Works offline
- Embeds all resources (CSS, JS, fonts if needed)
- Shareable as standalone file

## Data Flow

### Opening a JSON File

```
User Action
    ↓
jsonViewerProvider.openCustomDocument(uri)
    ↓
Returns CustomDocument {uri, dispose}
    ↓
jsonViewerProvider.resolveCustomEditor(document, panel)
    ↓
vscode.workspace.fs.readFile(uri)
    ↓
JSON.parse(content)
    ↓
htmlGenerator.generateHtmlContent(jsonData, fileName)
    ↓
webviewPanel.webview.html = html
    ↓
Display in webview
```

### Exporting HTML

```
User invokes command
    ↓
extension.ts: jsonViewer.exportHtml command
    ↓
Get active text editor
    ↓
Verify it's a JSON file
    ↓
Read document text
    ↓
JSON.parse(content)
    ↓
provider.generateStandaloneHtml(data, fileName)
    ↓
vscode.window.showSaveDialog()
    ↓
vscode.workspace.fs.writeFile(uri, html)
    ↓
Show success message
```

### File Change Detection

```
File saved in editor
    ↓
vscode.workspace.onDidChangeTextDocument event
    ↓
Check if changed document matches our document
    ↓
jsonViewerProvider.updateWebview(panel, uri)
    ↓
Re-read file content
    ↓
Re-parse JSON
    ↓
Re-generate HTML
    ↓
Update webviewPanel.webview.html
```

## Security Considerations

### Webview Security
- **Content Security Policy**: Should be added to restrict resource loading
- **Script Execution**: Only our embedded scripts should run
- **External Resources**: None allowed (self-contained design)

### File Handling
- **Path Traversal**: VSCode APIs handle this
- **File Size**: Consider limits for very large files
- **Malicious JSON**: Parser errors caught and displayed safely
- **HTML Escaping**: Implemented in `escapeHtml()` method

## Performance Considerations

### Current Implementation
- Loads entire file into memory
- Parses entire JSON structure
- Generates full HTML upfront
- No virtualization or lazy loading

### Future Optimizations (if needed)
- Lazy load nested structures
- Virtualize long arrays
- Paginate large datasets
- Cache parsed JSON
- Incremental rendering

### Memory Profile
- JSON data in memory (parsed)
- HTML string in memory (generated)
- Webview rendering (VSCode handles)

**Limits**:
- Small to medium JSON files: < 10MB
- Large files may need optimization
- Not designed for log files or huge datasets

## Extension Points

### Future Extensibility

**Configurable Settings**:
- Theme preferences
- Default view options
- Export format options
- Performance tuning

**Command Palette Commands**:
- Export as HTML (implemented)
- Export as CSV (future)
- Toggle theme (future)
- Search in JSON (future)

**Context Menus**:
- Editor title menu (export button)
- Explorer context menu (open with)
- Editor context menu (copy value, etc.)

## Testing Strategy

### Unit Testing
- HTML generation functions
- JSON parsing error handling
- Escape HTML special characters
- Array navigation logic

### Integration Testing
- Extension activation
- Custom editor registration
- Command execution
- File change detection

### Manual Testing
- Open various JSON files
- Test array navigation
- Test nested structures
- Test error cases
- Test export functionality
- Test in light/dark themes

## Dependencies

### Runtime
- `vscode` - VSCode Extension API
- Node.js built-ins (Buffer, etc.)

### Development
- `typescript` - Language
- `@types/vscode` - Type definitions
- `@types/node` - Node.js types
- `eslint` - Linting
- `@vscode/test-electron` - Testing
- `@vscode/vsce` - Packaging

**No external runtime dependencies** - keeps the extension lightweight and self-contained.
