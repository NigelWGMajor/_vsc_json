export function generateHtmlContent(jsonData: any, fileName: string, theme?: string): string {
    const renderedContent = renderJson(jsonData, fileName);
    const lightModeClass = theme === 'light' ? ' class="light-mode"' : '';

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(fileName)}</title>
    <style>${getEmbeddedCss()}</style>
</head>
<body${lightModeClass}>
    <div class="container">
        <div class="header">
            <h2 class="title">${escapeHtml(fileName)}</h2>
            <div class="toolbar">
                <button class="toolbar-btn" onclick="toggleTheme()" title="Toggle Light/Dark Mode">
                    <span id="themeIcon">${getLightDarkIcon()}</span>
                </button>
                <button class="toolbar-btn" onclick="exportToHtml()" title="Export to HTML File">
                    ${getSaveHtmlIcon()}
                </button>
                <button class="toolbar-btn" id="browserBtn" onclick="viewInBrowser()" title="View in Browser">
                    ${getToBrowserIcon()}
                </button>
                <button class="toolbar-btn" onclick="toggleCase()" title="Toggle Case (Pascal/camel)">
                    ${getToggleCaseIcon()}
                </button>
            </div>
        </div>
        <div class="content">
            ${renderedContent}
        </div>
    </div>
    <script>${getEmbeddedJavaScript()}</script>
</body>
</html>`;
}

function renderJson(data: any, name: string = 'root', level: number = 0): string {
    const isRoot = level === 0;

    if (data === null) {
        return renderRow(name, '<span class="value-null">null</span>', level, isRoot);
    }

    if (data === undefined) {
        return renderRow(name, '<span class="value-undefined">undefined</span>', level, isRoot);
    }

    const type = typeof data;

    if (type === 'string' || type === 'number' || type === 'boolean') {
        return renderRow(name, renderPrimitive(data), level, isRoot);
    }

    if (Array.isArray(data)) {
        return renderArray(name, data, level, isRoot);
    }

    if (type === 'object') {
        return renderObject(name, data, level, isRoot);
    }

    return renderRow(name, String(data), level, isRoot);
}

function renderPrimitive(value: any): string {
    const type = typeof value;
    const strValue = String(value);
    const truncated = truncateValue(strValue);

    if (truncated !== strValue) {
        return `<span class="value value-${type}" title="${escapeHtml(strValue)}">${escapeHtml(truncated)}</span>`;
    }

    return `<span class="value value-${type}">${escapeHtml(strValue)}</span>`;
}

function renderObject(name: string, obj: any, level: number, isRoot: boolean): string {
    const keys = Object.keys(obj);

    if (keys.length === 0) {
        return renderRow(name, '<span class="empty">{}</span>', level, isRoot);
    }

    let html = '';

    if (!isRoot) {
        html += `<div class="object-container">`;
        html += `<div class="object-header row level-${level}" data-level="${level}">`;
        html += `<div class="indent">${renderIndentMarkers(level)}</div>`;
        html += `<div class="header-content">`;
        html += `<div class="name">${escapeHtml(name)}</div>`;
        html += `<div class="value"><span class="object-indicator">{object}</span></div>`;
        html += `</div>`;
        html += '</div>';
        html += `<div class="object-children">`;
    }

    keys.forEach(key => {
        html += renderJson(obj[key], key, isRoot ? 0 : level + 1);
    });

    if (!isRoot) {
        html += `</div></div>`;
    }

    return html;
}

function renderArray(name: string, arr: any[], level: number, isRoot: boolean): string {
    if (arr.length === 0) {
        return renderRow(name, '<span class="empty">[]</span>', level, isRoot);
    }

    const arrayId = `array_${Math.random().toString(36).substr(2, 9)}`;

    let html = `<div class="array-container" data-array-id="${arrayId}">`;

    // Array header
    html += `<div class="array-header row level-${level}" data-level="${level}">`;
    html += `<div class="indent">${renderIndentMarkers(level)}</div>`;
    html += `<div class="header-content">`;
    html += `<div class="name clickable" onclick="resetArray('${arrayId}')" title="Click to reset to first element">${escapeHtml(name)}</div>`;
    html += `<div class="value">`;
    html += `<span class="array-counter">`;
    html += `<span class="current" id="${arrayId}_current">1</span>`;
    html += `<span class="separator">/</span>`;
    html += `<span class="total">${arr.length}</span>`;
    html += `</span>`;
    html += `</div>`;
    html += `</div>`;
    html += '</div>';

    // Array elements (each element in a separate div that can be shown/hidden)
    arr.forEach((item, index) => {
        const display = index === 0 ? 'block' : 'none';
        html += `<div class="array-element" data-array-id="${arrayId}" data-index="${index}" style="display: ${display};">`;

        if (item === null || item === undefined) {
            html += renderRow(`[${index}]`, renderPrimitive(item), level + 1, false);
        } else if (typeof item === 'object') {
            if (Array.isArray(item)) {
                html += renderArray(`[${index}]`, item, level + 1, false);
            } else {
                // Render object properties directly without extra nesting
                const keys = Object.keys(item);
                keys.forEach(key => {
                    html += renderJson(item[key], key, level + 1);
                });
            }
        } else {
            html += renderRow(`[${index}]`, renderPrimitive(item), level + 1, false);
        }

        html += '</div>';
    });

    html += '</div>';

    return html;
}

function renderRow(name: string, value: string, level: number, isRoot: boolean): string {
    if (isRoot && typeof value === 'string' && !value.startsWith('<')) {
        value = `<span class="value">${value}</span>`;
    }

    let html = `<div class="row level-${level} clickable" data-level="${level}" onclick="nextInParentArray(this)">`;
    html += `<div class="indent">${renderIndentMarkers(level)}</div>`;
    html += `<div class="name">${escapeHtml(name)}</div>`;
    html += `<div class="value">${value}</div>`;
    html += '</div>';

    return html;
}

function renderIndentMarkers(level: number): string {
    if (level === 0) return '';

    let markers = '';
    for (let i = 0; i < level; i++) {
        markers += '<span class="indent-marker"></span>';
    }
    return markers;
}

function truncateValue(value: string, maxLength: number = 100): string {
    if (value.length <= maxLength) {
        return value;
    }
    return value.substring(0, maxLength) + '...';
}

function escapeHtml(text: string): string {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getLightDarkIcon(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="12" height="12" class="icon">
  <path d="M 3 16 A 12.500632743066973 12.500632743066973 0 0 0 28 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 3 16 A 12.502070584163558 12.502070584163558 0 0 1 28 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 14 5 L 14 27" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 11 6 L 11 26" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 9 7 L 9 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 7 9 L 7 23" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 5 12 L 5 20" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

function getSaveHtmlIcon(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="12" height="12" class="icon">
  <path d="M 15 2 L 15 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 15 22 L 22 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 16 23 L 8 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 26 15 L 29 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 29 15 L 29 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 29 28 L 3 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 3 28 L 3 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 3 15 L 6 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 9 15 L 15 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 23 15 L 21 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 17 2 L 17 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 15 2 L 17 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 8 16 L 9 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 16 23 L 24 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 23 15 L 24 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

function getToBrowserIcon(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="12" height="12" class="icon">
  <path d="M 4 9 L 27 9" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 4 21 L 27 21" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 3 15 A 12.500088185001491 12.500088185001491 0 0 0 28 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 3 15 A 12.502551020408163 12.502551020408163 0 0 1 28 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 28 15 L 28 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 15.25 3 Q 2.125 15 15.25 27" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 15 28 Q 28.625 15.0625 15.5 2.5625" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 15.5625 2.75 L 15 28" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 3 15 L 28 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

function getToggleCaseIcon(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="12" height="12" class="icon">
  <path d="M 18 12 Q 25.125 8.4375 24.75 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 25.6875 26 Q 24.125 21.3125 24.6875 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 23.75 17.6875 Q 17.4375 13.5 17.75 20.6875" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 24.8125 23.125 Q 18.1875 27.375 17.8125 21.125" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 23 13 L 24 13" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 16 26 L 10 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 10 5 L 5 26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 7 20 L 14 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 2 30 L 30 30" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 30 30 L 30 2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 30 2 L 2 2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 2 2 L 2 30" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

function getEmbeddedCss(): string {
    return `
:root {
    --bg-primary: #1e1e1e;
    --bg-secondary: #252525;
    --bg-row-even: #181818;
    --bg-row-odd: #282828;
    --bg-hover: #303030;
    --bg-header-structure: #000000;
    --text-primary: #d4d4d4;
    --text-secondary: #9d9d9d;
    --border-color: #3e3e3e;
    --separator-line: #808080;
    --indent-marker: #808080;
    --name-color: #9cdcfe;
    --value-string: #ce9178;
    --value-number: #b5cea8;
    --value-boolean: #569cd6;
    --value-null: #808080;
    --object-indicator: #4ec9b0;
    --array-counter: #dcdcaa;
    --header-bg: #2d2d30;
    --button-bg: #0e639c;
    --button-hover: #1177bb;
}

body.light-mode {
    --bg-primary: #ffffff;
    --bg-secondary: #f5f5f5;
    --bg-row-even: #f5f5f5;
    --bg-row-odd: #e8e8e8;
    --bg-hover: #d8d8d8;
    --bg-header-structure: #ffffff;
    --text-primary: #1e1e1e;
    --text-secondary: #6a6a6a;
    --border-color: #d4d4d4;
    --separator-line: #808080;
    --indent-marker: #808080;
    --name-color: #0070c1;
    --value-string: #a31515;
    --value-number: #098658;
    --value-boolean: #0000ff;
    --value-null: #808080;
    --object-indicator: #267f99;
    --array-counter: #795e26;
    --header-bg: #f0f0f0;
    --button-bg: #007acc;
    --button-hover: #005a9e;
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    line-height: 1.4;
    padding: 0;
    margin: 0;
}

.container {
    width: 100%;
    height: 100vh;
    display: flex;
    flex-direction: column;
}

.header {
    background: var(--header-bg);
    padding: 12px 20px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: sticky;
    top: 0;
    z-index: 1000;
}

.title {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
}

.toolbar {
    display: flex;
    gap: 6px;
    align-items: center;
}

.toolbar-btn {
    background: var(--button-bg);
    border: none;
    color: white;
    padding: 6px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    transition: background 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    min-height: 24px;
}

.toolbar-btn:hover {
    background: var(--button-hover);
}

.toolbar-btn:active {
    transform: scale(0.95);
}

.toolbar-btn svg.icon {
    display: block;
    width: 12px;
    height: 12px;
}

.toolbar-btn #themeIcon svg.icon {
    display: block;
}

.content {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
}

.row {
    display: flex;
    align-items: flex-start;
    padding: 2px 8px;
    transition: background 0.15s;
    min-height: 22px;
}

.row:nth-child(even) {
    background: var(--bg-row-even);
}

.row:nth-child(odd) {
    background: var(--bg-row-odd);
}

.row:hover {
    background: var(--bg-hover) !important;
}

.row.clickable {
    cursor: pointer;
}

.array-header .name.clickable:hover {
    text-decoration: underline;
}

.indent {
    display: flex;
    align-items: stretch;
    flex-shrink: 0;
    gap: 0;
}

.indent-marker {
    width: 20px;
    height: 1.4em;
    border-left: 1px dashed var(--indent-marker);
    flex-shrink: 0;
}

.name {
    color: var(--name-color);
    font-weight: 500;
    min-width: 150px;
    padding-right: 16px;
    flex-shrink: 0;
    word-break: break-word;
}

.value {
    color: var(--text-primary);
    font-family: 'Consolas', 'Courier New', monospace;
    flex: 1;
    word-break: break-word;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.value-string {
    color: var(--value-string);
}

.value-number {
    color: var(--value-number);
}

.value-boolean {
    color: var(--value-boolean);
}

.value-null,
.value-undefined {
    color: var(--value-null);
    font-style: italic;
}

.object-indicator {
    color: var(--object-indicator);
    font-style: italic;
}

.empty {
    color: var(--text-secondary);
    font-style: italic;
}

.array-counter {
    color: var(--array-counter);
    font-weight: 600;
}

.array-counter .separator {
    margin: 0 4px;
    color: var(--text-secondary);
}

.object-container {
    margin: 2px 0;
    padding: 0;
    position: relative;
}

.object-children {
    /* Children are indented with markers, no container borders needed */
}

.array-container {
    margin: 2px 0;
    padding: 0;
    position: relative;
}

.array-element {
    margin: 0;
    position: relative;
    /* Array elements are indented with markers, no borders needed */
}

.object-header,
.array-header {
    font-weight: 600;
    background: transparent !important;
}

.header-content {
    flex: 1;
    display: flex;
    background: var(--bg-header-structure);
    border: 1px solid var(--separator-line);
    padding: 1px 8px;
    margin-left: -8px;
}

.header-content .name {
    min-width: 150px;
    padding-right: 16px;
}

.header-content .value {
    flex: 1;
}

/* Prevent double borders */
.array-container + .array-container,
.object-container + .array-container,
.array-container + .object-container,
.object-container + .object-container {
    margin-top: -1px;
}

@media (max-width: 768px) {
    .name {
        min-width: 100px;
        padding-right: 8px;
    }

    .header {
        padding: 8px 12px;
    }

    .content {
        padding: 5px;
    }
}
`;
}

function getEmbeddedJavaScript(): string {
    return `
// Global state
let caseMode = 'original'; // 'original', 'pascal', 'camel'
let vscodeApi = null;

// Initialize VSCode API (can only be called once)
(function initVSCodeApi() {
    if (typeof acquireVsCodeApi !== 'undefined') {
        vscodeApi = acquireVsCodeApi();
    }
})();

// Theme management
function toggleTheme() {
    const body = document.body;

    if (body.classList.contains('light-mode')) {
        body.classList.remove('light-mode');
        localStorage.setItem('theme', 'dark');
    } else {
        body.classList.add('light-mode');
        localStorage.setItem('theme', 'light');
    }
}

// Initialize theme from localStorage (only if not already set in body)
(function initTheme() {
    // Check if theme was already set when page was generated (from export/browser)
    const hasLightModeClass = document.body.classList.contains('light-mode');

    // For standalone files (browser/export), ignore localStorage and trust the body class
    // This ensures each file opens with its intended theme
    if (!vscodeApi) {
        // We're in standalone mode - set localStorage based on body class only
        if (hasLightModeClass) {
            localStorage.setItem('theme', 'light');
        } else {
            localStorage.setItem('theme', 'dark');
        }
    } else {
        // We're in VSCode, check localStorage for saved preference
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'light') {
            document.body.classList.add('light-mode');
        }
    }
})();

// Hide browser button if not in VSCode
(function hideBrowserBtnIfNotInVSCode() {
    if (!vscodeApi) {
        const browserBtn = document.getElementById('browserBtn');
        if (browserBtn) {
            browserBtn.style.display = 'none';
        }
    }
})();

// Export to HTML file
function exportToHtml() {
    try {
        // Check if we're in VSCode webview
        if (vscodeApi) {
            // Get current theme state
            const isLightMode = document.body.classList.contains('light-mode');
            vscodeApi.postMessage({
                command: 'export',
                theme: isLightMode ? 'light' : 'dark'
            });
        } else {
            // Standalone HTML - save the current page with proper theme
            // Clone the document to modify it without affecting the current page
            const docClone = document.documentElement.cloneNode(true);
            const bodyClone = docClone.querySelector('body');

            // Ensure the body has the correct theme class based on current state
            const isLightMode = document.body.classList.contains('light-mode');
            if (isLightMode) {
                bodyClone.classList.add('light-mode');
            } else {
                bodyClone.classList.remove('light-mode');
            }

            const html = docClone.outerHTML;
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'json-export.html';
            a.click();
            URL.revokeObjectURL(url);
        }
    } catch (error) {
        console.error('Export failed:', error);
        alert('Export failed: ' + error.message);
    }
}

// View in browser
function viewInBrowser() {
    try {
        // Check if we're in VSCode webview
        if (vscodeApi) {
            // Get current theme state
            const isLightMode = document.body.classList.contains('light-mode');
            const theme = isLightMode ? 'light' : 'dark';
            console.log('Sending to browser with theme:', theme);
            vscodeApi.postMessage({
                command: 'viewInBrowser',
                theme: theme
            });
        } else {
            alert('Already viewing in browser!');
        }
    } catch (error) {
        console.error('View in browser failed:', error);
        alert('View in browser failed: ' + error.message);
    }
}

// Toggle case between Pascal, camel, and original
function toggleCase() {
    const nameElements = document.querySelectorAll('.name');

    // Store original values if not already stored
    nameElements.forEach(el => {
        if (!el.dataset.original) {
            el.dataset.original = el.textContent;
        }
    });

    // Cycle through modes
    if (caseMode === 'original') {
        caseMode = 'pascal';
    } else if (caseMode === 'pascal') {
        caseMode = 'camel';
    } else {
        caseMode = 'original';
    }

    // Apply the transformation
    nameElements.forEach(el => {
        const original = el.dataset.original;
        if (caseMode === 'pascal') {
            el.textContent = toPascalCase(original);
        } else if (caseMode === 'camel') {
            el.textContent = toCamelCase(original);
        } else {
            el.textContent = original;
        }
    });
}

function toPascalCase(str) {
    return str
        .replace(/[_-](.)/g, (_, c) => c.toUpperCase())
        .replace(/^(.)/, (_, c) => c.toUpperCase())
        .replace(/\\s+(.)/g, (_, c) => c.toUpperCase());
}

function toCamelCase(str) {
    const pascal = toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

// Array navigation
const arrayStates = new Map();

function getArrayState(arrayId) {
    if (!arrayStates.has(arrayId)) {
        const elements = document.querySelectorAll(\`[data-array-id="\${arrayId}"][data-index]\`);
        arrayStates.set(arrayId, {
            currentIndex: 0,
            totalCount: elements.length
        });
    }
    return arrayStates.get(arrayId);
}

function updateArrayDisplay(arrayId, newIndex) {
    const state = getArrayState(arrayId);
    const elements = document.querySelectorAll(\`[data-array-id="\${arrayId}"][data-index]\`);

    // Hide all elements
    elements.forEach(el => {
        el.style.display = 'none';
    });

    // Show the selected element
    if (elements[newIndex]) {
        elements[newIndex].style.display = 'block';
    }

    // Update counter
    state.currentIndex = newIndex;
    const counterEl = document.getElementById(\`\${arrayId}_current\`);
    if (counterEl) {
        counterEl.textContent = (newIndex + 1).toString();
    }
}

function resetArray(arrayId) {
    updateArrayDisplay(arrayId, 0);
}

function nextInArray(arrayId) {
    const state = getArrayState(arrayId);
    const nextIndex = (state.currentIndex + 1) % state.totalCount;
    updateArrayDisplay(arrayId, nextIndex);
}

function nextInParentArray(element) {
    // Find the parent array container
    let current = element;
    while (current && !current.classList.contains('array-element')) {
        current = current.parentElement;
    }

    if (current && current.dataset.arrayId) {
        nextInArray(current.dataset.arrayId);
    }
}

// Prevent event bubbling for array headers
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.array-header').forEach(header => {
        header.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    });
});
`;
}
