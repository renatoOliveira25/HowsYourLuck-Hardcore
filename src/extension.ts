import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {

	console.log("How's Your Luck is active 😈");

	const soundPath = path.join(context.extensionPath, 'assets', 'fahhhhh.mp3');

	const disposable = vscode.workspace.onDidSaveTextDocument(async (document) => {

		const roll = Math.floor(Math.random() * 6) + 1;

		if (roll !== 1) {
			return;
		}

		if (!vscode.workspace.workspaceFolders) {
			return;
		}

		const root = vscode.workspace.workspaceFolders[0].uri.fsPath;

		await runUnlucky({
			soundPath,
			context,
			savedFilePath: document.uri.fsPath,
			root,
			onMessage: (msg) => vscode.window.showErrorMessage(msg),
			onAudio: (ctx, fp) => playGunshot(ctx, fp)
		});

	});

	context.subscriptions.push(disposable);
}

export interface UnluckyOptions {
	soundPath: string;
	context: vscode.ExtensionContext;
	savedFilePath: string;
	root: string;
	onMessage: (message: string) => void;
	onAudio: (context: vscode.ExtensionContext, filePath: string) => void;
}

export async function runUnlucky(options: UnluckyOptions): Promise<boolean> {
	const files = getAllFiles(options.root).filter(
		file => file !== options.savedFilePath
	);

	if (files.length === 0) {
		return false;
	}

	const unluckyFile = files[Math.floor(Math.random() * files.length)];

	try {

		await fs.promises.rm(unluckyFile, { force: true });

		const stillExists = fs.existsSync(unluckyFile);

		if (stillExists) {
			return false;
		}

		options.onAudio(options.context, options.soundPath);

		options.onMessage(`💀 BANG! Your luck ran out.`);

		return true;

	} catch (err) {

		console.error(err);

		return false;

	}
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

function playGunshot(context: vscode.ExtensionContext, filePath: string): void {
	const panel = vscode.window.createWebviewPanel(
		'howsYourLuckAudio',
		'Audio',
		vscode.ViewColumn.Beside,
		{ enableScripts: true, localResourceRoots: [vscode.Uri.file(path.dirname(filePath))] }
	);

	const audioUri = panel.webview.asWebviewUri(vscode.Uri.file(filePath));

	panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
</head>
<body style="display:none;">
	<audio id="player" src="${audioUri}"></audio>
	<script>
		const player = document.getElementById('player');
		player.play();
		player.onended = () => {
			acquireVsCodeApi().postMessage({ type: 'done' });
		};
	</script>
</body>
</html>`;

	panel.webview.onDidReceiveMessage((msg) => {
		if (msg.type === 'done') {
			panel.dispose();
		}
	});

	// Fallback: dispose the panel if playback never completes
	setTimeout(() => panel.dispose(), 5000);
}

export function deactivate() { }