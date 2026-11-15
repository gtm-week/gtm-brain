// This file plays the plugin from before layout 4 (GTM_BRAIN_TEST_LAYOUT=3: about-us/, config/, brain/ and work/). Layout 4
// (configuration/, entities/, memories/) is covered by layout-four.test.mjs and the files that run on both layouts.
process.env.GTM_BRAIN_TEST_LAYOUT = "3";
process.env.GTM_BRAIN_NO_COMPILE = '1';
process.env.GTM_BRAIN_NO_WATCH = '1';
process.env.GTM_BRAIN_NO_COMMIT = '1';
// Big files (0.35.0): a recording or a file over 25 MB never goes into git. The note keeps a pointer built by
// lib/pointers.mjs bigFilePointer; add-file.mjs --big and --drive run the walk-through's two paths; onboarding
// asks the setting once and the answer is a note read by bigFilesChoice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, existsSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import * as lib from '../lib/brain.mjs';
import { bigFilePointer, isRecording } from '../lib/pointers.mjs';
import { placeBigFile } from '../lib/assets.mjs';
const P = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
const LINK = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQ/view?usp=sharing';

function fixture(t, { admin = {} } = {}) {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'gtm-big-files-')));
  t.after(() => { try { rmSync(scratch, { recursive: true, force: true }); } catch {} });
  const root = join(scratch, 'brain'), outside = join(scratch, 'downloads'), big = join(scratch, 'big');
  for (const d of [join(root, 'brain'), join(root, 'work'), outside]) mkdirSync(d, { recursive: true });
  const write = extra => writeFileSync(join(root, 'brain/admin.md'), lib.renderFrontmatter({ company: 'Reflow', owner: 'alex', dashboard: 'on-demand', tools: [], team: [{ name: 'Alex Example', handle: 'alex', email: 'alex@reflow.invalid' }], ...admin, ...extra }) + '\n# Reflow\n');
  write();
  writeFileSync(join(root, 'work/person.json'), JSON.stringify({ handle: 'alex' }));
  lib.writeContext(root, 'company', { title: 'Our company', rule: 'Test.', summary: 'Nothing here yet.', now: '' });
  const script = join(P, 'skills/gtm-brain-add-file/add-file.mjs');
  const run = (...args) => JSON.parse(execFileSync(process.execPath, [script, root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  const fail = (...args) => { try { execFileSync(process.execPath, [script, root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return String(e.stderr); } assert.fail('expected a refusal'); };
  return { scratch, root, outside, big, run, fail, admin: write };
}

test('a Google Drive pointer is {kind, account, ref, url}: from the link, from the id, and refused for anything else', () => {
  assert.deepEqual(bigFilePointer('google-drive', { url: LINK, account: 'Alex@Reflow.io' }), { kind: 'google-drive', account: 'alex@reflow.io', ref: '1AbCdEfGhIjKlMnOpQ', url: LINK });
  assert.deepEqual(bigFilePointer('google-drive', { ref: LINK }), { kind: 'google-drive', ref: '1AbCdEfGhIjKlMnOpQ', url: LINK }, 'a link passed as ref is read as the link');
  assert.deepEqual(bigFilePointer('google-drive', { ref: '1AbCdEfGhIjKlMnOpQ' }), { kind: 'google-drive', ref: '1AbCdEfGhIjKlMnOpQ' });
  const doc = 'https://docs.google.com/document/d/1ZyXwVuTsRqPoNmLk/edit';
  assert.equal(bigFilePointer('google-drive', { url: doc }).ref, '1ZyXwVuTsRqPoNmLk');
  assert.throws(() => bigFilePointer('google-drive', { url: LINK, ref: 'someotherfileid' }), /names file 1AbCdEfGhIjKlMnOpQ/);
  assert.throws(() => bigFilePointer('google-drive', { url: 'https://www.dropbox.com/s/abc/call.mp4' }), /not a Google Drive link/);
  assert.throws(() => bigFilePointer('google-drive', { ref: 'short' }), /Drive link or its file id/);
  assert.throws(() => bigFilePointer('dropbox', { ref: 'x' }), /google-drive or local/);
  // the pointer is a source remember takes as it is, one record, url kept
  assert.deepEqual(lib.parseSources([bigFilePointer('google-drive', { url: LINK, account: 'alex@reflow.io' })]), [{ kind: 'google-drive', account: 'alex@reflow.io', ref: '1AbCdEfGhIjKlMnOpQ', url: LINK }]);
});

test('a local pointer is {kind: file, ref: absolute path}, in the big-files folder and never inside the brain', () => {
  assert.deepEqual(bigFilePointer('local', { path: '/Volumes/Media/reflow/call.mp4' }, { root: '/Users/a/brain', folder: '/Volumes/Media/reflow' }), { kind: 'file', ref: '/Volumes/Media/reflow/call.mp4' });
  assert.throws(() => bigFilePointer('local', { path: 'call.mp4' }), /absolute path/);
  assert.throws(() => bigFilePointer('local', { path: '/Users/a/brain/projects/call.mp4' }, { root: '/Users/a/brain' }), /inside the brain/);
  assert.throws(() => bigFilePointer('local', { path: '/tmp/call.mp4' }, { folder: '/Volumes/Media/reflow' }), /not in the big-files folder/);
  assert.deepEqual(lib.parseSources([{ kind: 'file', ref: '/Volumes/Media/reflow/call.mp4' }]), [{ kind: 'file', ref: '/Volumes/Media/reflow/call.mp4' }]);
});

test('recordings are audio and video by extension, at any size', () => {
  for (const name of ['call.mp4', 'Keynote Recording.MOV', 'memo.m4a', 'standup.wav', 'demo.webm', 'note.mp3']) assert.ok(isRecording(name), name);
  for (const name of ['deck.pdf', 'logo.png', 'notes.md', 'movie-plan.txt', 'mp4']) assert.equal(isRecording(name), false, name);
});

test('add-file refuses a small recording with the big-files advice and lands nothing in the brain', t => {
  const f = fixture(t); writeFileSync(join(f.outside, 'discovery-call.m4a'), 'audio');
  lib.addName(f.root, 'Acme', { kind: 'organization' });
  const out = f.fail('--file', join(f.outside, 'discovery-call.m4a'), '--entity', 'Acme');
  assert.match(out, /discovery-call\.m4a is a recording: recordings stay out of git, not kept/);
  assert.ok(out.includes(lib.bigFileAdvice(f.root)));
  assert.match(out, /big-files walk-through \(gtm-brain-use-brain\/references\/big-files\.md\)/);
  assert.match(out, /"Reflow GTM Brain files"/, 'the one named Drive folder');
  assert.match(out, /\{kind: google-drive, account, ref, url\}/);
  assert.match(out, /not connected in this Codex, say so and ask for the file's Drive link/);
  assert.equal(execFileSync('find', [join(f.root, 'brain'), '-name', '*.m4a'], { encoding: 'utf8' }).trim(), '', 'no bytes landed');
});

test('google-drive: --big names the Drive folder and copies nothing; --drive turns the link into the pointer', t => {
  const f = fixture(t); writeFileSync(join(f.outside, 'call.mp4'), 'video');
  const big = f.run('--file', join(f.outside, 'call.mp4'), '--big');
  assert.equal(big.big, true); assert.equal(big.mode, 'google-drive'); assert.equal(big.recording, true);
  assert.equal(big.drive_folder, 'Reflow GTM Brain files'); assert.equal(big.pointer, undefined);
  assert.deepEqual(big.choice, { asked: false, choice: null, setting: 'google-drive', approval: false });
  assert.match(big.note, /--drive <its link>/);
  const drive = f.run('--drive', LINK, '--account', 'alex@reflow.io');
  assert.deepEqual(drive.pointer, { kind: 'google-drive', account: 'alex@reflow.io', ref: '1AbCdEfGhIjKlMnOpQ', url: LINK });
  assert.match(f.fail('--drive', 'https://example.com/call.mp4'), /not a Google Drive link/);
  assert.match(f.fail('--drive'), /usage: add-file\.mjs <root> --drive/);
  f.admin({ big_files_drive_folder: 'Sales recordings' });
  assert.equal(f.run('--drive', LINK).drive_folder, 'Sales recordings', 'big_files_drive_folder names another folder');
  assert.ok(existsSync(join(f.outside, 'call.mp4')), 'the original is untouched');
});

test('local: --big copies into the big-files folder, checks it, prints the file pointer and never touches the original', t => {
  const f = fixture(t, { admin: {} }); f.admin({ big_files: 'local', big_files_folder: join(realpathSync(tmpdir()), `gtm-big-local-${process.pid}-${Date.now()}`) });
  const folder = lib.bigFiles(f.root).folder; t.after(() => { try { rmSync(folder, { recursive: true, force: true }); } catch {} });
  writeFileSync(join(f.outside, 'call.mp4'), 'video one');
  const first = f.run('--file', join(f.outside, 'call.mp4'), '--big');
  assert.equal(first.mode, 'local'); assert.equal(first.copied, true);
  assert.equal(first.path, join(realpathSync(folder), 'call.mp4'));
  assert.deepEqual(first.pointer, { kind: 'file', ref: first.path });
  assert.equal(readFileSync(first.path, 'utf8'), 'video one');
  assert.ok(existsSync(join(f.outside, 'call.mp4')), 'the original stays');
  assert.deepEqual(first.choice, { asked: true, choice: 'local', setting: 'local', approval: false }, 'admin.md already saying local is a choice made');
  const again = f.run('--file', join(f.outside, 'call.mp4'), '--big');
  assert.equal(again.copied, false); assert.equal(again.path, first.path, 'the same bytes are reused');
  writeFileSync(join(f.outside, 'call.mp4'), 'video two');
  const other = f.run('--file', join(f.outside, 'call.mp4'), '--big');
  assert.equal(other.path, join(realpathSync(folder), 'call-2.mp4'), 'other bytes, same name: a free name, never an overwrite');
  assert.equal(readFileSync(first.path, 'utf8'), 'video one');
  const inFolder = f.run('--file', first.path, '--big');
  assert.deepEqual([inFolder.copied, inFolder.path], [false, first.path], 'a file already in the folder is pointed at where it is');
  assert.deepEqual(readdirSync(folder).sort(), ['call-2.mp4', 'call.mp4']);
  assert.throws(() => placeBigFile(f.root, join(f.outside, 'nope.mp4')), /no file at/);
  f.admin({ big_files: 'google-drive' });
  assert.throws(() => placeBigFile(f.root, join(f.outside, 'call.mp4')), /Google Drive/);
});

test('save and the chat start keep a small recording out of git and name it', t => {
  const f = fixture(t);
  execFileSync('git', ['init', '-q', f.root]);
  mkdirSync(join(f.root, 'projects/acme'), { recursive: true });
  writeFileSync(join(f.root, 'projects/acme/discovery.mp3'), Buffer.alloc(3 * 1048576));
  writeFileSync(join(f.root, 'projects/acme/notes.md'), '# Notes\n');
  const large = lib.largeUnsaved(f.root);
  assert.deepEqual(large.map(x => x.path), ['projects/acme/discovery.mp3']);
  assert.ok(lib.savePathsFor(f.root).includes(':(exclude,literal)projects/acme/discovery.mp3'));
  const note = lib.largeNote(large, f.root);
  assert.match(note, /^Recordings stay out of git, not kept: projects\/acme\/discovery\.mp3 \(3\.0 MB\)\. Follow the big-files walk-through/);
  assert.match(lib.largeNote([{ path: 'a.mov', size: 30 * 1048576 }, { path: 'b.mp3', size: 1048576 }], f.root), /^Too big for git, not kept \(over 25 MB\): a\.mov \(30 MB\)\. Recordings stay out of git, not kept: b\.mp3 \(1\.0 MB\)\./);
});

test('the big-files question: not asked until its answer note exists; local waits for APPROVE; the onboarding line follows', t => {
  const f = fixture(t);
  assert.deepEqual(lib.bigFilesChoice(f.root), { asked: false, choice: null, at: null, id: null, setting: 'google-drive', folder: null, approval: false });
  lib.appendMemory(f.root, 'company', { authors: ['alex'], content: `Onboarding: pending v${lib.ONBOARDING_VERSION} since 2026-11-14.`, tags: ['onboarding'] });
  const pending = lib.onboardingInstruction(f.root, { unattended: false });
  assert.match(pending, /ONBOARDING pending/);
  assert.match(pending, /Big files: not asked yet\. Ask once, in discovery Step 1 before the workplace draft/);
  assert.match(pending, /"Big files: google-drive\." or "Big files: local\." in company/);
  const { rec } = lib.appendMemory(f.root, 'company', { authors: ['alex'], content: lib.bigFilesAnswer('local'), tags: ['onboarding', 'big-files'], source: [{ kind: 'user', ref: 'alex' }] });
  const local = lib.bigFilesChoice(f.root);
  assert.deepEqual([local.asked, local.choice, local.id, local.setting, local.approval], [true, 'local', rec.id, 'google-drive', true], 'the answer is saved; admin.md changes only through APPROVE');
  assert.match(lib.onboardingInstruction(f.root, { unattended: false }), /Big files: answered \(local\); brain\/admin\.md still says big_files: google-drive, so the workplace draft for APPROVE carries big_files: local\. Do not ask again\./);
  f.admin({ big_files: 'local' });
  assert.equal(lib.bigFilesChoice(f.root).approval, false, 'approved: the setting and the answer agree');
  assert.match(lib.onboardingInstruction(f.root, { unattended: false }), /Big files: answered \(local\)\. Do not ask again\./);
  lib.appendMemory(f.root, 'company', { authors: ['alex'], content: lib.bigFilesAnswer('google-drive'), supersedes: rec.id, tags: ['onboarding', 'big-files'] });
  assert.equal(lib.bigFilesChoice(f.root).choice, 'google-drive', 'a corrected answer supersedes the first');
  assert.equal(lib.readOnboarding(f.root).steps.length, 0, 'the answer is not an onboarding step outcome');
});

test('the walk-through is one reference the start skill, discovery and the saving path all link to', () => {
  const read = p => readFileSync(join(P, p), 'utf8');
  const guide = read('skills/gtm-brain-use-brain/references/big-files.md');
  for (const p of ['skills/gtm-brain-start/SKILL.md', 'skills/gtm-brain-start/references/discovery.md', 'skills/gtm-brain-use-brain/references/files.md', 'skills/gtm-brain-use-brain/references/save.md', 'skills/gtm-brain-use-brain/SKILL.md']) assert.match(read(p), /big-files\.md\)/, p);
  assert.ok(lib.BIG_FILES_GUIDE.endsWith('references/big-files.md') && existsSync(join(P, 'skills', lib.BIG_FILES_GUIDE)));
  assert.match(guide, /--big/); assert.match(guide, /--drive "<link or file id>" --account/);
  assert.match(guide, /never Computer Use/i); assert.match(guide, /Never commit the bytes/);
  assert.match(guide, /ask for the file's Drive link instead/);
  const discovery = read('skills/gtm-brain-start/references/discovery.md');
  assert.match(discovery, /Where big files go: the one question before the draft/);
  assert.match(discovery, /"Google Drive, shared with the team", "This computer only"/, 'recommended option first');
  assert.match(discovery, /`Big files: google-drive\.` or `Big files: local\.`/);
  assert.match(read('skills/gtm-brain-start/references/questions.md'), /Where big files go.*Google Drive, shared with the team \(Recommended\); This computer only/);
});

// Review round (lane M): the cases the first tests could not fail on.
test('save itself leaves a new recording uncommitted, keeps the rest, and still saves a recording git already holds', t => {
  const f = fixture(t), git = (...a) => execFileSync('git', ['-C', f.root, ...a], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', f.root]); git('config', 'user.email', 'alex@reflow.invalid'); git('config', 'user.name', 'Alex');
  writeFileSync(join(f.root, '.gitignore'), 'work/\n');
  mkdirSync(join(f.root, 'projects/acme'), { recursive: true });
  writeFileSync(join(f.root, 'projects/acme/jingle.mp3'), 'kept before 0.35.0'); git('add', '-A'); git('commit', '-qm', 'before the rule');
  writeFileSync(join(f.root, 'projects/acme/jingle.mp3'), 'a new cut of the jingle');
  writeFileSync(join(f.root, 'projects/acme/discovery.m4a'), 'audio');
  writeFileSync(join(f.root, 'projects/acme/notes.md'), '# Notes\n');
  assert.deepEqual(lib.largeUnsaved(f.root), [{ path: 'projects/acme/discovery.m4a', size: 5 }], 'only the recording git does not hold yet');
  // save honours GTM_BRAIN_NO_COMMIT (0.35.0): this test is about what a real save commits, so the flag is lifted for it
  delete process.env.GTM_BRAIN_NO_COMMIT;
  let r; try { r = lib.save(f.root, 'notes and the new cut'); } finally { process.env.GTM_BRAIN_NO_COMMIT = '1'; }
  assert.ok(r.ok, r.note);
  assert.match(r.note, /Recordings stay out of git, not kept: projects\/acme\/discovery\.m4a/);
  assert.doesNotMatch(r.note.split('Recordings stay out of git')[1], /jingle/);
  assert.deepEqual(git('ls-files', 'projects').trim().split('\n'), ['projects/acme/jingle.mp3', 'projects/acme/notes.md']);
  assert.equal(git('status', '--short').trim(), '?? projects/acme/discovery.m4a', 'the edit to the tracked recording is committed, the new recording is not');
  assert.equal(git('show', 'HEAD:projects/acme/jingle.mp3'), 'a new cut of the jingle');
});

test('local: a big-files folder that resolves into the brain is refused before a byte is copied', t => {
  const f = fixture(t); mkdirSync(join(f.root, 'projects'), { recursive: true });
  const link = join(f.scratch, 'media'); symlinkSync(join(f.root, 'projects'), link);
  f.admin({ big_files: 'local', big_files_folder: link });
  writeFileSync(join(f.outside, 'call.mp4'), 'video');
  assert.match(f.fail('--file', join(f.outside, 'call.mp4'), '--big'), /is inside the brain, so git would keep the file/);
  assert.deepEqual(readdirSync(join(f.root, 'projects')), [], 'nothing was copied into the brain');
});

test('a Drive pointer names a file: a folder link and a link without a file id are refused', () => {
  assert.throws(() => bigFilePointer('google-drive', { url: 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQ' }), /is a Drive folder/);
  assert.throws(() => bigFilePointer('google-drive', { ref: 'https://drive.google.com/open?id=abc' }), /no file id/);
  assert.equal(bigFilePointer('google-drive', { ref: 'https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQ' }).ref, '1AbCdEfGhIjKlMnOpQ');
  assert.throws(() => bigFilePointer('google-drive', { url: 'https://drive.google.com.example.com/file/d/1AbCdEfGhIjKlMnOpQ/view' }), /not a Google Drive link/);
});

test('the question state reads only a current answer note, and a finished onboarding carries no big-files line', t => {
  const f = fixture(t);
  lib.appendMemory(f.root, 'company', { authors: ['alex'], content: 'Big files: locally hosted on the NAS, says Bo.', tags: [] });
  assert.equal(lib.bigFilesChoice(f.root).asked, false, 'a sentence that only starts alike is not the answer');
  const { rec } = lib.appendMemory(f.root, 'company', { authors: ['alex'], content: lib.bigFilesAnswer('local'), tags: ['big-files'] });
  assert.equal(lib.bigFilesChoice(f.root).asked, true);
  assert.equal(lib.bigFiles(f.root).mode, 'google-drive', 'a note never changes the setting: only APPROVE writes admin.md');
  lib.appendMemory(f.root, 'company', { authors: ['alex'], content: 'Withdrawn: asked by mistake.', retracts: rec.id });
  assert.equal(lib.bigFilesChoice(f.root).asked, false, 'a retracted answer is no answer');
  assert.doesNotMatch(lib.onboardingInstruction(f.root, { unattended: false }), /Big files:/, 'no onboarding pending: nothing is added to what the model reads');
});

test('the walk-through offers before it copies and never sends a "this computer" answer to Drive', () => {
  const guide = readFileSync(join(P, 'skills/gtm-brain-use-brain/references/big-files.md'), 'utf8');
  assert.match(guide, /Yes, move it \/ No,\s+leave it/);
  assert.match(guide, /until it is applied, leave the file where it is/);
  assert.doesNotMatch(guide, /carry on with the current setting/);
});
