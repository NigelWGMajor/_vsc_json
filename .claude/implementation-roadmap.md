# Implementation Roadmap

## Current Status

### ✅ Completed
- [x] Basic VSCode extension structure
- [x] Custom editor provider for JSON files
- [x] Export to standalone HTML command
- [x] Error handling for invalid JSON
- [x] File change watching
- [x] Build and debug configuration

### 🚧 In Progress
- [ ] HTML viewer implementation (basic structure exists)
- [ ] CSS styling for light/dark modes
- [ ] JavaScript for array navigation

## Phase 1: Core Viewer Improvements

### Presentation Layout
**Current Issue**: The existing implementation uses nested tables which can be wasteful of horizontal space.

**Goals**:
1. **Reduce Horizontal Scrolling**
   - Use consistent indentation instead of nested tables
   - Show array count without repeating the title
   - Treat nested objects similar to arrays

2. **Visual Hierarchy**
   - Add visual indicators (vertical pipes or left borders) to show nesting levels
   - Use indentation consistently for nested properties and arrays
   - Make the hierarchy immediately recognizable

3. **Data Display**
   - Name on the left, value on the right (two-column layout)
   - Simple types (string, number, boolean) shown directly
   - Arrays show current/total (e.g., "1/11")
   - Long values truncated with "..." and full text in tooltip on hover

### Array Navigation
**Required Behavior**:
- Clicking array name → reverts to first element
- Clicking any other title → steps to next element (with wrap)
- Display current index and total count
- Preserve navigation state during refresh

### Object Rendering
**Nested Objects**:
- Show object name
- Display properties in two columns beneath
- Indent to show hierarchy
- Consider treating similar to arrays (without current/count)

## Phase 2: Styling and UX

### Theme Support
- Light mode styling
- Dark mode styling (match VSCode theme)
- Automatic theme detection
- Manual theme toggle button

### Interactive Features
- [ ] Expand/collapse sections
- [ ] Search within JSON data
- [ ] Copy value to clipboard
- [ ] Syntax highlighting for values
- [ ] Tooltips for truncated content

### Top Bar
- Object/file name display
- Theme toggle button
- Additional command buttons (future)

## Phase 3: Advanced Features

### Data Handling
- [ ] Large file optimization
- [ ] Virtualization for huge arrays
- [ ] Lazy loading of nested structures
- [ ] Memory-efficient rendering

### Export Options
- [ ] Export filtered/selected data
- [ ] Export as CSV (for tabular data)
- [ ] Export as Markdown table
- [ ] Custom export templates

### Validation and Errors
- [ ] JSON schema validation
- [ ] Missing element handling
- [ ] Type annotations
- [ ] Error messages inline in viewer

## Phase 4: Polish and Performance

### Performance
- [ ] Benchmark with large files
- [ ] Optimize rendering performance
- [ ] Reduce memory footprint
- [ ] Caching strategies

### Accessibility
- [ ] Keyboard navigation
- [ ] Screen reader support
- [ ] High contrast theme support
- [ ] Focus management

### Testing
- [ ] Unit tests for core functions
- [ ] Integration tests
- [ ] Test with various JSON structures
- [ ] Performance regression tests

## Design Principles

### Guiding Rules
1. **Minimize Horizontal Scrolling** - Always prioritize vertical layout
2. **Clear Hierarchy** - Structure should be immediately obvious
3. **Self-Contained** - HTML exports should work without external dependencies
4. **Graceful Degradation** - Handle malformed/incomplete JSON elegantly
5. **Targeted Use Cases** - Optimize for clarity over volume

### Use Cases
- Object dumps and runtime values
- Configuration data
- SQL query results (JSON format)
- Hierarchical structured data
- Small to medium datasets (not logs)

### Non-Goals
- Editing JSON (read-only viewer)
- Massive data volumes (logs, etc.)
- Real-time data streaming
- JSON transformation/manipulation

## Reference Implementation

The C# version (sample in `.data/test-first.html`) provides a reference for:
- Table-based layout approach
- Array navigation behavior
- Visual presentation style
- Self-contained HTML with embedded CSS/JS

Study this implementation for inspiration, but improve upon:
- Horizontal space efficiency
- Visual hierarchy indicators
- Consistency in nested object handling
