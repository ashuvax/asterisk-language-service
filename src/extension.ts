import * as vscode from 'vscode';
import { DefinitionProvider, Definition, Location, Position, TextDocument } from 'vscode';

class AsteriskDefinitionProvider implements DefinitionProvider {
	provideDefinition(document: TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<Definition> {
		const word = document.getText(document.getWordRangeAtPosition(position));
		const text = document.getText();
		const regex = new RegExp(`^same\\s*=>\\s*n\\s*\\(${word}\\)`, 'm');
		const match = text.match(regex);
		if (match && match.index !== undefined) {
			const start = document.positionAt(match.index);
			const end = document.positionAt(match.index + match[0].length);
			return new Location(document.uri, new vscode.Range(start, end));
		}
		return null;
	}
}


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "asterisk-language-service" is now active!');

	context.subscriptions.push(vscode.languages.registerDefinitionProvider(
		{ language: 'asterisk' },
		new AsteriskDefinitionProvider()
	));
}

// This method is called when your extension is deactivated
export function deactivate() { }
