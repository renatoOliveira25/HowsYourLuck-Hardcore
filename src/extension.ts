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
	try {
		const panel = vscode.window.createWebviewPanel(
			'howsYourLuckAudio',
			'Audio',
			vscode.ViewColumn.Beside,
			{ enableScripts: true, localResourceRoots: [vscode.Uri.file(path.dirname(filePath))] }
		);

		const audioUri = panel.webview.asWebviewUri(vscode.Uri.file(filePath));

		panel.webview.html = buildAudioHtml(audioUri.toString());

		let disposed = false;

		const disposePanel = () => {
			if (!disposed) {
				disposed = true;
				panel.dispose();
			}
		};

		panel.webview.onDidReceiveMessage((msg) => {
			if (msg.type === 'done' || msg.type === 'error') {
				disposePanel();
			}
		});

		// Fallback: never leak an empty webview panel
		const fallbackTimeout = setTimeout(disposePanel, 6000);

		panel.onDidDispose(() => {
			clearTimeout(fallbackTimeout);
		});
	} catch (err) {
		console.error("Erro ao criar player de áudio:", err);
	}
}

export function buildAudioHtml(audioUri: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
</head>
<body style="display:none;">
	<audio id="player" src="${audioUri}" preload="auto" autoplay></audio>
	<script>
		const player = document.getElementById('player');
		const vscode = acquireVsCodeApi();

		const finish = (type) => vscode.postMessage({ type });

		player.onended = () => finish('done');
		player.onerror = () => finish('error');

		const ATTEMPTS = 40;
		const INTERVAL = 150;

		function tryPlay(attempt) {
			try {
				const p = player.play();
				if (p && typeof p.then === 'function') {
					p.then(() => {
						clearRetry();
					}).catch((err) => {
						if (attempt < ATTEMPTS) {
							retryTimer = setTimeout(() => tryPlay(attempt + 1), INTERVAL);
						} else {
							playViaWebAudio();
						}
					});
				}
			} catch (err) {
				if (attempt < ATTEMPTS) {
					retryTimer = setTimeout(() => tryPlay(attempt + 1), INTERVAL);
				} else {
					playViaWebAudio();
				}
			}
		}

		let retryTimer;

		function clearRetry() {
			clearTimeout(retryTimer);
		}

		function playViaWebAudio() {
			if (!window.AudioContext && !window.webkitAudioContext) {
				console.error('Web Audio API not available');
				finish('error');
				return;
			}

			const Ctx = window.AudioContext || window.webkitAudioContext;
			const audioContext = new Ctx();

			const ctxState = (audioContext.state && audioContext.state === 'suspended')
				? audioContext.resume()
				: Promise.resolve();

			ctxState
				.then(() => fetch(${JSON.stringify(audioUri)}))
				.then((res) => {
					if (!res.ok) {
						throw new Error('HTTP ' + res.status);
					}
					return res.arrayBuffer();
				})
				.then((buffer) => audioContext.decodeAudioData(buffer))
				.then((audioBuffer) => {
					const source = audioContext.createBufferSource();
					source.buffer = audioBuffer;
					source.connect(audioContext.destination);
					source.onended = () => {
						audioContext.close();
						finish('done');
					};
					source.start(0);
				})
				.catch((err) => {
					console.error('Web Audio playback failed:', err);
					finish('error');
				});
		}

		// Wait for the media to be loadable before attempting playback,
		// then retry within the transient user activation window.
		if (player.readyState >= 2) {
			tryPlay(0);
		} else {
			player.addEventListener('canplay', () => tryPlay(0), { once: true });
			player.load();
		}

		// Last resort: play on the next real interaction with the panel.
		document.addEventListener('pointerdown', () => {
			if (player.paused) {
				tryPlay(0);
			}
		}, { once: true });
	</script>
</body>
</html>`;
}

export function deactivate() { }