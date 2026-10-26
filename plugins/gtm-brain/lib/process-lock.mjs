// Unique owner files make recovery safe even when several contenders see a dead PID.
import { mkdirSync, readFileSync, writeFileSync, rmSync, rmdirSync, lstatSync, readdirSync, linkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
function processStarted(pid) {
  try {
    const started = execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], {
      encoding: 'utf8', timeout: 1000, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' },
    }).trim();
    return started ? { key: started, at: Date.parse(started + ' UTC') } : null;
  } catch { return null; }
}
function processIdentity(pid) {
  if (process.platform === 'linux') {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const started = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
      return { key: readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() + ':' + started };
    } catch {}
  }
  return processStarted(pid);
}
const self = processIdentity(process.pid);
function abandoned(owner, at) {
  const pid = owner?.pid;
  if (!Number.isSafeInteger(pid) || pid <= 0) return Date.now() - at > 30000;
  try { process.kill(pid, 0); } catch (e) { return e.code === 'ESRCH'; }
  const current = pid === process.pid ? self : processIdentity(pid);
  if (owner?.identity && current) return owner.identity !== current.key;
  // Legacy PID-only locks can be reclaimed when the process was born after the lock.
  // Unknown identity stays busy; age alone never proves that a live writer is gone.
  const started = current?.at ?? processStarted(pid)?.at;
  return Number.isFinite(started) && started > at + 1000;
}
const ownerFile = token => `owner-${token}.json`;
const ownerPattern = /^owner-[a-f0-9-]{36}\.json$/;
function removeEmpty(path) { try { rmdirSync(path); } catch (e) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(e.code)) throw e; } }
function recover(path) {
  try {
    const files = readdirSync(path), stat = lstatSync(path);
    for (const name of files.filter(n => ownerPattern.test(n))) {
      const file = join(path, name), raw = readFileSync(file, 'utf8');
      let owner; try { owner = JSON.parse(raw); } catch { continue; }
      if (abandoned(owner, lstatSync(file).mtimeMs)) rmSync(file, { force: true });
    }
    // Old releases used a PID file, with no unique owner filename. Never recursively
    // delete the directory: a new contender's owner file must survive old cleanup.
    if (files.includes('pid') || files.includes('owner.json')) {
      let owner;
      try { owner = JSON.parse(readFileSync(join(path, 'owner.json'), 'utf8')); }
      catch { owner = { pid: Number(readFileSync(join(path, 'pid'), 'utf8')) }; }
      if (abandoned(owner, stat.mtimeMs)) {
        for (const file of ['pid', 'owner.json', 'reclaim']) rmSync(join(path, file), { force: true });
      }
    }
    const current = lstatSync(path);
    if (current.ino === stat.ino && current.dev === stat.dev && (files.length || Date.now() - stat.mtimeMs > 30000)) removeEmpty(path);
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
export function acquireProcessLock(path, pid = process.pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Lock owner must be a positive PID');
  const token = randomUUID(), filename = ownerFile(token), candidate = join(dirname(path), '.' + filename);
  const identity = pid === process.pid ? self : processIdentity(pid);
  // Publish complete metadata atomically; no reader sees a half-written owner record.
  writeFileSync(candidate, JSON.stringify({ pid, identity: identity?.key ?? null, token }), { flag: 'wx' });
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { mkdirSync(path); }
      catch (e) { if (e.code !== 'EEXIST') throw e; recover(path); continue; }
      try {
        linkSync(candidate, join(path, filename));
        // If our empty directory was reclaimed while this process was suspended,
        // another owner's record means we lost the claim. Remove only our own record.
        const files = readdirSync(path);
        if (files.length === 1 && files[0] === filename) return token;
        releaseProcessLock(path, token); return null;
      } catch (e) {
        // APFS can report EINVAL instead of ENOENT when an empty parent directory
        // is removed during link(). No owner was published; retry the claim.
        if (!['ENOENT', 'EINVAL'].includes(e.code)) throw e;
        removeEmpty(path);
      }
    }
    return null;
  } finally { rmSync(candidate, { force: true }); }
}
export function releaseProcessLock(path, token) {
  if (!/^[a-f0-9-]{36}$/.test(token || '')) return false;
  try {
    const file = join(path, ownerFile(token));
    if (JSON.parse(readFileSync(file, 'utf8')).token !== token) return false;
    rmSync(file); removeEmpty(path); return true;
  } catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}
