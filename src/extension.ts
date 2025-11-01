import * as vscode from 'vscode';
import { JsonViewerEditorProvider } from './jsonViewerProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('JSON Viewer extension is now active');
    vscode.window.showInformationMessage('JSON Viewer extension activated!');

    // Register the custom editor provider for JSON files
    const provider = new JsonViewerEditorProvider(context);
    const registration = vscode.window.registerCustomEditorProvider(
        'jsonViewer.editor',
        provider,
        {
            webviewOptions: {
                retainContextWhenHidden: true
            },
            supportsMultipleEditorsPerDocument: false
        }
    );

    context.subscriptions.push(registration);
    console.log('Custom editor provider registered for jsonViewer.editor');

    // Register command to open JSON Viewer
    const openViewerCommand = vscode.commands.registerCommand('jsonViewer.openViewer', async (uri?: vscode.Uri) => {
        const targetUri = uri || vscode.window.activeTextEditor?.document.uri;

        if (!targetUri) {
            vscode.window.showErrorMessage('No JSON file selected');
            return;
        }

        try {
            await vscode.commands.executeCommand('vscode.openWith', targetUri, 'jsonViewer.editor');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open viewer: ${error}`);
        }
    });

    context.subscriptions.push(openViewerCommand);

    // Register command to export as standalone HTML
    const exportCommand = vscode.commands.registerCommand('jsonViewer.exportHtml', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        const document = editor.document;
        if (document.languageId !== 'json' && !document.fileName.endsWith('.json')) {
            vscode.window.showErrorMessage('Active file is not a JSON file');
            return;
        }

        try {
            const jsonContent = document.getText();
            const jsonData = JSON.parse(jsonContent);

            const htmlContent = provider.generateStandaloneHtml(jsonData, document.fileName);

            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(document.fileName.replace('.json', '.html')),
                filters: {
                    'HTML': ['html']
                }
            });

            if (saveUri) {
                await vscode.workspace.fs.writeFile(saveUri, Buffer.from(htmlContent, 'utf8'));
                vscode.window.showInformationMessage(`Exported to ${saveUri.fsPath}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to export: ${error}`);
        }
    });

    context.subscriptions.push(exportCommand);
}

export function deactivate() {}
