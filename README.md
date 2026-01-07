Twin – AI Copilot-Style VS Code Extension

Twin is a Copilot-style AI assistant for Visual Studio Code, developed as part of an internship project.
It provides a sidebar-based chat interface for code generation, explanation, and developer assistance, powered by the Groq LLM.

The project focuses on clean architecture, extensibility, and correct state persistence rather than surface-level UI features.

Features

Sidebar-based chat interface inside Visual Studio Code

AI-powered responses using the Groq LLM

Code generation and explanation capabilities

Markdown-rendered responses with syntax highlighting

Persistent chat history using file-based storage

Chat history restored across VS Code sessions

Clear separation between extension logic and UI logic

Tech Stack

JavaScript (Node.js)

Visual Studio Code Extension API

VS Code Webviews (HTML, CSS, JavaScript)

Groq API (OpenAI-compatible endpoint)

marked (Markdown rendering)

highlight.js (Syntax highlighting)

VS Code global storage for persistence

Architecture Overview

The extension follows a message-driven architecture where the UI and extension logic are clearly separated.

Webview (UI)
  → postMessage()
Extension (Node.js)
  → Groq API
  → postMessage()
Webview (Rendered Output)

Persistence Strategy

Chat history is stored in a JSON file using context.globalStorageUri

globalState is retained as a fallback mechanism

File-based persistence enables durability across sessions and easier debugging

Project Structure
twin/
├── extension.js          # Extension entry point and core logic
├── package.json          # Extension manifest
├── media/                # Icons and assets
├── .gitignore
├── README.md

Environment Setup

The extension uses environment variables for API configuration.

Set the Groq API key before running the extension:

Windows (PowerShell)
set GROQ_API_KEY=your_api_key_here

macOS / Linux
export GROQ_API_KEY=your_api_key_here


API keys are not hardcoded and are excluded from version control.

Running the Extension Locally

Clone the repository

Open the project in Visual Studio Code

Press F5 to launch the Extension Development Host

Open the Twin sidebar from the Activity Bar

Start interacting with the assistant

Current Status

Core extension architecture implemented

Sidebar chat UI completed

Groq LLM integration in place

Markdown rendering and syntax highlighting enabled

File-based chat persistence implemented

Planned Enhancements

Copy button for code blocks

Tool calling support (insert generated code, explain selected code)

Multiple chat sessions

UI and accessibility improvements

Author

Mahesh Annadurai
This project was developed as part of an internship to explore AI-assisted developer tooling and VS Code extension development.

License

This project is intended for learning and demonstration purposes.
