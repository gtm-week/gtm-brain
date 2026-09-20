process.env.GTM_OS_NO_COMPILE = '1';
process.env.GTM_OS_NO_WATCH = '1';
process.env.GTM_OS_NO_COMMIT = '1';
// One obvious way to put a PDF, an image or any file into the brain (ALL-205): the add-file script
// lands it in files/<yyyy-mm>/, references project files in place, and extracts text for the notes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, existsSync, openSync, closeSync, ftruncateSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import * as lib from '../lib/brain.mjs';
const P = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
function fixture() {
 const root = realpathSync(mkdtempSync(join(tmpdir(), 'gtm-add-file-')));
 mkdirSync(join(root, 'brain')); mkdirSync(join(root, 'work'));
 writeFileSync(join(root, 'brain/admin.md'), lib.renderFrontmatter({company:'Demo',owner:'ann',dashboard:'on-demand',tools:[],team:[{name:'Ann Lee',handle:'ann',email:'ann@example.invalid'}]})+'\n# Demo\n');
 lib.writeContext(root, 'market', {title:'Market',rule:'Test files.',summary:'Nothing here yet.',now:''});
 const outside = realpathSync(mkdtempSync(join(tmpdir(), 'gtm-downloads-')));
 const run = (...args) => JSON.parse(execFileSync(process.execPath, [join(P, 'skills/gtm-os-add-file/add-file.mjs'), root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
 const fail = (...args) => { try { execFileSync(process.execPath, [join(P, 'skills/gtm-os-add-file/add-file.mjs'), root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return String(e.stderr); } assert.fail('expected a refusal'); };
 return { root, outside, run, fail };
}
const month = new Date().toISOString().slice(0, 7);

test('a file from outside the brain lands in files/<yyyy-mm>/ once; the same name with other bytes gets a suffix', () => {
 const f = fixture(); writeFileSync(join(f.outside, 'Deck.pdf'), '%PDF-1.4 fake');
 const first = f.run('--file', join(f.outside, 'Deck.pdf'));
 assert.deepEqual([first.base, first.path, first.copied, first.kind], ['brain', `files/${month}/Deck.pdf`, true, 'pdf']);
 assert.equal(readFileSync(join(f.root, first.path), 'utf8'), '%PDF-1.4 fake');
 const again = f.run('--file', join(f.outside, 'Deck.pdf')); assert.match(again.note, /^already in the brain/, 'same bytes: reused, not duplicated');
 assert.deepEqual({ ...again, note: undefined }, { ...first, copied: false, note: undefined });
 writeFileSync(join(f.outside, 'Deck.pdf'), '%PDF-1.4 other');
 const third = f.run('--file', join(f.outside, 'Deck.pdf'));
 assert.equal(third.path, `files/${month}/Deck-2.pdf`); assert.ok(existsSync(join(f.root, third.path)));
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

test('text is extracted for the notes when an extractor exists, and its absence is said, not hidden', () => {
 const f = fixture(); writeFileSync(join(f.outside, 'notes.txt'), 'Acme wants a 30-day pilot.');
 const txt = f.run('--file', join(f.outside, 'notes.txt'));
 assert.equal(txt.kind, 'document'); assert.equal(readFileSync(txt.text, 'utf8'), 'Acme wants a 30-day pilot.'); assert.ok(txt.text.startsWith(join(f.root, 'work')), 'extractions are derived, outside git');
 writeFileSync(join(f.outside, 'scan.pdf'), '%PDF-1.4 not really a pdf');
 const pdf = f.run('--file', join(f.outside, 'scan.pdf'));
 assert.ok(pdf.text === null, 'a broken pdf has no text'); assert.match(pdf.note || '', /no text|could not extract/i);
});
