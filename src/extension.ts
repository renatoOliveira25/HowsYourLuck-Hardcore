import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

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
	// Native playback is not subject to the browser autoplay policy, so it is
	// the reliable path on macOS (afplay) and Windows (PowerShell + MediaPlayer).
	// The webview is only a last-resort fallback (e.g. Linux without media players).
	runFirstAvailable(getNativeCandidates(filePath), () => {
		playInWebview(context, filePath);
	});
}

function getNativeCandidates(filePath: string): string[][] {
	switch (process.platform) {
		case 'win32':
			return [buildPowerShellCommand(filePath)];
		case 'darwin':
			return [['afplay', filePath]];
		default:
			return [
				['ffplay', '-nodisp', '-autoexit', '-loglevel', 'quiet', filePath],
				['mpg123', '-q', filePath],
				['mpg321', '-q', filePath],
				['paplay', filePath],
				['aplay', filePath]
			];
	}
}

function runFirstAvailable(candidates: string[][], onFail?: () => void): void {
	if (candidates.length === 0) {
		onFail?.();
		return;
	}

	const [args, ...rest] = candidates;
	const [command, ...commandArgs] = args;

	let child: ReturnType<typeof spawn> | undefined;

	try {
		child = spawn(command, commandArgs, { stdio: 'ignore' });
	} catch (err) {
		console.error("Erro ao tocar áudio:", err);
		runFirstAvailable(rest, onFail);
		return;
	}

	child.on('error', (err: NodeJS.ErrnoException) => {
		console.error(`Erro ao tocar áudio com "${command}":`, err.message);
		runFirstAvailable(rest, onFail);
	});

	child.on('exit', (code, signal) => {
		if (signal === null && code !== 0) {
			runFirstAvailable(rest, onFail);
		}
	});

	child.on('spawn', () => {
		child?.unref();
	});
}

function buildPowerShellCommand(filePath: string): string[] {
	const escaped = filePath.replace(/'/g, "''");

	const script = [
		"$ErrorActionPreference='SilentlyContinue'",
		'Add-Type -AssemblyName presentationCore',
		'$mp=New-Object System.Windows.Media.MediaPlayer',
		`$mp.Open('${escaped}')`,
		'$mp.Play()',
		'$deadline=(Get-Date).AddSeconds(30)',
		'while((Get-Date) -lt $deadline){',
		'  $done=$false',
		'  if($mp.NaturalDuration.HasTimeSpan){ $done=$mp.Position -ge $mp.NaturalDuration.TimeSpan }',
		'  else { $done=(-not $mp.IsPlaying) -and ($mp.Position.TotalMilliseconds -gt 0) }',
		'  if($done){ break }',
		'  Start-Sleep -Milliseconds 100',
		'}',
		'$mp.Stop()',
		'$mp.Close()'
	].join('\n');

	const encoded = Buffer.from(script, 'utf16le').toString('base64');

	return [
		'powershell',
		'-NoProfile',
		'-NonInteractive',
		'-ExecutionPolicy',
		'Bypass',
		'-WindowStyle',
		'Hidden',
		'-EncodedCommand',
		encoded
	];
}

function playInWebview(context: vscode.ExtensionContext, filePath: string): void {
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