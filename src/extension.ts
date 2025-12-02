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
        // No workspace open, use current file's directory if available (but not for untitled)
        if (currentFileUri && currentFileUri.scheme !== 'untitled') {
            return vscode.Uri.file(path.dirname(currentFileUri.fsPath));
        }
        return undefined;
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

    // Track the last stopped thread ID
    let lastStoppedThreadId: number | undefined;

    // Register debug adapter tracker to capture stopped events
    const trackerFactory = vscode.debug.registerDebugAdapterTrackerFactory('*', {
        createDebugAdapterTracker(session: vscode.DebugSession) {
            return {
                onDidSendMessage: (message: any) => {
                    // Capture the stopped event with threadId
                    if (message.type === 'event' && message.event === 'stopped') {
                        lastStoppedThreadId = message.body?.threadId;
                        console.log(`Debugger stopped on thread: ${lastStoppedThreadId}`);
                    }
                }
            };
        }
    });

    context.subscriptions.push(trackerFactory);

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
            const fileName = document.uri.scheme === 'untitled'
                ? 'untitled.json'
                : path.basename(document.fileName);
            const defaultFileName = fileName.replace(/\.json$/i, '.html');
            const defaultUri = defaultFolder
                ? vscode.Uri.file(path.join(defaultFolder.fsPath, defaultFileName))
                : (document.uri.scheme === 'untitled'
                    ? vscode.Uri.file(path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', 'untitled.html'))
                    : vscode.Uri.file(document.fileName.replace('.json', '.html')));

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
    const clipboardCommand = vscode.commands.registerCommand('to-json-visual-from-clipboard', async () => {
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

    // Register command to dump C# debug variable to JSON
    const toDebugDump = vscode.commands.registerCommand('to-debug-dump-cs', async () => {
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
            // Try multiple methods to get the frameId
            let frameId: number | undefined;

            // Method 1: Try activeStackItem (VS Code 1.90+)
            const activeStackItem = vscode.debug.activeStackItem;
            if (activeStackItem && 'frameId' in activeStackItem) {
                frameId = (activeStackItem as any).frameId;
            }

            // Method 2: Use tracked stopped thread ID
            if (!frameId && lastStoppedThreadId) {
                const stackTrace = await debugSession.customRequest('stackTrace', {
                    threadId: lastStoppedThreadId
                });

                if (stackTrace.stackFrames && stackTrace.stackFrames.length > 0) {
                    frameId = stackTrace.stackFrames[0].id;
                }
            }

            // Method 3: Request all threads and use the first one
            if (!frameId) {
                const threadsResponse = await debugSession.customRequest('threads');

                if (threadsResponse.threads && threadsResponse.threads.length > 0) {
                    const threadId = threadsResponse.threads[0].id;

                    const stackTrace = await debugSession.customRequest('stackTrace', {
                        threadId: threadId
                    });

                    if (stackTrace.stackFrames && stackTrace.stackFrames.length > 0) {
                        frameId = stackTrace.stackFrames[0].id;
                    }
                }
            }

            if (!frameId) {
                vscode.window.showErrorMessage('Could not determine stack frame. Make sure execution is paused at a breakpoint.');
                return;
            }

            // Evaluate directly using the debug session with the current frame
            const result = await debugSession.customRequest('evaluate', {
                expression: expression,
                frameId: frameId,
                context: 'repl'
            });

            // The result should be a JSON string
            let replOutput = result.result;

            // Parse the JSON string output (C# returns quoted JSON string)
            let jsonContent = replOutput;
            if (
                (jsonContent.startsWith('"') && jsonContent.endsWith('"')) ||
                (jsonContent.startsWith('\'') && jsonContent.endsWith('\''))
            ) {
                const quoteChar = jsonContent[0];
                // Remove outer quotes and unescape
                jsonContent = jsonContent.substring(1, jsonContent.length - 1);
                if (quoteChar === '"') {
                    jsonContent = jsonContent.replace(/\\"/g, '"');
                } else {
                    jsonContent = jsonContent.replace(/\\'/g, '\'');
                }
                jsonContent = jsonContent.replace(/\\\\/g, '\\');
            }

            if (!jsonContent || jsonContent.trim() === '') {
                vscode.window.showErrorMessage('No JSON content captured');
                return;
            }

            // Save to a temporary file to avoid custom editor association issues
            const tempDir = context.globalStorageUri.fsPath;
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(tempDir));

            const timestamp = Date.now();
            const tempFile = vscode.Uri.file(`${tempDir}/debug-dump-${timestamp}.json`);
            await vscode.workspace.fs.writeFile(tempFile, Buffer.from(jsonContent, 'utf8'));

            // Open the temp file with default text editor (not custom editor)
            await vscode.commands.executeCommand('vscode.openWith', tempFile, 'default', {
                viewColumn: vscode.ViewColumn.Beside,
                preserveFocus: false,
                preview: false
            });

            // Wait a moment for the document to be ready
            await new Promise(resolve => setTimeout(resolve, 300));

            // Format the document - wrap in try/catch to prevent locking issues
            try {
                await vscode.commands.executeCommand('editor.action.formatDocument');
            } catch (formatError) {
                // Formatting failed, but document is still usable
                console.log('Format failed:', formatError);
            }

            vscode.window.showInformationMessage(`JSON dumped successfully!`);

        } catch (error: any) {
            const errorMsg = error?.message || error?.toString() || 'Unknown error';
            vscode.window.showErrorMessage(`Failed: ${errorMsg}`);
        }
    });

    context.subscriptions.push(toDebugDump);

    // Register command to dump JavaScript/TypeScript debug variable to JSON
    const toDebugDumpTs = vscode.commands.registerCommand('to-debug-dump-ts', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        // Check if the active document is JavaScript or TypeScript
        const langId = editor.document.languageId;
        if (langId !== 'javascript' && langId !== 'typescript' && langId !== 'javascriptreact' && langId !== 'typescriptreact') {
            vscode.window.showErrorMessage('This command only works with JavaScript/TypeScript files');
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

        // Build the JSON.stringify expression with circular reference handling
        const expression = `JSON.stringify(${selectedText}, (key, value) => {
            if (value != null && typeof value === 'object') {
                if (cache.has(value)) {
                    return '[Circular]';
                }
                cache.add(value);
            }
            return value;
        }, 2)`;

        // We need to declare the cache before using it
        const fullExpression = `(() => {
            const cache = new Set();
            return ${expression};
        })()`;

        try {
            // Try multiple methods to get the frameId
            let frameId: number | undefined;

            // Method 1: Try activeStackItem (VS Code 1.90+)
            const activeStackItem = vscode.debug.activeStackItem;
            if (activeStackItem && 'frameId' in activeStackItem) {
                frameId = (activeStackItem as any).frameId;
            }

            // Method 2: Use tracked stopped thread ID
            if (!frameId && lastStoppedThreadId) {
                const stackTrace = await debugSession.customRequest('stackTrace', {
                    threadId: lastStoppedThreadId
                });

                if (stackTrace.stackFrames && stackTrace.stackFrames.length > 0) {
                    frameId = stackTrace.stackFrames[0].id;
                }
            }

            // Method 3: Request all threads and use the first one
            if (!frameId) {
                const threadsResponse = await debugSession.customRequest('threads');

                if (threadsResponse.threads && threadsResponse.threads.length > 0) {
                    const threadId = threadsResponse.threads[0].id;

                    const stackTrace = await debugSession.customRequest('stackTrace', {
                        threadId: threadId
                    });

                    if (stackTrace.stackFrames && stackTrace.stackFrames.length > 0) {
                        frameId = stackTrace.stackFrames[0].id;
                    }
                }
            }

            if (!frameId) {
                vscode.window.showErrorMessage('Could not determine stack frame. Make sure execution is paused at a breakpoint.');
                return;
            }

            // Evaluate directly using the debug session with the current frame
            const result = await debugSession.customRequest('evaluate', {
                expression: fullExpression,
                frameId: frameId,
                context: 'repl'
            });

            // The result should be a JSON string
            let jsonContent = result.result;

            // Remove outer quotes if present
            if (
                (jsonContent.startsWith('"') && jsonContent.endsWith('"')) ||
                (jsonContent.startsWith('\'') && jsonContent.endsWith('\''))
            ) {
                const quoteChar = jsonContent[0];
                jsonContent = jsonContent.substring(1, jsonContent.length - 1);
                // Unescape the string
                if (quoteChar === '"') {
                    jsonContent = jsonContent.replace(/\\"/g, '"');
                } else {
                    jsonContent = jsonContent.replace(/\\'/g, '\'');
                }
                jsonContent = jsonContent
                    .replace(/\\\\/g, '\\')
                    .replace(/\\n/g, '\n')
                    .replace(/\\r/g, '\r')
                    .replace(/\\t/g, '\t');
            }

            if (!jsonContent || jsonContent.trim() === '') {
                vscode.window.showErrorMessage('No JSON content captured');
                return;
            }

            // Save to a temporary file to avoid custom editor association issues
            const tempDir = context.globalStorageUri.fsPath;
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(tempDir));

            const timestamp = Date.now();
            const tempFile = vscode.Uri.file(`${tempDir}/debug-dump-ts-${timestamp}.json`);
            await vscode.workspace.fs.writeFile(tempFile, Buffer.from(jsonContent, 'utf8'));

            // Open the temp file with default text editor (not custom editor)
            await vscode.commands.executeCommand('vscode.openWith', tempFile, 'default', {
                viewColumn: vscode.ViewColumn.Beside,
                preserveFocus: false,
                preview: false
            });

            // Wait a moment for the document to be ready
            await new Promise(resolve => setTimeout(resolve, 300));

            // Format the document - wrap in try/catch to prevent locking issues
            try {
                await vscode.commands.executeCommand('editor.action.formatDocument');
            } catch (formatError) {
                // Formatting failed, but document is still usable
                console.log('Format failed:', formatError);
            }

            vscode.window.showInformationMessage(`JSON dumped successfully!`);

        } catch (error: any) {
            const errorMsg = error?.message || error?.toString() || 'Unknown error';
            vscode.window.showErrorMessage(`Failed: ${errorMsg}`);
        }
    });

    context.subscriptions.push(toDebugDumpTs);
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
