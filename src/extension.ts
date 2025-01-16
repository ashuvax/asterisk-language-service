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

class GoDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	public provideDocumentSymbols(
		document: vscode.TextDocument, token: vscode.CancellationToken):
		Thenable<vscode.DocumentSymbol[]> {
		// כל בלוק יהיה מסומן כסמל
		// בלוק מתחיל בשורה שמתחילה בסוגריים מרובעים ומסתיימת כשהיא מגיעה לשורה נוספת שיש בה סוגריים מרובעים ואו בסוף הקובץ
		const symbols: vscode.DocumentSymbol[] = [];
		let currentBlockName = "";
		let currentBlockStart = 0;
		let currentBlockEnd = 0;

		for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
			const lineOfText = document.lineAt(lineIndex);
			const line = lineOfText.text;

			// בדיקה האם זו שורת בלוק חדש
			const blockMatch = line.match(/^\[(.*?)\]/);
			if (blockMatch) {
				if (currentBlockName) {
					const range = new vscode.Range(
						new vscode.Position(currentBlockStart, 0),
						new vscode.Position(currentBlockEnd, line.length)
					);
					const symbol = new vscode.DocumentSymbol(
						currentBlockName,
						"",
						vscode.SymbolKind.Module,
						range,
						range
					);
					console.log(currentBlockName, currentBlockStart, currentBlockEnd);
					symbols.push(symbol);
				}
				currentBlockName = blockMatch[1];
				currentBlockStart = lineIndex;
			} else if (currentBlockName) {
				currentBlockEnd = lineIndex;
			}
		}

		if (currentBlockName) {
			const range = new vscode.Range(
				new vscode.Position(currentBlockStart, 0),
				new vscode.Position(currentBlockEnd, 0)
			);
			const symbol = new vscode.DocumentSymbol(
				currentBlockName,
				"",
				vscode.SymbolKind.Module,
				range,
				range
			);
			console.log(currentBlockName, currentBlockStart, currentBlockEnd);
			symbols.push(symbol);
		}

		return Promise.resolve(symbols);
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
	const functionNames = new Set<string>(); // אחסון שמות פונקציות בתוך בלוק
	let currentBlockName = ""; // שם הבלוק הנוכחי

	for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
		const lineOfText = document.lineAt(lineIndex);
		const line = lineOfText.text;

		// בדיקה האם זו שורת בלוק חדש
		const blockMatch = line.match(/^\[(.*?)\]/);
		if (blockMatch) {
			currentBlockName = blockMatch[1];
			functionNames.clear(); // ניקוי שמות הפונקציות עבור בלוק חדש
			continue;
		}

		// התעלמות משורות שמתחילות בהערות
		if (line.trim().startsWith(";")) {
			continue;
		}

		// בדיקה של כפילויות בשמות פונקציות
		const functionMatch = line.match(/same\s*=>\s*n\((.*?)\)/);
		if (functionMatch) {
			const functionName = functionMatch[1];
			if (functionNames.has(functionName)) {
				const diagnostic = new vscode.Diagnostic(
					new vscode.Range(
						new vscode.Position(lineIndex, 0),
						new vscode.Position(lineIndex, line.length)
					),
					`Duplicate function name "${functionName}" in block [${currentBlockName}].`,
					vscode.DiagnosticSeverity.Error
				);
				diagnostics.push(diagnostic);
			} else {
				functionNames.add(functionName);
			}
		}

		// בדיקה של סוגריים
		const stack: { char: string; index: number }[] = [];
		let inString = false; // משתנה למעקב אחרי מחרוזת
		let stringChar = ""; // סוג סוגר המחרוזת (או ' או ")

		for (let charIndex = 0; charIndex < line.length; charIndex++) {
			const char = line[charIndex];

			// סיום עיבוד השורה אם יש הערה (;) מחוץ למחרוזת
			if (char === ";" && !inString) {
				break;
			}

			// בדיקה אם נמצאים בתוך מחרוזת
			if (inString) {
				if (char === stringChar && line[charIndex - 1] !== "\\" && line[charIndex + 1] !== stringChar) {
					inString = false;
					stringChar = "";
				}
			} else {
				if (char === '"' || char === "'") {
					inString = true;
					stringChar = char;
				} else if (char === "{" || char === "[" || char === "(") {
					stack.push({ char, index: charIndex });
				} else if (char === "}" || char === "]" || char === ")") {
					const opening = stack.pop();
					if (!opening) {
						const diagnostic = new vscode.Diagnostic(
							new vscode.Range(
								new vscode.Position(lineIndex, 0),
								new vscode.Position(lineIndex, line.length)
							),
							`Unmatched closing bracket: ${char}. Expected a matching opening bracket.`,
							vscode.DiagnosticSeverity.Error
						);
						diagnostics.push(diagnostic);
					} else if (
						(char === "}" && opening.char !== "{") ||
						(char === "]" && opening.char !== "[") ||
						(char === ")" && opening.char !== "(")
					) {
						const diagnostic = new vscode.Diagnostic(
							new vscode.Range(
								new vscode.Position(lineIndex, 0),
								new vscode.Position(lineIndex, line.length)
							),
							`Mismatched closing bracket: ${char}. Expected '${getExpectedClosingBracket(opening.char)}'.`,
							vscode.DiagnosticSeverity.Error
						);
						diagnostics.push(diagnostic);
					}
				}
			}
		}

		// בדיקה אם נשארו סוגריים פתוחים שלא נסגרו
		while (stack.length > 0) {
			const opening = stack.pop();
			if (opening) {
				const diagnostic = new vscode.Diagnostic(
					new vscode.Range(
						new vscode.Position(lineIndex, 0),
						new vscode.Position(lineIndex, line.length)
					),
					`Unmatched opening bracket: ${opening.char}. Expected '${getExpectedClosingBracket(opening.char)}'.`,
					vscode.DiagnosticSeverity.Error
				);
				diagnostics.push(diagnostic);
			}
		}
	}

	collection.set(document.uri, diagnostics);
}

function getExpectedClosingBracket(opening: string): string {
	switch (opening) {
		case "{":
			return "}";
		case "[":
			return "]";
		case "(":
			return ")";
		default:
			return "";
	}
}

export function activate(context: vscode.ExtensionContext) {
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

	context.subscriptions.push(
		vscode.languages.registerDocumentSymbolProvider(
			{ language: "asterisk" },
			new GoDocumentSymbolProvider())
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

export function deactivate() { }
