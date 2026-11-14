process.env.GTM_BRAIN_NO_COMPILE = '1';
process.env.GTM_BRAIN_NO_WATCH = '1';
process.env.GTM_BRAIN_NO_COMMIT = '1';
// One obvious way to put a PDF, an image or any file into the brain (ALL-205): the add-file script
// lands it in files/<yyyy-mm>/, references project files in place, and extracts text for the notes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, existsSync, openSync, closeSync, ftruncateSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import * as lib from '../lib/brain.mjs';
import { resolveEntity } from '../lib/entities.mjs';
const P = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
function fixture() {
 const root = realpathSync(mkdtempSync(join(tmpdir(), 'gtm-add-file-')));
 mkdirSync(join(root, 'brain')); mkdirSync(join(root, 'work'));
 writeFileSync(join(root, 'brain/admin.md'), lib.renderFrontmatter({company:'Demo',owner:'ann',dashboard:'on-demand',tools:[],team:[{name:'Ann Lee',handle:'ann',email:'ann@example.invalid'}]})+'\n# Demo\n');
 lib.writeContext(root, 'market', {title:'Market',rule:'Test files.',summary:'Nothing here yet.',now:''});
 const outside = realpathSync(mkdtempSync(join(tmpdir(), 'gtm-downloads-')));
 const run = (...args) => JSON.parse(execFileSync(process.execPath, [join(P, 'skills/gtm-brain-add-file/add-file.mjs'), root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
 const fail = (...args) => { try { execFileSync(process.execPath, [join(P, 'skills/gtm-brain-add-file/add-file.mjs'), root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return String(e.stderr); } assert.fail('expected a refusal'); };
 return { root, outside, run, fail };
}
const month = new Date().toISOString().slice(0, 7);

test('a file from outside the brain needs an owner; it lands beside it once, and the same name with other bytes gets a suffix', () => {
 const f = fixture(); writeFileSync(join(f.outside, 'Deck.pdf'), '%PDF-1.4 fake');
 assert.match(f.fail('--file', join(f.outside, 'Deck.pdf')), /belongs to.*--document.*--entity/s, 'no owner, no landing: nothing appears in the brain unasked');
 assert.ok(!existsSync(join(f.root, 'files')), 'the old files/<yyyy-mm>/ fallback is gone');
 lib.addName(f.root, 'Acme', { kind: 'organization' });
 const dir = resolveEntity(lib.readNames(f.root), 'Acme')._path.replace(/\.md$/, '');
 const first = f.run('--file', join(f.outside, 'Deck.pdf'), '--entity', 'Acme');
 assert.deepEqual([first.base, first.path, first.copied, first.kind], ['brain', `${dir}/Deck.pdf`, true, 'pdf']);
 assert.equal(readFileSync(join(f.root, first.path), 'utf8'), '%PDF-1.4 fake');
 const again = f.run('--file', join(f.outside, 'Deck.pdf'), '--entity', 'Acme'); assert.match(again.note, /^already in the brain/, 'same bytes: reused, not duplicated');
 assert.deepEqual({ ...again, note: undefined }, { ...first, copied: false, note: undefined });
 writeFileSync(join(f.outside, 'Deck.pdf'), '%PDF-1.4 other');
 const third = f.run('--file', join(f.outside, 'Deck.pdf'), '--entity', 'Acme');
 assert.equal(third.path, `${dir}/Deck-2.pdf`); assert.ok(existsSync(join(f.root, third.path)));
});

test('a file already inside the brain or a linked project is referenced where it is, never copied', () => {
 const f = fixture(); mkdirSync(join(f.root, 'decks')); writeFileSync(join(f.root, 'decks/offer.png'), 'png');
 assert.deepEqual(f.run('--file', join(f.root, 'decks/offer.png')), { base: 'brain', path: 'decks/offer.png', copied: false, kind: 'image', bytes: 3, text: null, note: 'already in the brain' });
 const folder = realpathSync(mkdtempSync(join(tmpdir(), 'gtm-project-'))); lib.writePointer(folder, { brain: f.root, slug: 'website', title: 'Website', company: 'Demo' }); lib.writeProjects(f.root, [{ slug: 'website', path: folder, title: 'Website', contexts: ['market'] }]);
 writeFileSync(join(folder, 'brief.md'), '# Brief\n\nThe brief text.\n');
 const inProject = f.run('--file', join(folder, 'brief.md'));
 assert.deepEqual([inProject.base, inProject.project, inProject.path, inProject.copied, inProject.kind], ['project', 'website', 'brief.md', false, 'document']);
 assert.equal(readFileSync(inProject.text, 'utf8'), '# Brief\n\nThe brief text.\n', 'text files are their own extraction');
 assert.ok(!existsSync(join(f.root, 'files')), 'nothing was copied');
});

test('it refuses a folder, a missing file and anything over 25 MB, and says why', () => {
 const f = fixture();
 assert.match(f.fail('--file', f.outside), /a file, not a folder/);
 assert.match(f.fail('--file', join(f.outside, 'nope.pdf')), /does not exist/);
 const big = join(f.outside, 'big.mov'); const fd = openSync(big, 'w'); ftruncateSync(fd, 25 * 1024 * 1024 + 1); closeSync(fd);
 assert.match(f.fail('--file', big), /over 25 MB/);
 assert.ok(!existsSync(join(f.root, 'files')));
});

test('a file over 25 MB gets the same instruction as save and the chat start, following big_files in admin.md', () => {
 const f = fixture();
 const big = join(f.outside, 'keynote.mov'); const fd = openSync(big, 'w'); ftruncateSync(fd, 25 * 1024 * 1024 + 1); closeSync(fd);
 const drive = f.fail('--file', big);
 assert.match(drive, /too big for git, not kept/);
 assert.ok(drive.includes(lib.bigFileAdvice(f.root)), 'the add-file refusal carries the lib advice word for word');
 assert.match(drive, /shared drive \(Google Drive\)/);
 assert.doesNotMatch(drive, /Keep it in a project folder/, 'the old contradicting advice is gone');
 const admin = join(f.root, 'brain/admin.md');
 writeFileSync(admin, readFileSync(admin, 'utf8').replace('dashboard: on-demand', 'dashboard: on-demand\nbig_files: local\nbig_files_folder: /Users/ann/big'));
 const local = f.fail('--file', big);
 assert.ok(local.includes(lib.bigFileAdvice(f.root)));
 assert.match(local, /\/Users\/ann\/big, outside git/); assert.match(local, /file:\/Users\/ann\/big\/<name>/); assert.match(local, /not shared/);
 assert.doesNotMatch(local, /Google Drive/);
 assert.match(lib.largeNote([{ path: 'a.mov', size: 30 * 1048576 }], f.root), /^Too big for git, not kept \(over 25 MB\): a\.mov \(30 MB\)\. This brain keeps big files on this computer/);
});

test('big_files: google-drive by default and for an unknown value; local falls back to a folder outside the brain', () => {
 const f = fixture(); const admin = join(f.root, 'brain/admin.md'); const base = readFileSync(admin, 'utf8');
 assert.deepEqual(lib.bigFiles(f.root), { mode: 'google-drive', folder: null });
 assert.deepEqual(lib.bigFiles(undefined), { mode: 'google-drive', folder: null }, 'no brain: the default');
 writeFileSync(admin, base.replace('dashboard: on-demand', 'dashboard: on-demand\nbig_files: dropbox'));
 assert.equal(lib.bigFiles(f.root).mode, 'google-drive');
 writeFileSync(admin, base.replace('dashboard: on-demand', 'dashboard: on-demand\nbig_files: local'));
 const { mode, folder } = lib.bigFiles(f.root);
 assert.equal(mode, 'local'); assert.ok(!folder.startsWith(f.root), 'never inside the brain, so never in git');
 assert.match(folder, /gtm-brain-files\/gtm-add-file-/);
 writeFileSync(admin, base.replace('dashboard: on-demand', 'dashboard: on-demand\nbig_files: local\nbig_files_folder: relative/path'));
 assert.match(lib.bigFiles(f.root).folder, /gtm-brain-files/, 'a relative folder is ignored');
 writeFileSync(admin, base.replace('dashboard: on-demand', 'dashboard: on-demand\nbig_files: local\nbig_files_folder: ~/Movies/brain'));
 assert.equal(lib.bigFiles(f.root).folder, join(homedir(), 'Movies/brain'), '~/ is the home folder');
 writeFileSync(admin, base.replace('dashboard: on-demand', 'dashboard: on-demand\nbig_files: local\nbig_files_folder: ' + join(f.root, 'big')));
 assert.ok(!lib.bigFiles(f.root).folder.startsWith(f.root), 'a folder inside the brain would be in git: ignored');
});

test('big_files changes through APPROVE like any workplace setting, and the instruction follows at once', () => {
 const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'gtm-big-files-approve-'))); const root = join(scratch, 'brain'); const home = join(scratch, 'home'); mkdirSync(root); mkdirSync(home);
 const env = { ...process.env, GTM_BRAIN_NO_COMPILE: '1', GTM_BRAIN_NO_SESSION_START: '1', HOME: home }; delete env.GTM_BRAIN_NO_COMMIT; delete env.GTM_BRAIN_APPROVAL_TICKET;
 execFileSync('git', ['init', '-q', root]); execFileSync('git', ['-C', root, 'config', 'commit.gpgsign', 'false']);
 execFileSync('bash', [join(P, 'scripts/gtm-brain-setup/setup.sh'), '--company', 'Reflow', '--one-liner', 'returns automation', '--owner', 'Marta Nowak <marta@reflow.io>', '--dashboard', 'on-demand'], { cwd: root, env, stdio: 'ignore' });
 const admin = readFileSync(join(root, 'brain/admin.md'), 'utf8');
 assert.match(admin, /^big_files: google-drive$/m, 'a new brain says where big files go');
 assert.equal(lib.bigFiles(root).mode, 'google-drive');
 writeFileSync(join(root, 'work/admin.proposed.md'), admin.replace('big_files: google-drive', 'big_files: local\nbig_files_folder: /Volumes/Media/reflow'));
 // What approve_change does after the person chose APPROVE: a single-use ticket. The audit log goes to the scratch home.
 const apply = `import os from 'node:os'; import { syncBuiltinESMExports } from 'node:module'; os.homedir = () => ${JSON.stringify(home)}; syncBuiltinESMExports();
  const lib = await import(${JSON.stringify(join(P, 'lib/brain.mjs'))});
  process.env.GTM_BRAIN_APPROVAL_TICKET = lib.issueApproval(${JSON.stringify(root)}, 'admin');
  process.argv = [process.execPath, 'approve.mjs', ${JSON.stringify(root)}, '--apply', '--by', 'marta'];
  await import(${JSON.stringify(join(P, 'scripts/gtm-brain-approve/approve.mjs'))});`;
 execFileSync(process.execPath, ['--input-type=module', '-e', apply], { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
 assert.deepEqual(lib.bigFiles(root), { mode: 'local', folder: '/Volumes/Media/reflow' });
 assert.match(lib.largeNote([{ path: 'demo.mov', size: 40 * 1048576 }], root), /offer to move each to \/Volumes\/Media\/reflow, outside git/);
 assert.equal(execFileSync('git', ['-C', root, 'status', '--porcelain', 'brain/admin.md'], { encoding: 'utf8' }).trim(), '', 'the approved admin.md is committed');
});

test('text is extracted for the notes when an extractor exists, and its absence is said, not hidden', () => {
 const f = fixture(); writeFileSync(join(f.outside, 'notes.txt'), 'Acme wants a 30-day pilot.'); lib.addName(f.root, 'Acme', { kind: 'organization' });
 const txt = f.run('--file', join(f.outside, 'notes.txt'), '--entity', 'Acme');
 assert.equal(txt.kind, 'document'); assert.equal(readFileSync(txt.text, 'utf8'), 'Acme wants a 30-day pilot.'); assert.ok(txt.text.startsWith(join(f.root, 'work')), 'extractions are derived, outside git');
 writeFileSync(join(f.outside, 'scan.pdf'), '%PDF-1.4 not really a pdf');
 const pdf = f.run('--file', join(f.outside, 'scan.pdf'), '--entity', 'Acme');
 assert.ok(pdf.text === null, 'a broken pdf has no text'); assert.match(pdf.note || '', /no text|could not extract/i);
});

test('--document lands the file in the document\'s files folder, --entity beside the entity file; the JSON says the owner', () => {
 const f = fixture();
 const make = (title, applies) => execFileSync(process.execPath, [join(P, 'scripts/gtm-brain-documents/document.mjs'), f.root, '--create', '--title', title, '--applies-to', applies, '--body', 'Blue.', '--folder', 'brand'], { stdio: 'ignore', env: { ...process.env, GTM_BRAIN_NO_COMMIT: '1' } });
 make('Voice', 'copy'); make('Design system', 'design');   // two documents in brand/
 const kit = join(f.outside, 'ui-kit.fig'); writeFileSync(kit, 'fig');
 // the first file moves the document into a folder of its own name, so Finder shows one thing, not a file beside a folder
 const a = f.run('--file', kit, '--document', 'design-system');
 assert.deepEqual([a.base, a.path, a.copied, a.owner], ['brain', 'brand/design-system/ui-kit.fig', true, { kind: 'document', ref: 'brand/design-system/design-system.md', dir: 'brand/design-system' }]);
 assert.deepEqual(a.moved, { from: 'brand/design-system.md', to: 'brand/design-system/design-system.md' });
 assert.ok(existsSync(join(f.root, a.path))); assert.ok(existsSync(join(f.root, 'brand/design-system/design-system.md'))); assert.ok(!existsSync(join(f.root, 'brand/design-system.md')));
 assert.ok(existsSync(join(f.root, 'brand/voice.md')), 'the sibling document stays where it is');
 const kit2 = join(f.outside, 'tokens.json'); writeFileSync(kit2, '{}');
 const a2 = f.run('--file', kit2, '--document', 'design-system');
 assert.equal(a2.path, 'brand/design-system/tokens.json'); assert.equal(a2.moved, undefined, 'a document already in its folder is not moved again');
 // a root document does the same: strategy.md becomes strategy/strategy.md on its first file
 execFileSync(process.execPath, [join(P, 'scripts/gtm-brain-documents/document.mjs'), f.root, '--create', '--title', 'Strategy', '--applies-to', 'planning', '--body', 'Win.'], { stdio: 'ignore', env: { ...process.env, GTM_BRAIN_NO_COMMIT: '1' } });
 const deck = join(f.outside, 'deck.pdf'); writeFileSync(deck, 'pdf');
 const s = f.run('--file', deck, '--document', 'strategy');
 assert.equal(s.path, 'strategy/deck.pdf'); assert.deepEqual(s.moved, { from: 'strategy.md', to: 'strategy/strategy.md' });
 assert.ok(!existsSync(join(f.root, 'strategy.md')));
 lib.addName(f.root, 'Positive Surfer', { kind: 'organization' });
 const entityPath = resolveEntity(lib.readNames(f.root), 'Positive Surfer')._path;
 const logo = join(f.outside, 'logo.svg'); writeFileSync(logo, '<svg/>');
 const b = f.run('--file', logo, '--entity', 'Positive Surfer');
 assert.equal(b.path, `${entityPath.replace(/\.md$/, '')}/logo.svg`);
 assert.deepEqual(b.owner, { kind: 'entity', ref: entityPath, dir: entityPath.replace(/\.md$/, '') });
 assert.match(f.fail('--file', logo, '--entity', 'Nobody Known'), /add_name/);
 assert.match(f.fail('--file', logo, '--document', 'nope'), /no such document/);
 assert.match(f.fail('--file', logo, '--document', 'design-system', '--entity', 'Positive Surfer'), /not both/);
});
