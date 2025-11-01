export function generateHtmlContent(jsonData: any, fileName: string): string {
    const renderedContent = renderJson(jsonData, fileName);

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(fileName)}</title>
    <style>${getEmbeddedCss()}</style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2 class="title">${escapeHtml(fileName)}</h2>
            <button id="themToggle" class="theme-toggle" onclick="toggleTheme()">
                <span id="themeIcon">☀️</span>
            </button>
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
        return renderRow('null', 'null', level, isRoot);
    }

    if (data === undefined) {
        return renderRow('undefined', 'undefined', level, isRoot);
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
        html += `<div class="object-header row level-${level}" data-level="${level}">`;
        html += `<div class="indent" style="width: ${level * 20}px;">${renderIndentMarkers(level)}</div>`;
        html += `<div class="name">${escapeHtml(name)}</div>`;
        html += `<div class="value"><span class="object-indicator">{object}</span></div>`;
        html += '</div>';
    }

    keys.forEach(key => {
        html += renderJson(obj[key], key, level + 1);
    });

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
    html += `<div class="indent" style="width: ${level * 20}px;">${renderIndentMarkers(level)}</div>`;
    html += `<div class="name clickable" onclick="resetArray('${arrayId}')" title="Click to reset to first element">${escapeHtml(name)}</div>`;
    html += `<div class="value">`;
    html += `<span class="array-counter">`;
    html += `<span class="current" id="${arrayId}_current">1</span>`;
    html += `<span class="separator">/</span>`;
    html += `<span class="total">${arr.length}</span>`;
    html += `</span>`;
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
    html += `<div class="indent" style="width: ${level * 20}px;">${renderIndentMarkers(level)}</div>`;
    html += `<div class="name">${escapeHtml(name)}</div>`;
    html += `<div class="value">${value}</div>`;
    html += '</div>';

    return html;
}

function renderIndentMarkers(level: number): string {
    if (level === 0) return '';

    let markers = '';
    for (let i = 0; i < level; i++) {
        markers += '<span class="indent-marker">│</span>';
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

function getEmbeddedCss(): string {
    return `
:root {
    --bg-primary: #1e1e1e;
    --bg-secondary: #252525;
    --bg-hover: #2a2a2a;
    --text-primary: #d4d4d4;
    --text-secondary: #9d9d9d;
    --border-color: #3e3e3e;
    --indent-marker: #505050;
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
    --bg-hover: #e8e8e8;
    --text-primary: #1e1e1e;
    --text-secondary: #6a6a6a;
    --border-color: #d4d4d4;
    --indent-marker: #c0c0c0;
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
    line-height: 1.6;
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

.theme-toggle {
    background: var(--button-bg);
    border: none;
    color: white;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    transition: background 0.2s;
}

.theme-toggle:hover {
    background: var(--button-hover);
}

.content {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
}

.row {
    display: flex;
    align-items: flex-start;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border-color);
    transition: background 0.15s;
    min-height: 28px;
}

.row:hover {
    background: var(--bg-hover);
}

.row.clickable {
    cursor: pointer;
}

.array-header .name.clickable:hover {
    text-decoration: underline;
}

.indent {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: 2px;
}

.indent-marker {
    color: var(--indent-marker);
    font-family: monospace;
    width: 20px;
    text-align: center;
    font-size: 14px;
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

.array-container {
    margin: 0;
}

.array-element {
    margin: 0;
}

.object-header,
.array-header {
    font-weight: 600;
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
// Theme management
function toggleTheme() {
    const body = document.body;
    const icon = document.getElementById('themeIcon');

    if (body.classList.contains('light-mode')) {
        body.classList.remove('light-mode');
        icon.textContent = '☀️';
        localStorage.setItem('theme', 'dark');
    } else {
        body.classList.add('light-mode');
        icon.textContent = '🌙';
        localStorage.setItem('theme', 'light');
    }
}

// Initialize theme from localStorage
(function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const icon = document.getElementById('themeIcon');

    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        icon.textContent = '🌙';
    }
})();

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
