export function generateHtmlContent(jsonData: any, fileName: string, theme?: string, wideView?: boolean): string {
    const renderedContent = renderJson(jsonData, fileName);
    const classes = [];
    if (theme === 'light') classes.push('light-mode');
    if (wideView) classes.push('wide-view', 'wide-view-active');
    const bodyClass = classes.length > 0 ? ` class="${classes.join(' ')}"` : '';

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(fileName)}</title>
    <style>${getEmbeddedCss()}</style>
</head>
<body${bodyClass} data-wide-view="${wideView ? 'true' : 'false'}">
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
                <button class="toolbar-btn" id="hideUnderscoreBtn" onclick="toggleHideUnderscore()" title="Hide rows starting with underscore">
                    ${getHideUnderscoreIcon()}
                </button>
                <button class="toolbar-btn" id="wideViewBtn" onclick="toggleWideView()" title="Toggle Wide View (Tabular Data)" style="display:none;">
                    ${getWideIcon()}
                </button>
                <button class="toolbar-btn" id="exportJsonBtn" onclick="exportRedactedJson()" title="Export JSON">
                    ${getSaveJsonIcon()}
                </button>
            </div>
        </div>
        <div class="content">
            ${renderedContent}
        </div>
    </div>
    <div class="context-menu" id="contextMenu">
        <div class="context-menu-item" onclick="copyValue()">Copy Value</div>
        <div class="context-menu-item" onclick="copyAllValues()">Copy All Values</div>
        <div class="context-menu-item danger" onclick="redactSelectedRow()">Redact This Row</div>
    </div>
    <script>${getEmbeddedJavaScript()}</script>
</body>
</html>`;
}

function renderJson(data: any, name: string = 'root', level: number = 0, path: string = ''): string {
    const isRoot = level === 0;
    // Skip the root name (filename) in the path, start from children
    const currentPath = isRoot ? '' : (path ? `${path}.${name}` : name);
    console.log(`renderJson: name="${name}", path="${path}", currentPath="${currentPath}", isRoot=${isRoot}`);

    if (data === null) {
        return renderRow(name, '<span class="value-null">null</span>', level, isRoot, currentPath);
    }

    if (data === undefined) {
        return renderRow(name, '<span class="value-undefined">undefined</span>', level, isRoot, currentPath);
    }

    const type = typeof data;

    if (type === 'string' || type === 'number' || type === 'boolean') {
        return renderRow(name, renderPrimitive(data), level, isRoot, currentPath);
    }

    if (Array.isArray(data)) {
        return renderArray(name, data, level, isRoot, currentPath);
    }

    if (type === 'object') {
        return renderObject(name, data, level, isRoot, currentPath);
    }

    return renderRow(name, String(data), level, isRoot, currentPath);
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

function renderObject(name: string, obj: any, level: number, isRoot: boolean, currentPath: string = ''): string {
    const keys = Object.keys(obj);

    if (keys.length === 0) {
        return renderRow(name, '<span class="empty">{}</span>', level, isRoot, currentPath);
    }

    let html = '';

    if (!isRoot) {
        const startsWithUnderscore = name.startsWith('_');
        const underscoreAttr = startsWithUnderscore ? ' data-starts-with-underscore="true"' : '';

        html += `<div class="object-container" data-path="${escapeHtml(currentPath)}"${underscoreAttr}>`;
        html += `<div class="object-header row level-${level}" data-level="${level}" data-path="${escapeHtml(currentPath)}"${underscoreAttr}>`;
        html += `<div class="indent">${renderIndentMarkers(level)}</div>`;
        html += `<div class="header-content">`;
        html += `<div class="name">${escapeHtml(name)}</div>`;
        html += `<div class="value"><span class="object-indicator">{object}</span></div>`;
        html += `</div>`;
        html += '</div>';
        html += `<div class="object-children">`;
    }

    keys.forEach(key => {
        // Pass currentPath as the base path for children
        html += renderJson(obj[key], key, level + 1, currentPath);
    });

    if (!isRoot) {
        html += `</div></div>`;
    }

    return html;
}

function renderArray(name: string, arr: any[], level: number, isRoot: boolean, currentPath: string = ''): string {
    if (arr.length === 0) {
        return renderRow(name, '<span class="empty">[]</span>', level, isRoot, currentPath);
    }

    const arrayId = `array_${Math.random().toString(36).substring(2, 11)}`;
    const startsWithUnderscore = name.startsWith('_');
    const underscoreAttr = startsWithUnderscore ? ' data-starts-with-underscore="true"' : '';

    let html = `<div class="array-container" data-array-id="${arrayId}" data-path="${escapeHtml(currentPath)}"${underscoreAttr}>`;

    // Array header
    html += `<div class="array-header row level-${level}" data-level="${level}" data-path="${escapeHtml(currentPath)}"${underscoreAttr}>`;
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
            html += renderRow(`[${index}]`, renderPrimitive(item), level + 1, false, `${currentPath}[${index}]`);
        } else if (typeof item === 'object') {
            if (Array.isArray(item)) {
                html += renderArray(`[${index}]`, item, level + 1, false, currentPath);
            } else {
                // Render object properties directly without extra nesting
                const keys = Object.keys(item);
                keys.forEach(key => {
                    html += renderJson(item[key], key, level + 1, `${currentPath}[${index}]`);
                });
            }
        } else {
            html += renderRow(`[${index}]`, renderPrimitive(item), level + 1, false, `${currentPath}[${index}]`);
        }

        html += '</div>';
    });

    html += '</div>';

    return html;
}

function renderRow(name: string, value: string, level: number, isRoot: boolean, path: string = ''): string {
    if (isRoot && typeof value === 'string' && !value.startsWith('<')) {
        value = `<span class="value">${value}</span>`;
    }

    const startsWithUnderscore = name.startsWith('_');
    const underscoreAttr = startsWithUnderscore ? ' data-starts-with-underscore="true"' : '';

    let html = `<div class="row level-${level} clickable" data-level="${level}" data-path="${escapeHtml(path)}"${underscoreAttr} onclick="nextInParentArray(this)">`;
    html += `<div class="indent">${renderIndentMarkers(level)}</div>`;
    html += `<div class="name">${escapeHtml(name)}</div>`;
    html += `<div class="value">${value}</div>`;
    html += '</div>';

    return html;
}

function renderIndentMarkers(level: number): string {
    if (level <= 1) return '';

    let markers = '';
    for (let i = 1; i < level; i++) {
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

function getWideIcon(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="12" height="12" class="icon">
  <path d="M 6 7 L 1 17" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 1 17 L 6 27" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 25 7 L 30 17" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 30 17 L 25 27" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 25 27 L 25 22" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 25 22 L 6 22" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 6 22 L 6 27" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 6 7 L 6 11" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 6 11 L 25 11" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 25 11 L 25 7" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

function getSaveJsonIcon(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="12" height="12" class="icon">
  <path d="M 2 15 L 4 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 4 13 L 4 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 4 6 L 6 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 2 15 L 4 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 4 17 L 4 25" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 4 25 L 6 27" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 27 3 L 29 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 29 6 L 29 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 29 13 L 31 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 31 15 L 29 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 29 17 L 29 25" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 29 25 L 27 27" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 18 5 Q 16.5 5.0625 17 6" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 17 5 L 18 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 18 10 Q 20.8125 28.8125 11 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 19 9 Q 19.5 31.8125 11 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 18 10 L 19 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

function getHideUnderscoreIcon(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="12" height="12" class="icon">
  <path d="M 4 26 L 28 26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 8 8 L 8 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 16 8 L 16 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 24 8 L 24 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
  <circle cx="16" cy="8" r="1.5" fill="currentColor"/>
  <circle cx="24" cy="8" r="1.5" fill="currentColor"/>
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

/* Context Menu */
.context-menu {
    position: fixed;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 4px 0;
    min-width: 150px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    display: none;
}

.context-menu.visible {
    display: block;
}

.context-menu-item {
    padding: 8px 16px;
    cursor: pointer;
    color: var(--text-primary);
    transition: background 0.15s;
}

.context-menu-item:hover {
    background: var(--bg-hover);
}

.context-menu-item.danger {
    color: #f48771;
}

/* Redacted rows */
.row.redacted,
.array-container.redacted,
.object-container.redacted {
    display: none !important;
}

/* Hide underscore rows when enabled */
body.hide-underscore .row[data-starts-with-underscore="true"],
body.hide-underscore .object-container[data-starts-with-underscore="true"],
body.hide-underscore .array-container[data-starts-with-underscore="true"] {
    display: none !important;
}

/* Highlight the button when active */
body.hide-underscore #hideUnderscoreBtn {
    background: var(--bg-hover);
    border: 1px solid var(--name-color);
}

/* Wide view for tabular data */
.wide-view .content {
    overflow-x: auto;
    max-width: none;
    padding: 0;
}

.wide-view .container {
    max-width: none;
    width: 100%;
    padding: 10px 10px 0 10px;
}

.wide-view .header {
    margin-bottom: 10px;
}

.wide-view table {
    width: 100%;
    border-collapse: collapse;
    table-layout: auto;
    font-size: 13px;
}

.wide-view th,
.wide-view td {
    border: 1px solid var(--border-color);
    padding: 0 6px;
    text-align: left;
    white-space: nowrap;
}

.wide-view th {
    background: var(--bg-header-structure);
    color: var(--name-color);
    font-weight: bold;
    position: sticky;
    top: 0;
    z-index: 10;
    padding: 0 6px;
}

.wide-view thead th:first-child {
    position: sticky;
    left: 0;
    z-index: 11;
    background: var(--bg-header-structure);
}

.wide-view tbody th {
    position: sticky;
    left: 0;
    z-index: 9;
    font-weight: normal;
    background: var(--bg-secondary);
    color: var(--name-color);
}

.wide-view tbody tr:nth-child(even) th {
    background: var(--bg-row-even);
}

.wide-view tbody tr:nth-child(odd) th {
    background: var(--bg-row-odd);
}

.wide-view tbody tr:nth-child(even) {
    background: var(--bg-row-even);
}

.wide-view tbody tr:nth-child(odd) {
    background: var(--bg-row-odd);
}

.wide-view tbody tr:hover {
    background: var(--bg-hover);
}

.wide-view tbody tr:hover th {
    background: var(--bg-hover);
}

.wide-view-active #wideViewBtn {
    background: var(--bg-hover);
    border: 1px solid var(--name-color);
}
`;
}

function getEmbeddedJavaScript(): string {
    return `
console.log('=== JSON Viewer JavaScript Loaded ===');

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

// Hide underscore rows management
function toggleHideUnderscore() {
    const body = document.body;

    if (body.classList.contains('hide-underscore')) {
        body.classList.remove('hide-underscore');
        localStorage.setItem('hideUnderscore', 'false');
    } else {
        body.classList.add('hide-underscore');
        localStorage.setItem('hideUnderscore', 'true');
    }
}

// Initialize hide-underscore state from localStorage (default to hiding)
(function initHideUnderscore() {
    const savedHideUnderscore = localStorage.getItem('hideUnderscore');

    // Default to hiding underscore rows (true)
    if (savedHideUnderscore === null || savedHideUnderscore === 'true') {
        document.body.classList.add('hide-underscore');
        localStorage.setItem('hideUnderscore', 'true');
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

// Detect tabular data and show wide view button (only in VSCode)
(function detectTabularData() {
    // Only show wide view in VSCode, not in browser
    if (!vscodeApi) return;

    const content = document.querySelector('.content');
    if (!content) return;

    console.log('Detecting tabular data...');

    // Look for array containers - could be at root level or nested
    const arrayContainers = content.querySelectorAll('.array-container');
    console.log('Found array containers:', arrayContainers.length);

    if (arrayContainers.length > 0) {
        // Check the first (typically root) array container
        const firstArray = arrayContainers[0];

        // Look for array-element divs
        const arrayElements = firstArray.querySelectorAll('.array-element');
        console.log('Found array elements:', arrayElements.length);

        if (arrayElements.length > 1) {
            // Check if array elements contain rows (tabular data where objects are rendered as rows)
            // Get keys from first array element
            const firstElementRows = arrayElements[0].querySelectorAll(':scope > .row');
            console.log('First element has rows:', firstElementRows.length);

            if (firstElementRows.length > 0) {
                const firstObjKeys = Array.from(firstElementRows)
                    .map(row => {
                        const nameEl = row.querySelector('.name');
                        return nameEl ? nameEl.textContent.trim() : '';
                    })
                    .filter(k => k !== '');

                console.log('First object keys:', firstObjKeys);

                if (firstObjKeys.length > 0) {
                    let isTabular = true;

                    // Check next few array elements for consistent keys
                    for (let i = 1; i < Math.min(arrayElements.length, 10); i++) {
                        const elementRows = arrayElements[i].querySelectorAll(':scope > .row');
                        const objKeys = Array.from(elementRows)
                            .map(row => {
                                const nameEl = row.querySelector('.name');
                                return nameEl ? nameEl.textContent.trim() : '';
                            })
                            .filter(k => k !== '');

                        if (objKeys.length !== firstObjKeys.length ||
                            !objKeys.every((key, idx) => key === firstObjKeys[idx])) {
                            isTabular = false;
                            console.log('Not tabular - keys mismatch at index', i);
                            break;
                        }
                    }

                    // Show wide view button if data is tabular
                    if (isTabular) {
                        console.log('Data is tabular! Showing wide view button');
                        const wideViewBtn = document.getElementById('wideViewBtn');
                        if (wideViewBtn) {
                            wideViewBtn.style.display = 'block';
                        }
                    } else {
                        console.log('Data is not tabular');
                    }
                }
            }
        }
    }
})();

// Auto-render wide view if body has wide-view class on load
(function autoRenderWideView() {
    const body = document.body;
    if (body.classList.contains('wide-view') && body.getAttribute('data-wide-view') === 'true') {
        console.log('Auto-rendering wide view from body class');
        // Wait for DOM to be ready
        setTimeout(() => {
            renderTableView();
        }, 100);
    }
})();

// Toggle wide view for tabular data
function toggleWideView() {
    const body = document.body;
    const content = document.querySelector('.content');

    if (!content) return;

    if (body.classList.contains('wide-view')) {
        // Exit wide view - restore original rendering
        body.classList.remove('wide-view');
        body.classList.remove('wide-view-active');
        renderOriginalView();
    } else {
        // Enter wide view - render as table
        body.classList.add('wide-view');
        body.classList.add('wide-view-active');
        renderTableView();
    }
}

function renderTableView() {
    const content = document.querySelector('.content');
    if (!content) return;

    // Find the first array container
    const arrayContainer = content.querySelector('.array-container');
    if (!arrayContainer) return;

    // Look for array-element divs
    const arrayElements = arrayContainer.querySelectorAll('.array-element');
    if (arrayElements.length === 0) return;

    // Extract field names from the first array element's rows
    const firstElementRows = arrayElements[0].querySelectorAll(':scope > .row');
    const fieldNames = Array.from(firstElementRows)
        .map(row => {
            const nameEl = row.querySelector('.name');
            return nameEl ? nameEl.textContent.trim() : '';
        })
        .filter(h => h !== '');

    if (fieldNames.length === 0) return;

    // Build transposed table HTML
    // Header row: Field Name, Item 1, Item 2, Item 3, ...
    let tableHtml = '<table><thead><tr>';
    tableHtml += '<th>Field</th>'; // First column is field names

    // Add column header for each item
    for (let i = 0; i < arrayElements.length; i++) {
        // Check if this item has redacted rows
        const hasRedacted = arrayElements[i].querySelector('.row.redacted');
        if (!hasRedacted) {
            tableHtml += '<th>Item ' + (i + 1) + '</th>';
        }
    }
    tableHtml += '</tr></thead><tbody>';

    // Each row represents a field
    fieldNames.forEach((fieldName, fieldIndex) => {
        tableHtml += '<tr>';
        tableHtml += '<th>' + escapeHtml(fieldName) + '</th>'; // Field name in first column

        // Add value for each item (column)
        arrayElements.forEach(arrayEl => {
            // Skip if any rows in this element are redacted
            const hasRedacted = arrayEl.querySelector('.row.redacted');
            if (hasRedacted) return;

            const rows = arrayEl.querySelectorAll(':scope > .row');
            if (rows[fieldIndex]) {
                const valueEl = rows[fieldIndex].querySelector('.value');
                if (valueEl) {
                    tableHtml += '<td>' + valueEl.innerHTML + '</td>';
                } else {
                    tableHtml += '<td></td>';
                }
            } else {
                tableHtml += '<td></td>';
            }
        });

        tableHtml += '</tr>';
    });

    tableHtml += '</tbody></table>';

    // Store original content and replace with table
    if (!content.dataset.originalContent) {
        content.dataset.originalContent = content.innerHTML;
    }
    content.innerHTML = tableHtml;
}

function renderOriginalView() {
    const content = document.querySelector('.content');
    if (!content || !content.dataset.originalContent) return;

    // Restore original content
    content.innerHTML = content.dataset.originalContent;
    delete content.dataset.originalContent;

    // Re-initialize context menu handlers for redaction
    if (typeof initializeRedactionHandlers === 'function') {
        initializeRedactionHandlers();
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Export to HTML file
function exportToHtml() {
    try {
        // Check if we're in VSCode webview
        if (vscodeApi) {
            // Get current theme state
            const isLightMode = document.body.classList.contains('light-mode');

            // Get list of redacted element paths for server-side filtering
            const redactedPaths = getRedactedPaths();

            vscodeApi.postMessage({
                command: 'export',
                theme: isLightMode ? 'light' : 'dark',
                redactedPaths: redactedPaths
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

            // Remove all redacted elements from the clone
            const redactedInClone = docClone.querySelectorAll('.redacted');
            redactedInClone.forEach(el => el.remove());

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

            // Get list of redacted element paths
            const redactedPaths = getRedactedPaths();

            // Check if we're in wide view mode
            const isWideView = document.body.classList.contains('wide-view');

            console.log('Sending to browser with theme:', theme, 'wide view:', isWideView, 'redacted paths:', redactedPaths);
            vscodeApi.postMessage({
                command: 'viewInBrowser',
                theme: theme,
                redactedPaths: redactedPaths,
                wideView: isWideView
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

// Redaction functionality
const redactedElements = new Set();
let contextMenuTarget = null;

function showContextMenu(event, element) {
    event.preventDefault();
    event.stopPropagation();

    const menu = document.getElementById('contextMenu');
    contextMenuTarget = element;

    // Position menu at mouse
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';
    menu.classList.add('visible');
}

function hideContextMenu() {
    const menu = document.getElementById('contextMenu');
    menu.classList.remove('visible');
    contextMenuTarget = null;
}

function copyValue() {
    if (!contextMenuTarget) return;

    // Get the value element from the target
    const valueEl = contextMenuTarget.querySelector('.value');
    if (!valueEl) {
        console.warn('No value element found');
        hideContextMenu();
        return;
    }

    // Get the text content (this strips HTML tags)
    const textValue = valueEl.textContent.trim();

    // Copy to clipboard
    navigator.clipboard.writeText(textValue).then(() => {
        console.log('Copied to clipboard:', textValue);
    }).catch(err => {
        console.error('Failed to copy:', err);
    });

    hideContextMenu();
}

function copyAllValues() {
    if (!contextMenuTarget) return;

    // Get the property name from the current target
    const nameEl = contextMenuTarget.querySelector('.name');
    if (!nameEl) {
        console.warn('No property name found, falling back to copy single value');
        copyValue();
        return;
    }

    const propertyName = nameEl.textContent.trim();
    console.log('Copying all values for property:', propertyName);

    // Find the parent array container
    const arrayContainer = contextMenuTarget.closest('.array-container');

    if (!arrayContainer) {
        console.warn('Not inside an array, falling back to copy single value');
        copyValue();
        return;
    }

    // Get all array elements
    const arrayElements = arrayContainer.querySelectorAll('.array-element');
    const values = [];

    arrayElements.forEach((element) => {
        // Skip redacted elements
        if (element.classList.contains('redacted')) return;

        // Find the row with the matching property name
        const rows = element.querySelectorAll(':scope > .row');
        rows.forEach(row => {
            if (row.classList.contains('redacted')) return;

            const rowNameEl = row.querySelector('.name');
            const rowValueEl = row.querySelector('.value');

            if (rowNameEl && rowValueEl && rowNameEl.textContent.trim() === propertyName) {
                const value = rowValueEl.textContent.trim();
                values.push(value);
            }
        });
    });

    if (values.length === 0) {
        console.warn('No values found for property:', propertyName);
        hideContextMenu();
        return;
    }

    // Join values with newlines for easy copying
    const textOutput = values.join('\\n');

    // Copy to clipboard
    navigator.clipboard.writeText(textOutput).then(() => {
        console.log('Copied', values.length, 'values to clipboard for property:', propertyName);
    }).catch(err => {
        console.error('Failed to copy:', err);
    });

    hideContextMenu();
}

function redactSelectedRow() {
    console.log('redactSelectedRow called, contextMenuTarget:', contextMenuTarget);
    if (!contextMenuTarget) return;

    // Find the element to redact - if this is an object/array header, redact the container instead
    let element = contextMenuTarget;
    console.log('Initial element classes:', element.className);

    // If this is an object-header or array-header row, find the parent container
    if (element.classList.contains('object-header') || element.classList.contains('array-header')) {
        const container = element.closest('.object-container, .array-container');
        console.log('Found container:', container ? container.className : 'none');
        if (container) {
            element = container;
        }
    }

    // Get the path of this element
    const path = element.dataset.path || '';
    console.log('Redacting path:', path);

    // Mark this element as redacted
    element.classList.add('redacted');
    redactedElements.add(element);

    // Find and redact all children of this element
    redactChildren(element);

    // If this path contains array indices, find and redact ALL matching elements
    if (path.includes('[')) {
        // Normalize the path by removing array indices
        const normalizedPath = path.replace(/\[\d+\]/g, '');
        console.log('Normalized path for array matching:', normalizedPath);

        // Find all elements with paths that match this pattern
        document.querySelectorAll('[data-path]').forEach(el => {
            const elPath = el.dataset.path || '';
            const elNormalized = elPath.replace(/\[\d+\]/g, '');

            if (elNormalized === normalizedPath && !el.classList.contains('redacted')) {
                console.log('Also redacting matching element:', elPath);
                el.classList.add('redacted');
                redactedElements.add(el);
                redactChildren(el);
            }
        });
    }

    console.log('Total redacted elements:', redactedElements.size);

    // Show the export JSON button if there are redactions
    updateExportJsonButton();

    // If in VSCode, save state and request a refresh with the redacted data
    if (vscodeApi) {
        const allPaths = getRedactedPaths();
        const isLightMode = document.body.classList.contains('light-mode');

        // Save state so it persists across refreshes
        vscodeApi.setState({ redactedPaths: allPaths });
        console.log('Saved state with paths:', allPaths);

        console.log('Requesting refresh with paths:', allPaths);
        vscodeApi.postMessage({
            command: 'refresh',
            theme: isLightMode ? 'light' : 'dark',
            redactedPaths: allPaths
        });
    }

    hideContextMenu();
}

function updateExportJsonButton() {
    // Button is always visible now, no need to toggle display

    // Update title to show redaction indicator
    const title = document.querySelector('.title');
    if (title) {
        const originalTitle = title.dataset.original || title.textContent;
        if (!title.dataset.original) {
            title.dataset.original = originalTitle;
        }

        if (redactedElements.size > 0) {
            title.textContent = originalTitle + ' (redacted)';
        } else {
            title.textContent = originalTitle;
        }
    }
}

function redactChildren(element) {
    // For array containers, redact all array elements
    if (element.classList.contains('array-container')) {
        const arrayId = element.dataset.arrayId || element.querySelector('[data-array-id]')?.dataset.arrayId;
        if (arrayId) {
            const arrayElements = element.querySelectorAll(\`[data-array-id="\${arrayId}"][data-index]\`);
            arrayElements.forEach(el => {
                el.classList.add('redacted');
                redactedElements.add(el);
                // Recursively redact children within array elements
                const childContainers = el.querySelectorAll('.array-container, .object-container, .row');
                childContainers.forEach(child => {
                    child.classList.add('redacted');
                    redactedElements.add(child);
                });
            });
        }
    }

    // For object containers, redact all children
    if (element.classList.contains('object-container')) {
        const children = element.querySelectorAll('.object-children > *');
        children.forEach(child => {
            child.classList.add('redacted');
            redactedElements.add(child);
            redactChildren(child);
        });
    }

    // For regular rows that might contain nested structures
    const childContainers = element.querySelectorAll('.array-container, .object-container');
    childContainers.forEach(child => {
        child.classList.add('redacted');
        redactedElements.add(child);
        redactChildren(child);
    });
}

function getRedactedData() {
    // Build JSON with redacted fields marked
    const content = document.querySelector('.content');
    return buildJsonFromDom(content);
}

function buildJsonFromDom(container) {
    // This will build a JSON object from the DOM, excluding redacted elements
    // For now, return a simple indication
    const allRows = container.querySelectorAll('.row:not(.redacted)');
    const result = {};

    allRows.forEach(row => {
        const nameEl = row.querySelector('.name');
        const valueEl = row.querySelector('.value');
        if (nameEl && valueEl && !row.closest('.redacted')) {
            const key = nameEl.textContent.trim();
            const value = valueEl.textContent.trim();
            result[key] = value;
        }
    });

    return result;
}

function getRedactedPaths() {
    // Get paths to redacted fields for server-side filtering
    const paths = [];

    redactedElements.forEach(element => {
        const path = getElementPath(element);
        console.log('Element path:', path, 'for element:', element.className);
        if (path && path.trim() !== '') {
            paths.push(path);
        } else {
            console.warn('Empty path for element:', element.className, element);
        }
    });

    console.log('Total redacted paths:', paths);
    return paths;
}

function exportRedactedJson() {
    try {
        if (vscodeApi) {
            // In VSCode, send message to export redacted JSON
            const redactedPaths = getRedactedPaths();
            console.log('Exporting JSON with redacted paths:', redactedPaths);
            vscodeApi.postMessage({
                command: 'exportJson',
                redactedPaths: redactedPaths
            });
        } else {
            // In standalone, use the client-side JSON builder
            const redactedData = buildRedactedJsonFromDom();
            const jsonStr = JSON.stringify(redactedData, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'redacted-data.json';
            a.click();
            URL.revokeObjectURL(url);
        }
    } catch (error) {
        console.error('Export JSON failed:', error);
        alert('Export JSON failed: ' + error.message);
    }
}

function buildRedactedJsonFromDom() {
    // Build a proper JSON structure from visible (non-redacted) DOM elements
    const content = document.querySelector('.content');
    // For now, use the simpler version from buildJsonFromDom
    return buildJsonFromDom(content);
}

function getElementPath(element) {
    // Simply read the data-path attribute that was set during rendering
    const path = element.dataset.path || '';
    console.log('Getting path for element:', element.className, '-> path:', path);
    return path;
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
        // Don't modify display for redacted elements - let CSS handle it
        if (!el.classList.contains('redacted') && !el.closest('.redacted')) {
            el.style.display = 'none';
        }
    });

    // Show the selected element (only if not redacted)
    if (elements[newIndex]) {
        if (!elements[newIndex].classList.contains('redacted') && !elements[newIndex].closest('.redacted')) {
            elements[newIndex].style.display = 'block';
        }
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

// Initialize redaction handlers - can be called multiple times
function initializeRedactionHandlers() {
    console.log('Initializing redaction handlers');

    // Restore previous redaction state if available
    if (vscodeApi) {
        const state = vscodeApi.getState();
        if (state && state.redactedPaths) {
            console.log('Restoring redacted paths from state:', state.redactedPaths);
            // Clear old element references (from before refresh)
            redactedElements.clear();
            // Add new elements matching the saved paths
            state.redactedPaths.forEach(path => {
                document.querySelectorAll(\`[data-path="\${path}"]\`).forEach(el => {
                    el.classList.add('redacted');
                    redactedElements.add(el);
                });
            });
            updateExportJsonButton();
        }
    }

    // Add right-click handlers only if in VSCode (not in standalone browser)
    if (!vscodeApi) {
        console.log('Standalone mode - skipping context menu handlers');
        return;
    }

    const elements = document.querySelectorAll('.row, .array-container, .object-container');
    console.log('Adding context menu handlers to', elements.length, 'elements');
    elements.forEach(element => {
        element.addEventListener('contextmenu', function(e) {
            showContextMenu(e, this);
        });
    });
}

// Prevent event bubbling for array headers
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM Content Loaded - initializing redaction handlers');
    console.log('redactedElements Set exists:', typeof redactedElements !== 'undefined');

    document.querySelectorAll('.array-header').forEach(header => {
        header.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    });

    initializeRedactionHandlers();

    // Hide context menu when clicking elsewhere
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.context-menu')) {
            hideContextMenu();
        }
    });

    // Also hide on scroll
    document.querySelector('.content').addEventListener('scroll', hideContextMenu);
});
`;
}
