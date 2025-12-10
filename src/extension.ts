import * as vscode from 'vscode';
import { JsonViewerEditorProvider } from './jsonViewerProvider';
import * as path from 'path';

type CoreClrStopInfo = {
    sessionId: string;
    threadId: number;
    reason?: string;
    frameId?: number;
    sourcePath?: string;
    line?: number;
    column?: number;
};

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

    // Consider stack frames within this line distance after the selection for auto dump
    const CORE_CLR_AUTO_DUMP_LINE_WINDOW = 5;

    // Track the last stopped thread ID
    let lastStoppedThreadId: number | undefined;
    let lastCoreClrStopInfo: CoreClrStopInfo | undefined;
    let autoDumpInProgress = false;

    function normalizePathForComparison(fsPath: string): string {
        const normalized = path.normalize(fsPath);
        return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    }

    async function handleCoreClrStoppedEvent(debugSession: vscode.DebugSession, threadId: number, reason?: string) {
        try {
            const stackTraceResponse = await debugSession.customRequest('stackTrace', {
                threadId,
                startFrame: 0,
                levels: 1
            });

            const topFrame = stackTraceResponse?.stackFrames?.[0];
            if (!topFrame) {
                return;
            }

            lastCoreClrStopInfo = {
                sessionId: debugSession.id,
                threadId,
                reason,
                frameId: topFrame.id,
                sourcePath: topFrame.source?.path,
                line: topFrame.line,
                column: topFrame.column
            };

            await maybeTriggerAutoDebugDump(debugSession, topFrame, reason);
        } catch (error) {
            console.log('Unable to inspect CoreCLR stack trace for auto dump', error);
        }
    }

    async function maybeTriggerAutoDebugDump(debugSession: vscode.DebugSession, topFrame: any, reason?: string) {
        const activeSession = vscode.debug.activeDebugSession;
        if (!activeSession || activeSession.id !== debugSession.id) {
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'csharp') {
            return;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
            return;
        }

        const selectedText = editor.document.getText(selection).trim();
        if (!selectedText) {
            return;
        }

        if (editor.document.uri.scheme !== 'file') {
            return;
        }

        const frameSourcePath: string | undefined = topFrame?.source?.path;
        if (!frameSourcePath) {
            return;
        }

        const editorPath = normalizePathForComparison(editor.document.uri.fsPath);
        const framePath = normalizePathForComparison(frameSourcePath);
        if (editorPath !== framePath) {
            return;
        }

        const zeroBasedFrameLine = typeof topFrame.line === 'number' ? topFrame.line - 1 : undefined;
        if (typeof zeroBasedFrameLine !== 'number') {
            return;
        }

        const selectionStartLine = selection.start.line;
        const selectionEndLine = selection.end.line;
        const maxEligibleLine = selectionEndLine + CORE_CLR_AUTO_DUMP_LINE_WINDOW;

        if (zeroBasedFrameLine < selectionStartLine || zeroBasedFrameLine > maxEligibleLine) {
            return;
        }

        if (autoDumpInProgress) {
            return;
        }

        autoDumpInProgress = true;
        try {
            console.log(`Auto debug dump triggered for CoreCLR stop (${reason || 'stopped'}) at line ${zeroBasedFrameLine + 1}`);
            await vscode.commands.executeCommand('to-debug-dump-cs');
        } catch (error) {
            console.log('Auto debug dump command failed', error);
        } finally {
            autoDumpInProgress = false;
        }
    }

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

    // Track CoreCLR stop events to optionally auto-trigger serialization when near the selection
    const coreClrTracker = vscode.debug.registerDebugAdapterTrackerFactory('coreclr', {
        createDebugAdapterTracker(session: vscode.DebugSession) {
            return {
                onDidSendMessage: (message: any) => {
                    if (!message || message.type !== 'event' || message.event !== 'stopped') {
                        return;
                    }

                    const threadId = message.body?.threadId;
                    if (typeof threadId !== 'number') {
                        return;
                    }

                    const reason = message.body?.reason;
                    lastStoppedThreadId = threadId;
                    lastCoreClrStopInfo = {
                        sessionId: session.id,
                        threadId,
                        reason
                    };

                    console.log(`CoreCLR debugger stopped (reason=${reason || 'unknown'}) on thread ${threadId}`);
                    void handleCoreClrStoppedEvent(session, threadId, reason);
                }
            };
        }
    });

    context.subscriptions.push(coreClrTracker);

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

    // Register command to sort JSON alphabetically
    const sortCommand = vscode.commands.registerCommand('jsonViewer.sortJson', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        const document = editor.document;
        const langId = document.languageId;
        const isJsonFile = langId === 'json'
            || langId === 'jsonc'
            || document.fileName.toLowerCase().endsWith('.json');

        if (!isJsonFile) {
            vscode.window.showErrorMessage('Active file is not a JSON file');
            return;
        }

        const originalText = document.getText();
        let parsed: any;

        try {
            parsed = JSON.parse(originalText);
        } catch (error: any) {
            const message = error?.message ? `: ${error.message}` : '';
            vscode.window.showErrorMessage(`JSON is invalid and cannot be sorted${message}`);
            return;
        }

        // Determine indentation based on current editor settings
        let indent: string | number = 2;
        const tabSize = typeof editor.options.tabSize === 'number' ? editor.options.tabSize : 2;
        const normalizedTabSize = Math.min(Math.max(tabSize, 1), 10);
        if (editor.options.insertSpaces === false) {
            indent = '\t';
        } else {
            indent = ' '.repeat(normalizedTabSize);
        }

        const sortedObject = sortJsonValue(parsed);
        const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
        const hadTrailingEol = originalText.endsWith(eol);

        let sortedText = JSON.stringify(sortedObject, null, indent);
        sortedText = sortedText.replace(/\n/g, eol);

        if (hadTrailingEol && !sortedText.endsWith(eol)) {
            sortedText += eol;
        } else if (!hadTrailingEol && sortedText.endsWith(eol)) {
            sortedText = sortedText.slice(0, -eol.length);
        }

        const entireRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(originalText.length)
        );

        const editSucceeded = await editor.edit(editBuilder => {
            editBuilder.replace(entireRange, sortedText);
        });

        if (!editSucceeded) {
            vscode.window.showErrorMessage('Failed to apply sorted JSON to the document');
            return;
        }

        vscode.window.showInformationMessage('JSON sorted alphabetically');
    });

    context.subscriptions.push(sortCommand);

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
                    // Fall back to treating the clipboard as plain text
                    jsonData = clipboardText;
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
        const expression = `Newtonsoft.Json.JsonConvert.SerializeObject(${selectedText})`;

        try {
            // Try multiple methods to get the frameId
            let frameId: number | undefined;

            // Method 1: Try activeStackItem (VS Code 1.90+)
            const activeStackItem = vscode.debug.activeStackItem;
            if (activeStackItem && 'frameId' in activeStackItem) {
                frameId = (activeStackItem as any).frameId;
            }

            // Method 2: Use the last CoreCLR stop frame if available
            if (!frameId && lastCoreClrStopInfo?.frameId && debugSession.id === lastCoreClrStopInfo.sessionId) {
                frameId = lastCoreClrStopInfo.frameId;
            }

            // Method 3: Use tracked stopped thread ID
            if (!frameId && lastStoppedThreadId) {
                const stackTrace = await debugSession.customRequest('stackTrace', {
                    threadId: lastStoppedThreadId
                });

                if (stackTrace.stackFrames && stackTrace.stackFrames.length > 0) {
                    frameId = stackTrace.stackFrames[0].id;
                }
            }

            // Method 4: Request all threads and use the first one
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
        if (langId !== 'javascript'
            && langId !== 'typescript'
            && langId !== 'javascriptreact'
            && langId !== 'typescriptreact'
            && langId !== 'html'
            && langId !== 'razor'
        ) {
            vscode.window.showErrorMessage('This command only works with JavaScript, TypeScript, Html and Razor files');
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
    const lines = text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line !== '');

    if (lines.length < 2) {
        return null; // Need at least header + 1 data row
    }

    // First line is headers
    const headers = splitDelimitedLine(lines[0], delimiter);

    const expectedColumns = headers.length;

    // Remaining lines are data
    const data: any[] = [];
    for (let i = 1; i < lines.length; i++) {
        const values = splitDelimitedLine(lines[i], delimiter);

        if (values.length > expectedColumns) {
            return null;
        }

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

function splitDelimitedLine(line: string, delimiter: string): string[] {
    if (delimiter === '\t') {
        return line.split('\t');
    }

    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (!inQuotes && (char === '"' || char === '\'')) {
            const hasClosingQuote = line.indexOf(char, i + 1) !== -1;
            if (!hasClosingQuote) {
                current += char;
                continue;
            }

            inQuotes = true;
            quoteChar = char;
            current += char;
            continue;
        }

        if (inQuotes && char === quoteChar) {
            const nextChar = line[i + 1];
            if (nextChar === quoteChar) {
                current += quoteChar;
                i++;
            } else {
                inQuotes = false;
                quoteChar = '';
                current += char;
            }
            continue;
        }

        if (char === delimiter && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    result.push(current);
    return result;
}

function sortJsonValue(value: any): any {
    if (Array.isArray(value)) {
        return value.map(sortJsonValue);
    }

    if (value && typeof value === 'object') {
        const sortedKeys = Object.keys(value).sort((a, b) =>
            a.localeCompare(b, undefined, { sensitivity: 'base' })
        );

        const sortedObject: any = {};

        for (const key of sortedKeys) {
            sortedObject[key] = sortJsonValue(value[key]);
        }

        return sortedObject;
    }

    return value;
}

export function deactivate() { }
