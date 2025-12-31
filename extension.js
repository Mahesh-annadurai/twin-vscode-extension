// Twin VS Code Extension – Groq Enabled Sidebar
// @ts-nocheck
/* eslint-disable */

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

// Node 18+ has fetch; fallback for safety
const fetch = globalThis.fetch || require('node-fetch');

/**
 * Call Groq API
 */
async function callGroq(prompt) {
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [
                    { role: 'system', content: 'You are a helpful coding assistant.' },
                    { role: 'user', content: prompt }
                ]
            })
        });

        const data = await response.json();
        return data?.choices?.[0]?.message?.content || 'No response from Groq';
    } catch (err) {
        console.error(err);
        return 'Error calling Groq API';
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
        webviewView.webview.options = {
            enableScripts: true
        };

        webviewView.webview.html = this.getHtml();

        // Load history (file → fallback globalState)
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

                // Save user message
                this.saveMessage('You', message.text);

                const reply = await callGroq(message.text);

                // Save Twin reply
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

        // Persist to file
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

function renderMessage(role, text) {
    const div = document.createElement('div');
    div.className = 'message';
    const html = marked.parse(text);
    div.innerHTML = '<b>' + role + ':</b><br>' + html;
    chat.appendChild(div);

    div.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block);
    });

    chat.scrollTop = chat.scrollHeight;
}

input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
        const text = input.value.trim();
        renderMessage('You', text);
        vscode.postMessage({ type: 'userPrompt', text });
        input.value = '';
    }
});

window.addEventListener('message', event => {
    const msg = event.data;

    if (msg.type === 'groqResponse') {
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

/**
 * Extension activation
 */
function activate(context) {
    console.log('Twin extension activated');

    const provider = new TwinChatViewProvider(context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'twinChatView',
            provider
        )
    );
}

function deactivate() {}

module.exports = { activate, deactivate };
