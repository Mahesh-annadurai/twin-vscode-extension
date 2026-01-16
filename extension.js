// Twin VS Code Extension – Groq Enabled Sidebar
// @ts-nocheck
/* eslint-disable */

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { availableTools, executeTool } = require('./tools');

// fallback for safety
const fetch = globalThis.fetch || require('node-fetch');
/**
 * Call Groq API
 */
async function callGroq(prompt, history = []) {
    if (!process.env.GROQ_API_KEY) {
        return 'Error: GROQ_API_KEY environment variable is not set.';
    }

    let messages = [
        { role: 'system', content: 'You are a helpful coding assistant. You have access to tools to read and list files in the workspace. When calling a tool, you must provide the arguments as a valid JSON object.' }
    ];

    // Append conversation history
    history.forEach(msg => {
        messages.push({
            role: msg.role === 'You' ? 'user' : 'assistant',
            content: msg.text
        });
    });

    messages.push({ role: 'user', content: prompt });

    try {
        // Loop to handle tool calls (max 5 turns to prevent infinite loops)
        for (let i = 0; i < 5; i++) {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'llama-3.1-8b-instant',
                    messages: messages,
                    tools: availableTools,
                    tool_choice: 'auto'
                })
            });

            const data = await response.json();

            if (!response.ok) {
                return `Groq API Error: ${data?.error?.message || JSON.stringify(data)}`;
            }

            const choice = data?.choices?.[0];
            const message = choice?.message;

            if (!message) return 'No response from Groq';

            // Check if the model wants to call tools
            if (message.tool_calls && message.tool_calls.length > 0) {
                messages.push(message); // Add assistant's tool request to history

                for (const toolCall of message.tool_calls) {
                    let toolResultContent;
                    try {
                        const toolName = toolCall.function.name;
                        const toolArgs = JSON.parse(toolCall.function.arguments);
                        toolResultContent = await executeTool(toolName, toolArgs);
                    } catch (e) {
                        toolResultContent = `Error: Invalid arguments for tool ${toolCall.function.name}. The model provided malformed JSON. The arguments were: ${toolCall.function.arguments}`;
                        console.error(toolResultContent, e);
                    }

                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: String(toolResultContent)
                    });
                }
            } else {
                return message.content || 'No content returned';
            }
        }
        return 'Error: Too many tool call iterations.';
    } catch (err) {
        console.error(err);
        return 'Error calling Groq API: ' + err.message;
    }
}

/**
 * Sidebar View Provider
 */
class TwinChatViewProvider {
    constructor(context) {
        this.context = context;

        // File path for chat history
        this.historyFilePath = path.join(
            context.globalStorageUri.fsPath,
            'chatHistory.json'
        );

        this.ensureStorage();
    }

    /**
     * Ensure storage directory & file exist
     */
    ensureStorage() {
        const dir = this.context.globalStorageUri.fsPath;

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        if (!fs.existsSync(this.historyFilePath)) {
            fs.writeFileSync(this.historyFilePath, JSON.stringify([]));
        }
    }

    /**
     * Read chat history from file
     */
    readHistoryFromFile() {
        try {
            const raw = fs.readFileSync(this.historyFilePath, 'utf-8');
            return JSON.parse(raw);
        } catch {
            return [];
        }
    }

    /**
     * Write chat history to file
     */
    writeHistoryToFile(history) {
        fs.writeFileSync(
            this.historyFilePath,
            JSON.stringify(history, null, 2)
        );
    }

   resolveWebviewView(webviewView) {
    this.webviewView = webviewView; //  save reference

    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml();

    let history = this.readHistoryFromFile();
    if (!history.length) {
        history = this.context.globalState.get('chatHistory', []);
    }

    webviewView.webview.postMessage({
        type: 'loadHistory',
        history
    });

    webviewView.webview.onDidReceiveMessage(async (message) => {
        if (message.type === 'userPrompt') {
            this.saveMessage('You', message.text);

            // Get history excluding the message we just saved
            const history = this.readHistoryFromFile().slice(0, -1);
            const reply = await callGroq(message.text, history);
            this.saveMessage('Twin', reply);

            webviewView.webview.postMessage({
                type: 'groqResponse',
                text: reply
            });
        }
    });
}


    saveMessage(role, text) {
        const history = this.readHistoryFromFile();

        history.push({ role, text });

        // Persist file
        this.writeHistoryToFile(history);

        // Sync globalState as backup
        this.context.globalState.update('chatHistory', history);
    }



    getHtml() {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">

<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>

<link rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github-dark.min.css">
<script src="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/lib/highlight.min.js"></script>

<style>
html, body {
    height: 100%;
    margin: 0;
}
body {
    font-family: Arial, sans-serif;
    display: flex;
    flex-direction: column;
    padding: 10px;
}
#chat {
    flex: 1;
    border: 1px solid #444;
    padding: 10px;
    overflow-y: auto;
    margin-bottom: 8px;
}
.message {
    margin-bottom: 12px;
}
pre {
    background: #0d1117;
    padding: 8px;
    border-radius: 6px;
    overflow-x: auto;
}
code {
    font-family: Consolas, monospace;
}
#input {
    width: 100%;
    padding: 8px;
}
</style>
</head>

<body>
<h3>Twin Chat</h3>
<div id="chat"></div>
<input id="input" placeholder="Ask Twin..." />

<script>
const vscode = acquireVsCodeApi();
const chat = document.getElementById('chat');
const input = document.getElementById('input');
let thinkingDiv = null;

function renderMessage(role, text, isThinking = false) {
    const div = document.createElement('div');
    div.className = 'message';

    if (isThinking) {
        div.innerHTML = '<b>' + role + ':</b><br><i>Thinking...</i>';
        thinkingDiv = div;
    } else {
        const html = marked.parse(text);
        div.innerHTML = '<b>' + role + ':</b><br>' + html;
    }

    chat.appendChild(div);

    if (!isThinking) {
        div.querySelectorAll('pre code').forEach(block => {
            hljs.highlightElement(block);
        });
    }

    chat.scrollTop = chat.scrollHeight;
}

input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
        const text = input.value.trim();
       renderMessage('You', text);
renderMessage('Twin', '', true); //  thinking indicator
vscode.postMessage({ type: 'userPrompt', text });

        input.value = '';
    }
});

window.addEventListener('message', event => {
    const msg = event.data;

    if (msg.type === 'groqResponse') {
    if (thinkingDiv) {
        thinkingDiv.remove();
        thinkingDiv = null;
    }
    renderMessage('Twin', msg.text);
}

    if (msg.type === 'loadHistory') {
        chat.innerHTML = '';
        msg.history.forEach(m => renderMessage(m.role, m.text));
    }
});
</script>
</body>
</html>`;
    }
}

function getActiveFileContext(editor) {
    if (!editor) return null;

    const document = editor.document;

    // Ignore very large files
    const MAX_FILE_CHARS = 8000;

    const fullText = document.getText();

    if (!fullText.trim()) return null;

    return fullText.slice(0, MAX_FILE_CHARS);
}

/**
 * Extension activation
 */
function activate(context) {
    console.log('Twin extension activated');

    const provider = new TwinChatViewProvider(context);

    // Register sidebar view
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'twinChatView',
            provider
        )
    );

    // Register Explain Selected Code command
    context.subscriptions.push(
        vscode.commands.registerCommand('twin.explainSelection', async () => {
            const editor = vscode.window.activeTextEditor;

            if (!editor) {
                vscode.window.showErrorMessage('No active editor found.');
                return;
            }

            const selection = editor.selection;
            const selectedText = editor.document.getText(selection);

            let contextText = selectedText;

if (!selectedText.trim()) {
    // No selection → use entire file
    contextText = getActiveFileContext(editor);

    if (!contextText) {
        vscode.window.showErrorMessage('No content found to explain.');
        return;
    }
}


            // Build contextual prompt
           const prompt = getContextualPrompt(
    selectedText.trim()
        ? 'Explain the selected code clearly.'
        : 'Explain this file clearly.',
    contextText
);


            // Save user intent
           provider.saveMessage(
    'You',
    selectedText.trim()
        ? 'Explain selected code'
        : 'Explain current file'
);


            // Call Groq
            const response = await callGroq(prompt);

            provider.saveMessage('Twin', response);

            // Send response to Twin Chat UI
            provider.webviewView?.webview.postMessage({
                type: 'groqResponse',
                text: response
            });
        })
    );
    context.subscriptions.push(
    vscode.commands.registerCommand('twin.explainAndInsert', async () => {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }

        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);

        if (!selectedText.trim()) {
            vscode.window.showErrorMessage('Please select some code.');
            return;
        }

        const prompt = getContextualPrompt(
            'Explain the following code clearly.',
            selectedText
        );

        provider.saveMessage('You', 'Explain and insert explanation as comment');

        const explanation = await callGroq(prompt);

        provider.saveMessage('Twin', explanation);

        // Insert explanation as comment
        const comment = formatAsComment(explanation, editor.document.languageId);

        await editor.edit(editBuilder => {
            editBuilder.insert(selection.start, comment + '\n\n');
        });

        provider.webviewView?.webview.postMessage({
            type: 'groqResponse',
            text: explanation
        });
    })
);

}
function formatAsComment(text, languageId) {
    const lines = text.split('\n');

    switch (languageId) {
        case 'javascript':
        case 'typescript':
        case 'java':
        case 'c':
        case 'cpp':
            return lines.map(l => `// ${l}`).join('\n');

        case 'python':
            return lines.map(l => `# ${l}`).join('\n');

        case 'html':
            return `<!--\n${lines.join('\n')}\n-->`;

        default:
            return lines.map(l => `// ${l}`).join('\n');
    }
}

function getContextualPrompt(userQuery, context) {
    if (!context || context.trim().length === 0) {
        return userQuery;
    }

    const MAX_CONTEXT_CHARS = 6000;
    const safeContext = context.slice(0, MAX_CONTEXT_CHARS);

    return `
You are a coding assistant.

Context:
${safeContext}

User question:
${userQuery}

Rules:
- Answer strictly based on the context
- If something is missing in the context, say so
`.trim();
}

function deactivate() {}

module.exports = { activate, deactivate };