// Read the host's project catalog through its app-server protocol. Never inspect private
// Desktop state or infer projects from conversations. Older hosts may not expose this API.
import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';

export function listCodexProjects({ command = 'codex', args = ['app-server', '--listen', 'stdio://'], timeout = 10000 } = {}) {
  return new Promise(resolve => {
    const projects = [], ids = new Set(), cursors = new Set();
    let child, timer, finished = false, buffer = '', bytes = 0, request = 1, pages = 0;
    const done = (status, note = null) => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      child?.stdin.destroy(); child?.kill();
      resolve({ status, projects, ...(note ? { note } : {}) });
    };
    const fail = note => done(projects.length ? 'partial' : 'unavailable', note);
    const send = (method, params) => child.stdin.write(JSON.stringify({ id: request, method, params }) + '\n');
    const page = cursor => {
      request++; pages++;
      send('project/list', { limit: 100, ...(cursor ? { cursor } : {}) });
    };
    try { child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch { fail('The Codex project catalog could not be started. Ask for the existing project folder.'); return; }
    timer = setTimeout(() => fail('The Codex project catalog timed out. Ask for any project folders missing from this list.'), timeout);
    child.on('error', () => fail('The Codex project catalog is unavailable. Ask for the existing project folder.'));
    child.stdin.on('error', () => fail('The Codex project catalog connection closed. Ask for the existing project folder.'));
    child.stderr.resume();
    child.stdout.setEncoding('utf8');
    child.on('close', () => { if (!finished) fail('The Codex project catalog closed before completing its list.'); });
    child.stdout.on('data', chunk => {
      if (finished) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > 2 * 1024 * 1024) { fail('The Codex project catalog exceeded the response limit.'); return; }
      buffer += chunk;
      let newline;
      while (!finished && (newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        let message;
        try { message = JSON.parse(line); } catch { fail('The Codex project catalog returned an unreadable response.'); return; }
        if (!message || typeof message !== 'object') { fail('The Codex project catalog returned an unsupported response.'); return; }
        if (message.id !== request) continue;
        if (message.error) { fail('This Codex could not list its projects. Ask for the existing project folder.'); return; }
        if (request === 1) { child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n'); page(); continue; }
        const result = message.result;
        if (!Array.isArray(result?.data) || !(result.nextCursor == null || typeof result.nextCursor === 'string')) {
          fail('The Codex project catalog returned an unsupported format.'); return;
        }
        for (const project of result.data) {
          if (typeof project?.id !== 'string' || typeof project.name !== 'string' || !Array.isArray(project.roots)
              || project.roots.some(root => typeof root?.path !== 'string' || !isAbsolute(root.path))) {
            fail('The Codex project catalog contains an unsupported project. Ask for any missing folders.'); return;
          }
          if (ids.has(project.id)) continue;
          ids.add(project.id);
          projects.push({ id: project.id, title: project.name, paths: [...new Set(project.roots.map(root => root.path))] });
        }
        if (!result.nextCursor) { done('complete'); return; }
        if (pages >= 10 || cursors.has(result.nextCursor)) { fail('The Codex project catalog is incomplete. Ask for any missing folders.'); return; }
        cursors.add(result.nextCursor); page(result.nextCursor);
      }
    });
    // Experimental capability is negotiated for this read, without changing user settings.
    send('initialize', { clientInfo: { name: 'gtm-os-project-discovery', version: '1' }, capabilities: { experimentalApi: true } });
  });
}
