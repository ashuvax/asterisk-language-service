import * as vscode from "vscode";
import {
	DefinitionProvider,
	Definition,
	Location,
	Position,
	TextDocument,
	HoverProvider,
	Hover,
	MarkdownString,
} from "vscode";
import * as fs from "fs";
import * as path from "path";

class AsteriskDefinitionProvider implements DefinitionProvider {
	provideDefinition(
		document: TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): vscode.ProviderResult<Definition> {
		const word = document.getText(document.getWordRangeAtPosition(position));
		const text = document.getText();
		const regex = new RegExp(`^same\\s*=>\\s*n\\s*\\(${word}\\)`, "m");
		const match = text.match(regex);
		if (match && match.index !== undefined) {
			const start = document.positionAt(match.index);
			const end = document.positionAt(match.index + match[0].length);
			return new Location(document.uri, new vscode.Range(start, end));
		}
		return null;
	}
}

class AsteriskHoverProvider implements HoverProvider {
	private documentation: any;

	constructor() {
		const filePath = path.join(__dirname, "../functions", "functions-16.json");
		const fileContent = fs.readFileSync(filePath, "utf-8");
		this.documentation = JSON.parse(fileContent);
	}

	provideHover(
		document: TextDocument,
		position: Position,
		token: vscode.CancellationToken
	): Hover | null {
		const wordRange = document.getWordRangeAtPosition(position);
		if (!wordRange) {
			return null;
		}

		const word = document.getText(wordRange);
		const entry = this.documentation[word];
		if (!entry) {
			return null;
		}

		const markdownString = new MarkdownString();
		markdownString.appendMarkdown(`**${word}**\n\n`);
		markdownString.appendMarkdown(`*Synopsis:* ${entry.synopsis}\n\n`);
		markdownString.appendMarkdown(`*Description:* ${entry.description}\n\n`);
		markdownString.appendMarkdown(`*Syntax:* \`${entry.syntax}\`\n\n`);

		if (entry.arguments.length > 0) {
			markdownString.appendMarkdown(`*Arguments:*\n\n`);
			for (const argument of entry.arguments) {
				markdownString.appendMarkdown(`- \`${argument.name}\` - ${argument.description}\n`);
			}
			markdownString.appendMarkdown(`\n`);
		}
		// see more - entry.link
		markdownString.appendMarkdown(`[See more](${entry.link})`);

		return new Hover(markdownString);
	}
}

function updateDiagnostics(
	document: vscode.TextDocument,
	collection: vscode.DiagnosticCollection
): void {
	if (document.languageId !== "asterisk") {
		return;
	}

	const diagnostics: vscode.Diagnostic[] = [];

	for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
		const lineOfText = document.lineAt(lineIndex);
		const line = lineOfText.text;

		// Skip comment lines
		if (line.trim().startsWith(";")) {
			continue;
		}

		const stack: { char: string; index: number }[] = [];
		let inString = false;
		let stringChar = '';

		for (let charIndex = 0; charIndex < line.length; charIndex++) {
			const char = line[charIndex];

			if (inString) {
				if (char === stringChar && line[charIndex - 1] !== '\\') {
					inString = false;
					stringChar = '';
				}
			} else {
				if (char === '"' || char === "'") {
					inString = true;
					stringChar = char;
				} else if (char === '{' || char === '[' || char === '(') {
					stack.push({ char, index: charIndex });
				} else if (char === '}' || char === ']' || char === ')') {
					const opening = stack.pop();
					if (opening === undefined) {
						const diagnostic = new vscode.Diagnostic(
							new vscode.Range(
								new vscode.Position(lineIndex, charIndex),
								new vscode.Position(lineIndex, charIndex + 1)
							),
							`Unmatched closing bracket: ${char}`,
							vscode.DiagnosticSeverity.Error
						);
						diagnostics.push(diagnostic);
					} else if (
						(char === '}' && opening.char !== '{') ||
						(char === ']' && opening.char !== '[') ||
						(char === ')' && opening.char !== '(')
					) {
						const diagnostic = new vscode.Diagnostic(
							new vscode.Range(
								new vscode.Position(lineIndex, charIndex),
								new vscode.Position(lineIndex, charIndex + 1)
							),
							`Unmatched closing bracket: ${char}`,
							vscode.DiagnosticSeverity.Error
						);
						diagnostics.push(diagnostic);
					}
				}
			}
		}

		while (stack.length > 0) {
			const opening = stack.pop();
			if (opening !== undefined) {
				const diagnostic = new vscode.Diagnostic(
					new vscode.Range(
						new vscode.Position(lineIndex, opening.index),
						new vscode.Position(lineIndex, opening.index + 1)
					),
					`Unmatched opening bracket: ${opening.char}`,
					vscode.DiagnosticSeverity.Error
				);
				diagnostics.push(diagnostic);
			}
		}
	}

	collection.set(document.uri, diagnostics);
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log(
		'Congratulations, your extension "asterisk-language-service" is now active!'
	);

	context.subscriptions.push(
		vscode.languages.registerDefinitionProvider(
			{ language: "asterisk" },
			new AsteriskDefinitionProvider()
		)
	);

	context.subscriptions.push(
		vscode.languages.registerHoverProvider(
			{ language: "asterisk" },
			new AsteriskHoverProvider()
		)
	);

	const diagnosticCollection =
		vscode.languages.createDiagnosticCollection("asterisk");
	context.subscriptions.push(diagnosticCollection);

	if (vscode.window.activeTextEditor) {
		updateDiagnostics(
			vscode.window.activeTextEditor.document,
			diagnosticCollection
		);
	}

	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument((event) => {
			updateDiagnostics(event.document, diagnosticCollection);
		})
	);
}

// This method is called when your extension is deactivated
export function deactivate() { }
