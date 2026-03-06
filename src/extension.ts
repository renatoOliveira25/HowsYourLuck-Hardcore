import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {

	console.log("How's Your Luck is active 😈");

	const disposable = vscode.workspace.onDidSaveTextDocument(async (document) => {

		const roll = Math.floor(Math.random() * 6) + 1;

		vscode.window.showInformationMessage(`🎲 Chamber roll: ${roll} / 6`);

		if (roll !== 1) {
			return;
		}

		vscode.window.showWarningMessage("🎲 Spinning the chamber...");

		const workspaceFolders = vscode.workspace.workspaceFolders;

		if (!workspaceFolders) {
			return;
		}

		const root = workspaceFolders[0].uri.fsPath;

		const files = getAllFiles(root).filter(
			file => file !== document.uri.fsPath
		);

		if (files.length === 0) {
			return;
		}

		const unluckyFile = files[Math.floor(Math.random() * files.length)];

		try {

			await vscode.workspace.fs.delete(vscode.Uri.file(unluckyFile));

			vscode.window.showErrorMessage(
				`💀 BANG! Your luck ran out.`
			);

		} catch (err) {

			console.error(err);

		}

	});

	context.subscriptions.push(disposable);
}

function getAllFiles(dir: string): string[] {

	let results: string[] = [];

	const ignore = [
		'.vscode',
		'dist',
		'node_modules',
		'.git',
		'build',
		'.next',
		'out'
	];

	const list = fs.readdirSync(dir);

	list.forEach(file => {

		const filePath = path.join(dir, file);

		if (ignore.some(i => filePath.includes(i))) {
			return;
		}

		const stat = fs.statSync(filePath);

		if (stat && stat.isDirectory()) {

			results = results.concat(getAllFiles(filePath));

		} else {

			results.push(filePath);

		}

	});

	return results;
}

export function deactivate() {}