
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const availableTools = [
    {
        type: "function",
        function: {
            name: "list_files",
            description: "List files in the current workspace or a specific directory. Use this to discover file structure.",
            parameters: {
                type: "object",
                properties: {
                    dirPath: {
                        type: "string",
                        description: "Relative path to list files from. Defaults to root ('.')."
                    }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "read_file",
            description: "Read the contents of a file. Use this to inspect code.",
            parameters: {
                type: "object",
                properties: {
                    filePath: {
                        type: "string",
                        description: "Relative path of the file to read"
                    }
                },
                required: ["filePath"]
            }
        }
    }
];

async function executeTool(name, args) {
    console.log(`Executing tool: ${name} with args:`, args);
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return "No workspace open.";
    }
    const rootPath = workspaceFolders[0].uri.fsPath;

    try {
        if (name === "list_files") {
            const dirPath = args.dirPath || '.';
            const targetDir = path.join(rootPath, dirPath);
            const files = await fs.promises.readdir(targetDir);
            const result = files.join('\n');
            if (result.length > 4000) return result.slice(0, 4000) + '\n... (truncated)';
            return result;
        } else if (name === "read_file") {
            const targetFile = path.join(rootPath, args.filePath);
            const content = await fs.promises.readFile(targetFile, 'utf-8');
            if (content.length > 4000) return content.slice(0, 4000) + '\n... (truncated)';
            return content;
        }
        return "Unknown tool";
    } catch (err) {
        return `Error executing tool ${name}: ${err.message}`;
    }
}

module.exports = { availableTools, executeTool };