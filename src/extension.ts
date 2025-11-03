import * as vscode from 'vscode';
import { JsonViewerEditorProvider } from './jsonViewerProvider';
import * as path from 'path';

/**
 * Get the default folder for saving files.
 * Priority: .data folder in workspace root > first workspace folder > current file directory
 */
async function getDefaultSaveFolder(currentFileUri?: vscode.Uri): Promise<vscode.Uri | undefined> {
    // Get the first workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
        // No workspace open, use current file's directory if available
        return currentFileUri ? vscode.Uri.file(path.dirname(currentFileUri.fsPath)) : undefined;
    }

    // Check if .data folder exists in workspace root
    const dataFolderPath = path.join(workspaceFolder.uri.fsPath, '.data');
    const dataFolderUri = vscode.Uri.file(dataFolderPath);

    try {
        // Check if .data folder actually exists
        await vscode.workspace.fs.stat(dataFolderUri);
        // If stat succeeds, the folder exists
        return dataFolderUri;
    } catch {
        // If .data doesn't exist or can't be accessed, use workspace root
        return workspaceFolder.uri;
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('JSON Viewer extension is now active');
    vscode.window.showInformationMessage('JSON Viewer extension activated!');

    // Register the custom editor provider for JSON files
    const provider = new JsonViewerEditorProvider(context);
    const registration = vscode.window.registerCustomEditorProvider(
        'j2html.editor',
        provider,
        {
            webviewOptions: {
                retainContextWhenHidden: true
            },
            supportsMultipleEditorsPerDocument: false
        }
    );

    context.subscriptions.push(registration);
    console.log('Custom editor provider registered for j2html.editor');

    // Register command to open JSON Viewer
    const openViewerCommand = vscode.commands.registerCommand('jsonViewer.openViewer', async (uri?: vscode.Uri) => {
        const targetUri = uri || vscode.window.activeTextEditor?.document.uri;

        if (!targetUri) {
            vscode.window.showErrorMessage('No JSON file selected');
            return;
        }

        try {
            await vscode.commands.executeCommand('vscode.openWith', targetUri, 'j2html.editor');
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

            // Get default save folder and create default file path
            const defaultFolder = await getDefaultSaveFolder(document.uri);
            const fileName = path.basename(document.fileName);
            const defaultFileName = fileName.replace(/\.json$/i, '.html');
            const defaultUri = defaultFolder
                ? vscode.Uri.file(path.join(defaultFolder.fsPath, defaultFileName))
                : vscode.Uri.file(document.fileName.replace('.json', '.html'));

            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: defaultUri,
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

    // Register command to display clipboard data (JSON, TSV, or CSV)
    const clipboardCommand = vscode.commands.registerCommand('to-json-visual-from-clip', async () => {
        try {
            const clipboardText = await vscode.env.clipboard.readText();

            if (!clipboardText || clipboardText.trim() === '') {
                vscode.window.showErrorMessage('Clipboard is empty');
                return;
            }

            let jsonData: any;
            const trimmed = clipboardText.trim();

            // Check if it starts with { or [ (JSON)
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                try {
                    jsonData = JSON.parse(trimmed);
                } catch (error) {
                    vscode.window.showErrorMessage('Clipboard contains invalid JSON');
                    return;
                }
            } else {
                // Try TSV first (tab-delimited), then CSV (comma-delimited)
                if (clipboardText.includes('\t')) {
                    jsonData = parseDelimitedToJson(clipboardText, '\t');
                } else {
                    jsonData = parseDelimitedToJson(clipboardText, ',');
                }

                if (!jsonData) {
                    vscode.window.showErrorMessage('Clipboard does not contain valid JSON, TSV, or CSV data');
                    return;
                }
            }

            // Create a temporary JSON file to open in the viewer
            const tempDir = context.globalStorageUri.fsPath;
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(tempDir));

            const timestamp = Date.now();
            const tempFile = vscode.Uri.file(`${tempDir}/clipboard-${timestamp}.json`);
            const jsonContent = JSON.stringify(jsonData, null, 2);
            await vscode.workspace.fs.writeFile(tempFile, Buffer.from(jsonContent, 'utf8'));

            // Open in VSCode viewer
            await vscode.commands.executeCommand('vscode.openWith', tempFile, 'j2html.editor');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to process clipboard: ${error}`);
        }
    });

    context.subscriptions.push(clipboardCommand);
}

function parseDelimitedToJson(text: string, delimiter: string): any[] | null {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line !== '');

    if (lines.length < 2) {
        return null; // Need at least header + 1 data row
    }

    // First line is headers
    const headers = lines[0].split(delimiter);

    // Remaining lines are data
    const data: any[] = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(delimiter);
        const row: any = {};

        for (let j = 0; j < headers.length; j++) {
            const header = headers[j].trim();
            const value = values[j] ? values[j].trim() : '';

            // Try to parse as number if possible
            const numValue = parseFloat(value);
            row[header] = !isNaN(numValue) && value !== '' ? numValue : value;
        }

        data.push(row);
    }

    return data;
}

export function deactivate() {}
