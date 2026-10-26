import { acquireProcessLock, releaseProcessLock } from '../../lib/process-lock.mjs';
const [action, path, owner] = process.argv.slice(2);
if (action === 'acquire') {
  const token = acquireProcessLock(path, Number(owner));
  if (!token) process.exit(75);
  console.log(token);
} else if (action === 'release') {
  if (!releaseProcessLock(path, owner)) process.exit(1);
} else process.exit(2);
