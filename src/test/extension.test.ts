import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';
import { runUnlucky } from '../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	function makeTempDir(): string {
		return fs.mkdtempSync(path.join(os.tmpdir(), 'howsyurluck-test-'));
	}

	test('removes a file permanently and triggers message + audio', async () => {
		const dir = makeTempDir();
		const savedFile = path.join(dir, 'saved.txt');
		const victimFile = path.join(dir, 'victim.txt');
		fs.writeFileSync(savedFile, 'x');
		fs.writeFileSync(victimFile, 'y');

		const messages: string[] = [];
		let audioPlayed = false;

		const ok = await runUnlucky({
			soundPath: path.join(dir, 'fahhhhh.mp3'),
			context: {} as vscode.ExtensionContext,
			savedFilePath: savedFile,
			root: dir,
			onMessage: (msg) => { messages.push(msg); },
			onAudio: () => { audioPlayed = true; }
		});

		assert.strictEqual(ok, true, 'runUnlucky should return true when a file was removed');
		assert.strictEqual(fs.existsSync(savedFile), true, 'the saved file must never be removed');
		assert.strictEqual(fs.existsSync(victimFile), false, 'the unlucky file must be deleted');
		assert.strictEqual(messages.length, 1, 'exactly one message should be shown after removal');
		assert.match(messages[0], /BANG/, 'message should be the bang message');
		assert.strictEqual(audioPlayed, true, 'audio must be played when a file is removed');
	});

	test('does nothing (no message/audio) when roll would have no other files', async () => {
		const dir = makeTempDir();
		const savedFile = path.join(dir, 'saved.txt');
		fs.writeFileSync(savedFile, 'x');

		const messages: string[] = [];
		let audioPlayed = false;

		const ok = await runUnlucky({
			soundPath: path.join(dir, 'fahhhhh.mp3'),
			context: {} as vscode.ExtensionContext,
			savedFilePath: savedFile,
			root: dir,
			onMessage: (msg) => { messages.push(msg); },
			onAudio: () => { audioPlayed = true; }
		});

		assert.strictEqual(ok, false);
		assert.strictEqual(messages.length, 0, 'no message when nothing is removed');
		assert.strictEqual(audioPlayed, false, 'no audio when nothing is removed');
	});
});
