import * as vscode from 'vscode';
import { generateHtmlContent } from './htmlGenerator';

export class JsonViewerEditorProvider implements vscode.CustomReadonlyEditorProvider {
    // Store CURRENT working JSON data per document URI (gets modified by redactions)
    private workingJsonCache = new Map<string, any>();

    constructor(private readonly context: vscode.ExtensionContext) {}

    async openCustomDocument(
        uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
        token: vscode.CancellationToken
    ): Promise<vscode.CustomDocument> {
        return { uri, dispose: () => {} };
    }

    async resolveCustomEditor(
        document: vscode.CustomDocument,
        webviewPanel: vscode.WebviewPanel,
        token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true
        };

        // Read the JSON file
        const fileContent = await vscode.workspace.fs.readFile(document.uri);
        const jsonText = Buffer.from(fileContent).toString('utf8');

        try {
            const jsonData = JSON.parse(jsonText);
            const fileName = document.uri.fsPath.split(/[\\/]/).pop() || 'JSON Data';

            // Initialize working JSON cache with a copy of the data
            this.workingJsonCache.set(document.uri.toString(), JSON.parse(JSON.stringify(jsonData)));

            // Detect VSCode theme
            const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ? 'light' : 'dark';

            webviewPanel.webview.html = this.generateStandaloneHtml(jsonData, fileName, theme);
        } catch (error) {
            webviewPanel.webview.html = this.generateErrorHtml(error as Error);
        }

        // Handle messages from the webview
        webviewPanel.webview.onDidReceiveMessage(async (message) => {
            console.log('Received message:', message.command, 'redactedPaths:', message.redactedPaths);
            switch (message.command) {
                case 'export':
                    await this.handleExport(document.uri, message.theme, message.redactedPaths);
                    break;
                case 'viewInBrowser':
                    await this.handleViewInBrowser(document.uri, message.theme, message.redactedPaths, message.wideView);
                    break;
                case 'exportJson':
                    await this.handleExportJson(document.uri, message.redactedPaths);
                    break;
                case 'refresh':
                    await this.handleRefresh(document.uri, webviewPanel, message.theme, message.redactedPaths);
                    break;
            }
        });

        // Watch for file changes
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                this.updateWebview(webviewPanel, document.uri);
            }
        });

        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
        });
    }

    private async updateWebview(panel: vscode.WebviewPanel, uri: vscode.Uri): Promise<void> {
        try {
            const fileContent = await vscode.workspace.fs.readFile(uri);
            const jsonText = Buffer.from(fileContent).toString('utf8');
            const jsonData = JSON.parse(jsonText);
            const fileName = uri.fsPath.split(/[\\/]/).pop() || 'JSON Data';

            // Detect VSCode theme
            const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ? 'light' : 'dark';

            panel.webview.html = this.generateStandaloneHtml(jsonData, fileName, theme);
        } catch (error) {
            panel.webview.html = this.generateErrorHtml(error as Error);
        }
    }

    public generateStandaloneHtml(jsonData: any, fileName: string, theme?: string, redactedPaths?: string[], wideView?: boolean): string {
        // Filter out redacted paths from JSON data
        if (redactedPaths && redactedPaths.length > 0) {
            jsonData = this.redactJson(jsonData, redactedPaths);
        }
        return generateHtmlContent(jsonData, fileName, theme, wideView);
    }

    private redactJson(data: any, paths: string[]): any {
        // Create a deep clone of the data
        const cloned = JSON.parse(JSON.stringify(data));

        // Normalize paths by removing array indices
        const normalizedPaths = paths.map(path => {
            if (path && path.trim() !== '') {
                // Remove array indices: items[0].value -> items.value
                const normalized = path.replace(/\[\d+\]/g, '');
                console.log('Redacting path:', path, '-> normalized:', normalized);
                return normalized;
            }
            return '';
        }).filter(p => p !== '');

        // Remove duplicates
        const uniquePaths = [...new Set(normalizedPaths)];

        // Remove each redacted path pattern
        uniquePaths.forEach(path => {
            this.deleteByPathPattern(cloned, path);
        });

        return cloned;
    }

    private deleteByPathPattern(obj: any, pathPattern: string): void {
        const parts = pathPattern.split('.').filter(p => p !== '');

        if (parts.length === 0) return;

        if (parts.length === 1) {
            // Direct property - handle both arrays and objects
            if (Array.isArray(obj)) {
                // Delete from all array elements
                console.log(`  Deleting "${parts[0]}" from ${obj.length} root array elements`);
                obj.forEach(item => {
                    if (item && typeof item === 'object') {
                        delete item[parts[0]];
                    }
                });
            } else {
                // Delete from the object directly
                console.log(`  Deleting "${parts[0]}" from root object`);
                delete obj[parts[0]];
            }
            return;
        }

        // Navigate to parent and delete from all matching locations
        this.deleteRecursive(obj, parts, 0);
    }

    private deleteRecursive(current: any, parts: string[], index: number): void {
        if (!current || typeof current !== 'object') return;

        const part = parts[index];
        const isLastPart = index === parts.length - 1;

        console.log(`  deleteRecursive: part="${part}", index=${index}, isLastPart=${isLastPart}, isArray=${Array.isArray(current)}`);

        if (isLastPart) {
            // Delete this property from current object
            if (Array.isArray(current)) {
                // If current is an array, delete from all elements
                console.log(`  Deleting "${part}" from ${current.length} array elements`);
                current.forEach(item => {
                    if (item && typeof item === 'object') {
                        delete item[part];
                    }
                });
            } else {
                console.log(`  Deleting "${part}" from object`);
                delete current[part];
            }
        } else {
            // Navigate deeper
            if (Array.isArray(current)) {
                // Recurse into all array elements
                console.log(`  Recursing into ${current.length} array elements looking for "${part}"`);
                current.forEach(item => {
                    if (item && typeof item === 'object' && item[part] !== undefined) {
                        this.deleteRecursive(item, parts, index + 1);
                    }
                });
            } else if (current[part] !== undefined) {
                console.log(`  Recursing into property "${part}"`);
                this.deleteRecursive(current[part], parts, index + 1);
            }
        }
    }

    private generateErrorHtml(error: Error): string {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {
            font-family: sans-serif;
            padding: 20px;
            background: #1e1e1e;
            color: #d4d4d4;
        }
        .error {
            background: #5a1d1d;
            border: 1px solid #be1100;
            padding: 15px;
            border-radius: 4px;
        }
        h2 {
            margin-top: 0;
            color: #f48771;
        }
    </style>
</head>
<body>
    <div class="error">
        <h2>Error Parsing JSON</h2>
        <p>${this.escapeHtml(error.message)}</p>
    </div>
</body>
</html>`;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    private async handleExport(uri: vscode.Uri, theme?: string, redactedPaths?: string[]): Promise<void> {
        try {
            // Use the current working JSON data (already redacted)
            const jsonData = this.workingJsonCache.get(uri.toString());
            const fileName = uri.fsPath.split(/[\\/]/).pop() || 'JSON Data';

            if (!jsonData) {
                vscode.window.showErrorMessage('No JSON data available to export');
                return;
            }

            const htmlContent = this.generateStandaloneHtml(jsonData, fileName, theme);

            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(uri.fsPath.replace(/\.json$/i, '.html')),
                filters: {
                    'HTML': ['html']
                }
            });

            if (saveUri) {
                await vscode.workspace.fs.writeFile(saveUri, Buffer.from(htmlContent, 'utf8'));
                vscode.window.showInformationMessage(`Exported to ${saveUri.fsPath}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Export failed: ${error}`);
        }
    }

    private async handleViewInBrowser(uri: vscode.Uri, theme?: string, redactedPaths?: string[], wideView?: boolean): Promise<void> {
        try {
            // Use the current working JSON data (already redacted)
            const jsonData = this.workingJsonCache.get(uri.toString());
            const fileName = uri.fsPath.split(/[\\/]/).pop() || 'JSON Data';

            if (!jsonData) {
                vscode.window.showErrorMessage('No JSON data available to view');
                return;
            }

            const htmlContent = this.generateStandaloneHtml(jsonData, fileName, theme, redactedPaths, wideView);

            // Create a temporary HTML file with timestamp to avoid caching
            const tempDir = this.context.globalStorageUri.fsPath;
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(tempDir));

            const timestamp = Date.now();
            const tempFile = vscode.Uri.file(`${tempDir}/json-viewer-${timestamp}.html`);
            await vscode.workspace.fs.writeFile(tempFile, Buffer.from(htmlContent, 'utf8'));

            // Open in external browser
            await vscode.env.openExternal(tempFile);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open in browser: ${error}`);
        }
    }

    private async handleRefresh(uri: vscode.Uri, panel: vscode.WebviewPanel, theme?: string, redactedPaths?: string[]): Promise<void> {
        try {
            // Get the working JSON data
            let workingData = this.workingJsonCache.get(uri.toString());

            if (!workingData) {
                // Fallback: re-read from file if cache is empty
                const fileContent = await vscode.workspace.fs.readFile(uri);
                const jsonText = Buffer.from(fileContent).toString('utf8');
                workingData = JSON.parse(jsonText);
                this.workingJsonCache.set(uri.toString(), workingData);
            }

            const fileName = uri.fsPath.split(/[\\/]/).pop() || 'JSON Data';

            // Apply redactions to the working data (modifies in place)
            if (redactedPaths && redactedPaths.length > 0) {
                console.log('Applying redactions to working data:', redactedPaths);
                workingData = this.redactJson(workingData, redactedPaths);
                // Update the cache with the modified data
                this.workingJsonCache.set(uri.toString(), workingData);
            }

            // Regenerate HTML from the working data
            panel.webview.html = this.generateStandaloneHtml(workingData, fileName, theme);
        } catch (error) {
            console.error('Refresh failed:', error);
        }
    }

    private async handleExportJson(uri: vscode.Uri, redactedPaths?: string[]): Promise<void> {
        try {
            // Use the current working JSON data (already redacted)
            const jsonData = this.workingJsonCache.get(uri.toString());

            if (!jsonData) {
                vscode.window.showErrorMessage('No JSON data available to export');
                return;
            }

            const jsonOutput = JSON.stringify(jsonData, null, 2);

            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(uri.fsPath.replace(/\.json$/i, '-redacted.json')),
                filters: {
                    'JSON': ['json']
                }
            });

            if (saveUri) {
                await vscode.workspace.fs.writeFile(saveUri, Buffer.from(jsonOutput, 'utf8'));
                vscode.window.showInformationMessage(`Redacted JSON exported to ${saveUri.fsPath}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Export JSON failed: ${error}`);
        }
    }
}
