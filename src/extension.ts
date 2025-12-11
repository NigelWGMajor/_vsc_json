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

type PendingAutoDumpRequest = {
    documentUri: string;
    filePath: string;
    selectionStart: { line: number; character: number };
    selectionEnd: { line: number; character: number };
    selectionText: string;
    sessionId?: string;
    createdAt: number;
    requiresStepOverBeforeDump?: boolean;
};

type AutoDumpSelectionContext = {
    range: vscode.Range;
    startLine: number;
    endLine: number;
    selectionText: string;
    filePath: string;
    fromPendingRequest: boolean;
    requiresStepOverBeforeDump: boolean;
    expressionType: 'return' | 'assignment' | 'other';
    ensureSelection(): Promise<void>;
};

type DumpMetadata = {
    expression: string;
    filePath: string;
    sanitizedLabel: string;
    createdAt: number;
    lineNumber?: number;
};

function sanitizeFileNameSegment(input: string, fallback = 'selection'): string {
    if (!input) {
        return fallback;
    }

    const cleaned = input
        .replace(/[\r\n]+/g, ' ')
        .trim();

    let sanitized = cleaned
        .replace(/[^A-Za-z0-9_\-.]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-.]+/, '')
        .replace(/[-.]+$/, '');

    if (!sanitized) {
        sanitized = fallback;
    }

    sanitized = sanitized.slice(0, 60);

    const reserved = new Set([
        'CON', 'PRN', 'AUX', 'NUL',
        'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
        'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
    ]);

    if (reserved.has(sanitized.toUpperCase())) {
        sanitized = `${sanitized}-var`;
    }

    return sanitized || fallback;
}

function formatNumberSegment(value: number, length: number): string {
    return value.toString().padStart(length, '0');
}

function buildDumpFileName(label: string, context: AutoDumpSelectionContext): string {
    const lineSegment = formatNumberSegment(context.startLine + 1, 3);
    const now = new Date();
    const hh = formatNumberSegment(now.getHours(), 2);
    const mm = formatNumberSegment(now.getMinutes(), 2);
    const ss = formatNumberSegment(now.getSeconds(), 2);

    const timeSegment = `${hh}-${mm}-${ss}`;
    return `${label}-${lineSegment}-${timeSegment}.json`;
}

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
    const MAGIC_BREAKPOINT_CONDITION = '99==99';

    // Track the last stopped thread ID
    let lastStoppedThreadId: number | undefined;
    let lastCoreClrStopInfo: CoreClrStopInfo | undefined;
    let autoDumpInProgress = false;
    let autoDumpArmed = false;
    let pendingAutoDumpRequest: PendingAutoDumpRequest | undefined;
    const dumpMetadataByPath = new Map<string, DumpMetadata>();
    let lastFocusedCodeEditor: vscode.TextEditor | undefined;

    function createSelectionContextFromRange(
        editor: vscode.TextEditor,
        range: vscode.Range,
        selectionText: string,
        filePath: string,
        fromPendingRequest: boolean,
        requiresStepOverBeforeDump = false
    ): AutoDumpSelectionContext {
        const stableRange = new vscode.Range(range.start, range.end);
        const normalized = normalizeSelectionRange(editor, stableRange, selectionText, requiresStepOverBeforeDump);
        const effectiveRange = normalized.range;
        const effectiveSelectionText = normalized.selectionText;
        const effectiveRequiresStep = normalized.requiresStepOverBeforeDump;
        const expressionType = normalized.expressionType;

        return {
            range: effectiveRange,
            startLine: effectiveRange.start.line,
            endLine: effectiveRange.end.line,
            selectionText: effectiveSelectionText,
            filePath,
            fromPendingRequest,
            requiresStepOverBeforeDump: effectiveRequiresStep,
            expressionType,
            ensureSelection: async () => {
                if (!editor.selection.isEqual(effectiveRange)) {
                    editor.selection = new vscode.Selection(effectiveRange.start, effectiveRange.end);
                    editor.revealRange(effectiveRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
                }
            }
        };
    }

    function normalizeSelectionRange(
        editor: vscode.TextEditor,
        range: vscode.Range,
        selectionText: string,
        requiresStepOverBeforeDump: boolean
    ): { range: vscode.Range; selectionText: string; requiresStepOverBeforeDump: boolean; expressionType: 'return' | 'assignment' | 'other' } {
        let normalizedRange = range;
        let normalizedRequiresStep = requiresStepOverBeforeDump;
        let expressionType: 'return' | 'assignment' | 'other' = 'other';
        const document = editor.document;
        let normalizedText = selectionText ?? document.getText(range) ?? '';

        const trimmedForAnalysis = normalizedText.trim();
        const singleLineSelection = range.start.line === range.end.line;

        if (singleLineSelection) {
            const lowerTrimmed = trimmedForAnalysis.toLowerCase();

            if (lowerTrimmed.startsWith('return')) {
                const remainder = trimmedForAnalysis.slice('return'.length).trim();
                if (remainder) {
                    const returnRange = tryGetReturnExpressionRange(document, range.start.line);
                    if (returnRange) {
                        normalizedRange = returnRange;
                        normalizedText = document.getText(returnRange);
                        normalizedRequiresStep = false;
                        expressionType = 'return';
                    }
                }
            } else if (containsSimpleAssignmentOperator(trimmedForAnalysis)) {
                const assignmentRange = tryGetAssignmentTargetRange(document, range.start.line);
                if (assignmentRange) {
                    normalizedRange = assignmentRange;
                    normalizedText = document.getText(assignmentRange);
                    normalizedRequiresStep = true;
                    expressionType = 'assignment';
                }
            }
        }

        const trimmedResult = normalizedText.trim();
        return {
            range: normalizedRange,
            selectionText: trimmedResult,
            requiresStepOverBeforeDump: normalizedRequiresStep,
            expressionType
        };
    }

    function isMagicBreakpointCondition(condition: string | undefined): boolean {
        if (!condition) {
            return false;
        }
        const normalized = condition.replace(/\s+/g, '');
        return normalized === MAGIC_BREAKPOINT_CONDITION;
    }

    function isAutoDumpAuthorizedForLocation(framePath: string, zeroBasedLine: number): boolean {
        const normalizedFramePath = normalizePathForComparison(framePath);
        for (const breakpoint of vscode.debug.breakpoints) {
            if (!(breakpoint instanceof vscode.SourceBreakpoint)) {
                continue;
            }

            const location = breakpoint.location;
            if (!location || !location.uri || location.uri.scheme !== 'file') {
                continue;
            }

            const bpPath = normalizePathForComparison(location.uri.fsPath);
            if (bpPath !== normalizedFramePath) {
                continue;
            }

            const bpLine = typeof location.range?.start?.line === 'number'
                ? location.range.start.line
                : undefined;

            if (bpLine !== zeroBasedLine) {
                continue;
            }

            if (!isMagicBreakpointCondition(breakpoint.condition)) {
                continue;
            }

            if (breakpoint.enabled === false) {
                continue;
            }

            return true;
        }

        return false;
    }

    function containsSimpleAssignmentOperator(text: string): boolean {
        const eqIndex = text.indexOf('=');
        if (eqIndex === -1) {
            return false;
        }

        const prevChar = text[eqIndex - 1];
        const nextChar = text[eqIndex + 1];

        if (nextChar === '=' || nextChar === '>') {
            return false;
        }

        if (prevChar === '<' || prevChar === '>' || prevChar === '!' || prevChar === '=') {
            return false;
        }

        return true;
    }

    function toCSharpStringLiteral(text: string): string {
        const escaped = text
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\r/g, '\\r')
            .replace(/\n/g, '\\n');
        return `"${escaped}"`;
    }

    function persistPendingRequestFromContext(
        editor: vscode.TextEditor,
        context: AutoDumpSelectionContext,
        sessionId?: string,
        requiresStepOverBeforeDump = context.requiresStepOverBeforeDump
    ) {
        pendingAutoDumpRequest = {
            documentUri: editor.document.uri.toString(),
            filePath: context.filePath,
            selectionStart: {
                line: context.range.start.line,
                character: context.range.start.character
            },
            selectionEnd: {
                line: context.range.end.line,
                character: context.range.end.character
            },
            selectionText: context.selectionText,
            sessionId,
            createdAt: Date.now(),
            requiresStepOverBeforeDump
        };
    }

    async function triggerPendingAutoDumpIfPaused(debugSession?: vscode.DebugSession) {
        if (!debugSession || !pendingAutoDumpRequest) {
            return;
        }

        if (pendingAutoDumpRequest.sessionId && pendingAutoDumpRequest.sessionId !== debugSession.id) {
            return;
        }

        try {
            const candidateThreadId = (lastCoreClrStopInfo && lastCoreClrStopInfo.sessionId === debugSession.id)
                ? lastCoreClrStopInfo.threadId
                : lastStoppedThreadId;

            if (typeof candidateThreadId !== 'number') {
                return;
            }

            const stackTraceResponse = await debugSession.customRequest('stackTrace', {
                threadId: candidateThreadId,
                startFrame: 0,
                levels: 1
            });

            const topFrame = stackTraceResponse?.stackFrames?.[0];
            if (!topFrame) {
                return;
            }

            await maybeTriggerAutoDebugDump(debugSession, topFrame, lastCoreClrStopInfo?.reason, candidateThreadId);
        } catch (error) {
            console.log('Immediate auto dump attempt failed', error);
        }
    }

    async function resolveFrameId(debugSession: vscode.DebugSession): Promise<number | undefined> {
        let frameId: number | undefined;

        const activeStackItem = vscode.debug.activeStackItem;
        if (activeStackItem && 'frameId' in activeStackItem) {
            frameId = (activeStackItem as any).frameId;
        }

        if (!frameId && lastCoreClrStopInfo?.frameId && debugSession.id === lastCoreClrStopInfo.sessionId) {
            frameId = lastCoreClrStopInfo.frameId;
        }

        if (!frameId && lastStoppedThreadId) {
            const stackTrace = await debugSession.customRequest('stackTrace', {
                threadId: lastStoppedThreadId
            });

            if (stackTrace.stackFrames && stackTrace.stackFrames.length > 0) {
                frameId = stackTrace.stackFrames[0].id;
            }
        }

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

        return frameId;
    }

    function rememberDumpMetadata(tempFile: vscode.Uri, selectionContext: AutoDumpSelectionContext, sanitizedLabel: string) {
        dumpMetadataByPath.set(tempFile.fsPath, {
            expression: selectionContext.selectionText,
            filePath: selectionContext.filePath,
            sanitizedLabel,
            createdAt: Date.now(),
            lineNumber: selectionContext.startLine + 1
        });
    }

    function getDumpMetadataForDocument(uri: vscode.Uri): DumpMetadata | undefined {
        const metadata = dumpMetadataByPath.get(uri.fsPath);
        if (metadata) {
            return metadata;
        }

        if (uri.scheme !== 'file') {
            return undefined;
        }

        const inferredExpression = inferExpressionFromFileName(path.basename(uri.fsPath));
        if (!inferredExpression) {
            return undefined;
        }

        return {
            expression: inferredExpression,
            filePath: uri.fsPath,
            sanitizedLabel: inferredExpression,
            createdAt: Date.now()
        };
    }

    function inferExpressionFromFileName(fileName: string): string | undefined {
        if (!fileName) {
            return undefined;
        }

        const withoutExt = fileName.replace(/\.json$/i, '');
        const patternMatch = withoutExt.match(/^(.*)-\d+-\d{2}-\d{2}-\d{2}$/);
        if (patternMatch && patternMatch[1]) {
            return patternMatch[1];
        }
        return withoutExt || undefined;
    }

    function tryGetReturnExpressionRange(document: vscode.TextDocument, lineNumber: number): vscode.Range | undefined {
        if (lineNumber < 0 || lineNumber >= document.lineCount) {
            return undefined;
        }

        const line = document.lineAt(lineNumber);
        const text = line.text;
        const trimmedStart = text.trimStart();
        if (!trimmedStart.startsWith('return')) {
            return undefined;
        }

        const afterReturn = trimmedStart.slice('return'.length);
        const trimmedExpression = afterReturn.trim();
        if (!trimmedExpression || trimmedExpression === ';') {
            return undefined;
        }

        const expressionWithoutSemicolon = trimmedExpression.endsWith(';')
            ? trimmedExpression.slice(0, -1).trimEnd()
            : trimmedExpression;

        if (!expressionWithoutSemicolon) {
            return undefined;
        }

        const leadingWhitespace = text.length - trimmedStart.length;
        let exprStartChar = leadingWhitespace + 'return'.length;
        while (exprStartChar < text.length && /\s/.test(text[exprStartChar])) {
            exprStartChar++;
        }

        const exprEndChar = exprStartChar + expressionWithoutSemicolon.length;
        return new vscode.Range(
            new vscode.Position(lineNumber, exprStartChar),
            new vscode.Position(lineNumber, exprEndChar)
        );
    }

    function tryGetAssignmentTargetRange(document: vscode.TextDocument, lineNumber: number): vscode.Range | undefined {
        if (lineNumber < 0 || lineNumber >= document.lineCount) {
            return undefined;
        }

        const line = document.lineAt(lineNumber);
        const text = line.text;
        const eqIndex = text.indexOf('=');
        if (eqIndex <= 0) {
            return undefined;
        }

        const prevChar = text[eqIndex - 1];
        const nextChar = text[eqIndex + 1];
        if (nextChar === '=' || nextChar === '>') {
            return undefined;
        }

        if (prevChar === '<' || prevChar === '>' || prevChar === '!') {
            return undefined;
        }

        const leftSegment = text.slice(0, eqIndex);
        const trimmedLeft = leftSegment.trim();
        if (!trimmedLeft) {
            return undefined;
        }

        const parts = trimmedLeft.split(/\s+/);
        const candidate = parts[parts.length - 1];
        if (!candidate) {
            return undefined;
        }

        const candidateIndex = leftSegment.lastIndexOf(candidate);
        if (candidateIndex === -1) {
            return undefined;
        }

        return new vscode.Range(
            new vscode.Position(lineNumber, candidateIndex),
            new vscode.Position(lineNumber, candidateIndex + candidate.length)
        );
    }

    const MAX_BACKTRACK_LINES_FOR_AUTO_SELECTION = 3;

    function inferSelectionFromFrameLine(
        editor: vscode.TextEditor,
        filePath: string,
        zeroBasedFrameLine: number
    ): AutoDumpSelectionContext | undefined {
        const document = editor.document;
        const maxLineIndex = document.lineCount - 1;
        const startLine = Math.min(Math.max(zeroBasedFrameLine, 0), maxLineIndex);

        for (let backtrack = 0; backtrack <= MAX_BACKTRACK_LINES_FOR_AUTO_SELECTION; backtrack++) {
            const candidateLine = startLine - backtrack;
            if (candidateLine < 0) {
                break;
            }

            const returnRange = tryGetReturnExpressionRange(document, candidateLine);
            if (returnRange) {
                const selectionText = document.getText(returnRange).trim();
                if (selectionText) {
                    const logSuffix = backtrack === 0
                        ? ''
                        : ` (found ${backtrack} line(s) above cursor)`;
                    console.log(`Heuristic auto selection: using return expression on line ${candidateLine + 1}${logSuffix}`);
                    return createSelectionContextFromRange(editor, returnRange, selectionText, filePath, false, false);
                }
            }

            const assignmentRange = tryGetAssignmentTargetRange(document, candidateLine);
            if (assignmentRange) {
                const selectionText = document.getText(assignmentRange).trim();
                if (selectionText) {
                    const logSuffix = backtrack === 0
                        ? ''
                        : ` (found ${backtrack} line(s) above cursor)`;
                    console.log(`Heuristic auto selection: using assignment target on line ${candidateLine + 1}${logSuffix}`);
                    return createSelectionContextFromRange(editor, assignmentRange, selectionText, filePath, false, true);
                }
            }
        }

        return undefined;
    }

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

            await maybeTriggerAutoDebugDump(debugSession, topFrame, reason, threadId);
        } catch (error) {
            console.log('Unable to inspect CoreCLR stack trace for auto dump', error);
        }
    }

    function getAutoDumpSelectionContext(
        editor: vscode.TextEditor,
        session: vscode.DebugSession,
        zeroBasedFrameLine?: number,
        options?: { allowHeuristicWithoutPending?: boolean; preferHeuristicOverSelection?: boolean }
    ): AutoDumpSelectionContext | undefined {
        if (editor.document.uri.scheme !== 'file') {
            return undefined;
        }

        const docPath = normalizePathForComparison(editor.document.uri.fsPath);

        const allowHeuristics = options?.allowHeuristicWithoutPending || !!pendingAutoDumpRequest;
        const preferHeuristic = options?.preferHeuristicOverSelection === true;

        const tryInferFromFrameLine = () => {
            if (allowHeuristics && typeof zeroBasedFrameLine === 'number') {
                return inferSelectionFromFrameLine(editor, docPath, zeroBasedFrameLine);
            }
            return undefined;
        };

        if (pendingAutoDumpRequest && pendingAutoDumpRequest.filePath === docPath) {
            const pendingRange = new vscode.Range(
                new vscode.Position(
                    pendingAutoDumpRequest.selectionStart.line,
                    pendingAutoDumpRequest.selectionStart.character
                ),
                new vscode.Position(
                    pendingAutoDumpRequest.selectionEnd.line,
                    pendingAutoDumpRequest.selectionEnd.character
                )
            );

            const pendingContext = createSelectionContextFromRange(
                editor,
                pendingRange,
                pendingAutoDumpRequest.selectionText,
                pendingAutoDumpRequest.filePath,
                true,
                pendingAutoDumpRequest.requiresStepOverBeforeDump === true
            );

            pendingContext.requiresStepOverBeforeDump = pendingAutoDumpRequest.requiresStepOverBeforeDump === true;
            return pendingContext;
        }

        if (preferHeuristic) {
            const inferred = tryInferFromFrameLine();
            if (inferred) {
                return inferred;
            }
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
            const inferred = tryInferFromFrameLine();
            return inferred;
        }

        const selectedText = editor.document.getText(selection).trim();
        if (!selectedText) {
            const inferred = tryInferFromFrameLine();
            return inferred;
        }

        const selectionRange = new vscode.Range(selection.start, selection.end);
        const contextFromSelection = createSelectionContextFromRange(editor, selectionRange, selectedText, docPath, false);
        if (contextFromSelection.selectionText) {
            return contextFromSelection;
        }

        return tryInferFromFrameLine();
    }

    async function maybeTriggerAutoDebugDump(debugSession: vscode.DebugSession, topFrame: any, reason?: string, threadId?: number) {
        const activeSession = vscode.debug.activeDebugSession;
        if (!activeSession || activeSession.id !== debugSession.id) {
            return;
        }

        const frameSourcePath: string | undefined = topFrame?.source?.path;
        if (!frameSourcePath) {
            return;
        }

        const framePath = normalizePathForComparison(frameSourcePath);
        const zeroBasedFrameLine = typeof topFrame.line === 'number' ? topFrame.line - 1 : undefined;
        if (typeof zeroBasedFrameLine !== 'number') {
            return;
        }

        if (!autoDumpArmed && !pendingAutoDumpRequest) {
            return;
        }

        let editor = vscode.window.activeTextEditor;
        const normalizedActivePath = editor ? normalizePathForComparison(editor.document.uri.fsPath) : undefined;
        const activeMatchesFrame = editor
            && normalizedActivePath === framePath
            && editor.document.languageId === 'csharp';

        if (!activeMatchesFrame) {
            let matchingVisibleEditor = vscode.window.visibleTextEditors.find(textEditor =>
                normalizePathForComparison(textEditor.document.uri.fsPath) === framePath
                && textEditor.document.languageId === 'csharp'
            );

            try {
                if (matchingVisibleEditor) {
                    editor = matchingVisibleEditor;
                    await vscode.window.showTextDocument(matchingVisibleEditor.document, {
                        viewColumn: matchingVisibleEditor.viewColumn,
                        preserveFocus: false,
                        preview: false
                    });
                } else {
                    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(frameSourcePath));
                    const preferredColumn = editor?.viewColumn ?? vscode.ViewColumn.Active;
                    editor = await vscode.window.showTextDocument(document, {
                        viewColumn: preferredColumn,
                        preserveFocus: false,
                        preview: false
                    });
                }
            } catch (openError) {
                console.log('Unable to open editor for auto debug dump', openError);
                return;
            }
        }

        if (!editor || editor.document.languageId !== 'csharp') {
            return;
        }

        const pendingMatchesFrame = pendingAutoDumpRequest
            && pendingAutoDumpRequest.filePath === framePath;
        const matchedPendingRequest = pendingMatchesFrame ? pendingAutoDumpRequest : undefined;

        if (!matchedPendingRequest && !isAutoDumpAuthorizedForLocation(frameSourcePath, zeroBasedFrameLine)) {
            return;
        }

        const selectionContext = getAutoDumpSelectionContext(
            editor,
            debugSession,
            zeroBasedFrameLine,
            {
                allowHeuristicWithoutPending: true,
                preferHeuristicOverSelection: true
            }
        );
        if (!selectionContext || !selectionContext.selectionText) {
            return;
        }

        if (selectionContext.fromPendingRequest && matchedPendingRequest) {
            selectionContext.requiresStepOverBeforeDump = matchedPendingRequest.requiresStepOverBeforeDump === true;
        }

        if (selectionContext.filePath !== framePath) {
            return;
        }

        const selectionStartLine = selectionContext.startLine;
        const selectionEndLine = selectionContext.endLine;
        const maxEligibleLine = selectionEndLine + CORE_CLR_AUTO_DUMP_LINE_WINDOW;

        if (zeroBasedFrameLine < selectionStartLine || zeroBasedFrameLine > maxEligibleLine) {
            return;
        }

        if (selectionContext.expressionType === 'return') {
            // Never step over return statements automatically; dump first so the user can intervene.
        } else if (selectionContext.requiresStepOverBeforeDump) {
            if (typeof threadId === 'number') {
                vscode.window.showInformationMessage('Stepping over assignment to capture value for JSON Visualizer...');
                persistPendingRequestFromContext(editor, selectionContext, debugSession.id, false);
                console.log('Auto debug dump will step over assignment before evaluating selection.');
                try {
                    await debugSession.customRequest('next', { threadId });
                } catch (stepError) {
                    console.log('Failed to request step over before auto dump', stepError);
                }
            } else {
                console.log('Cannot step over assignment automatically because threadId is unavailable.');
            }
            return;
        }

        if (autoDumpInProgress) {
            return;
        }

        autoDumpInProgress = true;
        try {
            await selectionContext.ensureSelection();
            console.log(`Auto debug dump triggered for CoreCLR stop (${reason || 'stopped'}) at line ${zeroBasedFrameLine + 1}`);
            await vscode.commands.executeCommand('to-debug-dump-cs');
        } catch (error) {
            console.log('Auto debug dump command failed', error);
        } finally {
            autoDumpInProgress = false;
            if (selectionContext.fromPendingRequest) {
                pendingAutoDumpRequest = undefined;
            }
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

    const debugTermination = vscode.debug.onDidTerminateDebugSession(() => {
        autoDumpArmed = false;
        pendingAutoDumpRequest = undefined;
    });
    context.subscriptions.push(debugTermination);

    const editorFocusListener = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && editor.document.languageId === 'csharp') {
            lastFocusedCodeEditor = editor;
        }
    });
    context.subscriptions.push(editorFocusListener);

    const visualizeAtBreakpointCommand = vscode.commands.registerCommand('jsonViewer.visualizeAtBreakpoint', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        if (editor.document.languageId !== 'csharp') {
            vscode.window.showErrorMessage('Json Visualizer at Breakpoint only works with C# files');
            return;
        }

        if (editor.document.uri.scheme !== 'file') {
            vscode.window.showErrorMessage('File must be saved before arming the breakpoint visualizer');
            return;
        }

        const debugSession = vscode.debug.activeDebugSession;
        const normalizedPath = normalizePathForComparison(editor.document.uri.fsPath);

        const selection = editor.selection;
        let selectionContext: AutoDumpSelectionContext | undefined;
        if (!selection.isEmpty) {
            const selectedText = editor.document.getText(selection).trim();
            if (!selectedText) {
                vscode.window.showErrorMessage('Selected expression is empty');
                return;
            }

            const selectionRange = new vscode.Range(selection.start, selection.end);
            selectionContext = createSelectionContextFromRange(
                editor,
                selectionRange,
                selectedText,
                normalizedPath,
                false,
                false
            );
        } else {
            selectionContext = inferSelectionFromFrameLine(editor, normalizedPath, selection.active.line);
        }

        if (!selectionContext) {
            vscode.window.showErrorMessage('Select a variable or place the caret on an assignment/return before arming the visualizer.');
            return;
        }

        persistPendingRequestFromContext(editor, selectionContext, debugSession?.id);
        autoDumpArmed = true;

        const waitingMessage = debugSession
            ? 'Visualizing the selected expression at the current breakpoint...'
            : 'Waiting for the CoreCLR debugger to start. Visualization will run at conditional breakpoints 99==99.';

        vscode.window.showInformationMessage(waitingMessage);

        if (debugSession) {
            void triggerPendingAutoDumpIfPaused(debugSession);
        }
    });

    context.subscriptions.push(visualizeAtBreakpointCommand);

    const stopVisualizeCommand = vscode.commands.registerCommand('jsonViewer.stopVisualizingAtBreakpoint', () => {
        autoDumpArmed = false;
        pendingAutoDumpRequest = undefined;
        vscode.window.showInformationMessage('JSON Visualizer auto breakpoint dumps are disabled.');
    });
    context.subscriptions.push(stopVisualizeCommand);

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

        const fallbackLine = lastCoreClrStopInfo && lastCoreClrStopInfo.sessionId === debugSession.id
            ? (typeof lastCoreClrStopInfo.line === 'number' ? lastCoreClrStopInfo.line - 1 : undefined)
            : undefined;

        const selectionContext = getAutoDumpSelectionContext(editor, debugSession, fallbackLine, {
            allowHeuristicWithoutPending: true
        });

        if (!selectionContext || !selectionContext.selectionText) {
            vscode.window.showErrorMessage('Select a variable/expression or place the caret on a return/assignment before dumping.');
            return;
        }

        if (selectionContext.requiresStepOverBeforeDump) {
            vscode.window.showInformationMessage('Step over the assignment so the variable has a value, then rerun the command.');
            return;
        }

        await selectionContext.ensureSelection();
        const selectedText = selectionContext.selectionText;
        const safeFileSegment = sanitizeFileNameSegment(selectedText, 'selection');

        // Build the serialization expression
        const expression = `Newtonsoft.Json.JsonConvert.SerializeObject(${selectedText})`;

        try {
            const frameId = await resolveFrameId(debugSession);

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

            const dumpFileName = buildDumpFileName(safeFileSegment, selectionContext);
            const tempFilePath = path.join(tempDir, dumpFileName);
            const tempFile = vscode.Uri.file(tempFilePath);
            await vscode.workspace.fs.writeFile(tempFile, Buffer.from(jsonContent, 'utf8'));
            rememberDumpMetadata(tempFile, selectionContext, safeFileSegment);

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

    async function applyJsonDumpFromActiveDocument(targetOverride?: string, skipStepAfterInject = false): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        if (editor.document.languageId !== 'json') {
            vscode.window.showErrorMessage('Active document must be a JSON dump');
            return;
        }

        const debugSession = vscode.debug.activeDebugSession;
        if (!debugSession) {
            vscode.window.showErrorMessage('No active debug session to apply JSON changes.');
            return;
        }

        const metadata = targetOverride
            ? { expression: targetOverride }
            : getDumpMetadataForDocument(editor.document.uri);
        if (!metadata || !metadata.expression) {
            vscode.window.showErrorMessage('Could not determine the target expression for this JSON dump.');
            return;
        }

        const frameId = await resolveFrameId(debugSession);
        if (!frameId) {
            vscode.window.showErrorMessage('Could not determine stack frame. Pause on a breakpoint and try again.');
            return;
        }

        const jsonContent = editor.document.getText();
        if (!jsonContent || !jsonContent.trim()) {
            vscode.window.showErrorMessage('JSON document is empty.');
            return;
        }

        const jsonLiteral = toCSharpStringLiteral(jsonContent);
        const targetExpression = metadata.expression;
        const evalExpression = `Newtonsoft.Json.JsonConvert.PopulateObject(${jsonLiteral}, ${targetExpression});`;

        try {
            await debugSession.customRequest('evaluate', {
                expression: evalExpression,
                frameId,
                context: 'repl'
            });

            vscode.window.showInformationMessage(`Applied JSON changes to ${targetExpression}.`);
            if (!skipStepAfterInject && typeof lastStoppedThreadId === 'number') {
                try {
                    await debugSession.customRequest('stepIn', { threadId: lastStoppedThreadId });
                } catch (stepError) {
                    console.log('Step after JSON injection failed', stepError);
                }
            }
        } catch (error: any) {
            const message = error?.message || error?.toString() || 'Unknown error';
            vscode.window.showErrorMessage(`Failed to apply JSON changes: ${message}`);
        }
    }

    const deserializeJsonDumpCommand = vscode.commands.registerCommand('jsonViewer.deserializeJsonDump', async () => {
        await applyJsonDumpFromActiveDocument();
    });
    context.subscriptions.push(deserializeJsonDumpCommand);

    const injectJsonIntoSelectionCommand = vscode.commands.registerCommand('jsonViewer.injectJsonDumpIntoSelection', async () => {
        const jsonEditor = vscode.window.activeTextEditor;
        if (!jsonEditor || jsonEditor.document.languageId !== 'json') {
            vscode.window.showErrorMessage('Active document must be a JSON dump to inject.');
            return;
        }

        let selectedExpression = '';

        const candidateCodeEditor = (() => {
            if (lastFocusedCodeEditor && !lastFocusedCodeEditor.document.isClosed) {
                return lastFocusedCodeEditor;
            }
            return vscode.window.visibleTextEditors.find(e => e.document.languageId === 'csharp');
        })();

        if (candidateCodeEditor && !candidateCodeEditor.selection.isEmpty) {
            selectedExpression = candidateCodeEditor.document.getText(candidateCodeEditor.selection).trim();
        }

        if (!selectedExpression) {
            selectedExpression = (await vscode.window.showInputBox({
                prompt: 'Enter the debugger expression to populate',
                placeHolder: 'variableName.Property'
            }))?.trim() || '';
        }

        if (!selectedExpression) {
            vscode.window.showErrorMessage('Select or enter a variable/expression to inject into.');
            return;
        }

        await applyJsonDumpFromActiveDocument(selectedExpression, true);
    });
    context.subscriptions.push(injectJsonIntoSelectionCommand);

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
