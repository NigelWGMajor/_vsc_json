import * as vscode from 'vscode';
import { generateHtmlContent } from './htmlGenerator';

export class JsonViewerEditorProvider implements vscode.CustomReadonlyEditorProvider {

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

            webviewPanel.webview.html = this.generateStandaloneHtml(jsonData, fileName);
        } catch (error) {
            webviewPanel.webview.html = this.generateErrorHtml(error as Error);
        }

        // Handle messages from the webview
        webviewPanel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'export':
                    await this.handleExport(document.uri, message.theme);
                    break;
                case 'viewInBrowser':
                    await this.handleViewInBrowser(document.uri, message.theme);
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

            panel.webview.html = this.generateStandaloneHtml(jsonData, fileName);
        } catch (error) {
            panel.webview.html = this.generateErrorHtml(error as Error);
        }
    }

    public generateStandaloneHtml(jsonData: any, fileName: string, theme?: string): string {
        return generateHtmlContent(jsonData, fileName, theme);
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

    private async handleExport(uri: vscode.Uri, theme?: string): Promise<void> {
        try {
            const fileContent = await vscode.workspace.fs.readFile(uri);
            const jsonText = Buffer.from(fileContent).toString('utf8');
            const jsonData = JSON.parse(jsonText);
            const fileName = uri.fsPath.split(/[\\/]/).pop() || 'JSON Data';

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

    private async handleViewInBrowser(uri: vscode.Uri, theme?: string): Promise<void> {
        try {
            const fileContent = await vscode.workspace.fs.readFile(uri);
            const jsonText = Buffer.from(fileContent).toString('utf8');
            const jsonData = JSON.parse(jsonText);
            const fileName = uri.fsPath.split(/[\\/]/).pop() || 'JSON Data';

            const htmlContent = this.generateStandaloneHtml(jsonData, fileName, theme);

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
}
