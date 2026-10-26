import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readPointer, resolveBrain, removePointer, writePointer } from '../lib/brain.mjs';
import { listUserSkills } from '../lib/user-skills.mjs';
import { hostId } from '../lib/host.mjs';
const plugin = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');

test('public plugin identity is GTM Brain with the new install and MCP names', () => {
  const manifest = JSON.parse(readFileSync(join(plugin, '.codex-plugin/plugin.json')));
  assert.equal(manifest.name, 'gtm-brain');
  assert.equal(manifest.interface.displayName, 'GTM Brain');
  const mcp = JSON.parse(readFileSync(join(plugin, '.mcp.json')));
  assert.deepEqual(Object.keys(mcp.mcpServers), ['gtm_brain']);
});

test('old and new linked projects resolve in Node and Bash; unlink preserves handwritten content', () => {
  const dir = mkdtempSync(join(tmpdir(), 'brain-rename-'));
  try {
    const brain = join(dir, 'brain space'); mkdirSync(join(brain, 'brain'), {recursive:true});
    writeFileSync(join(brain, 'brain/admin.md'), 'company: Example\n');
    for (const [id, label] of [['gtm-os','GTM OS'], ['gtm-brain','GTM Brain']]) {
      const project = join(dir, id); mkdirSync(join(project, 'nested'), {recursive:true});
      writeFileSync(join(project, 'AGENTS.md'), `My instructions\n\n<!-- ${id} project -->\n${label} project: campaign\n${label} brain: ${brain}\n<!-- /${id} project -->\n`);
      writeFileSync(join(project, 'CLAUDE.md'), `My Claude instructions\n<!-- ${id} rulebook -->\n@AGENTS.md\n<!-- /${id} rulebook -->\n`);
      assert.deepEqual(readPointer(project), {brain,slug:'campaign',missing:false});
      assert.equal(resolveBrain(join(project,'nested')).root, brain);
      assert.equal(resolveBrain(join(project,'nested')).project, 'campaign');
      assert.throws(() => writePointer(project,{brain,slug:'duplicate',title:'Duplicate',company:'Example'}), /already a project/);
      const shell = execFileSync('bash', ['-c', 'source "$1"; "${2}_resolve" "$3"', 'test',join(plugin,'hooks/resolve.sh'),'gtm_brain',join(project,'nested')], {encoding:'utf8'});
      assert.equal(shell.trim(), `${brain}\tcampaign`);
      assert.equal(removePointer(project), true);
      assert.equal(readFileSync(join(project,'AGENTS.md'),'utf8').trim(), 'My instructions');
      assert.equal(readFileSync(join(project,'CLAUDE.md'),'utf8').trim(), 'My Claude instructions');
    }
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('existing custom skills are retained alongside new GTM Brain skills', () => {
  const dir = mkdtempSync(join(tmpdir(),'brain-skill-rename-'));
  try {
    for (const id of ['gtm-os-custom-research','gtm-brain-custom-outbound']) {
      mkdirSync(join(dir,'.agents/skills',id),{recursive:true});
      writeFileSync(join(dir,'.agents/skills',id,'SKILL.md'),`---\nname: ${id}\ndescription: A useful custom process\n---\n# Research\n`);
    }
    assert.deepEqual(listUserSkills(dir).map(x=>x.id).sort(), ['gtm-brain-custom-outbound','gtm-os-custom-research']);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('renamed host setting takes precedence and the legacy setting remains accepted', () => {
  assert.equal(hostId({GTM_BRAIN_HOST:'claude'}), 'claude');
  assert.equal(hostId({GTM_OS_HOST:'claude'}), 'claude');
  assert.equal(hostId({GTM_BRAIN_HOST:'codex',GTM_OS_HOST:'claude'}), 'codex');
});

test('existing machine preferences survive the first GTM Brain registration', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'brain-prefs-rename-')));
  try {
    const profile = join(dir, 'profile'), brain = join(dir, 'company');
    mkdirSync(join(profile, 'gtm-os'), {recursive:true});
    mkdirSync(join(brain,'brain'), {recursive:true});
    writeFileSync(join(brain,'brain/admin.md'), '---\ncompany: Existing Company\n---\n');
    const legacy = JSON.stringify({dashboard:'on-demand',brains:[{path:brain,company:'Existing Company'}]});
    writeFileSync(join(profile,'gtm-os/preferences.json'), legacy);
    const run = script => JSON.parse(execFileSync(process.execPath, ['--input-type=module','-e', script], {env:{...process.env,CODEX_HOME:profile},encoding:'utf8'}));
    const module = JSON.stringify(join(plugin,'lib/brain.mjs'));
    assert.equal(run(`const l=await import(${module});console.log(JSON.stringify(l.readPreferences()))`).dashboard,'on-demand');
    run(`const l=await import(${module});l.registerBrain(${JSON.stringify(brain)});console.log(JSON.stringify(l.knownBrains()))`);
    const saved = JSON.parse(readFileSync(join(profile,'gtm-brain/preferences.json')));
    assert.equal(saved.dashboard,'on-demand');
    assert.equal(saved.brains.length,1);
    assert.equal(saved.brains[0].company,'Existing Company');
    assert.equal(readFileSync(join(profile,'gtm-os/preferences.json'),'utf8'),legacy);
    saved.dashboard='always'; writeFileSync(join(profile,'gtm-brain/preferences.json'),JSON.stringify(saved));
    assert.equal(run(`const l=await import(${module});console.log(JSON.stringify(l.readPreferences()))`).dashboard,'always');
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('existing skill identifiers can still be edited through the skill validator', async () => {
  const { validateSkill, skillId } = await import('../lib/user-skills.mjs');
  assert.equal(skillId('gtm-os-custom-research'),'gtm-os-custom-research');
  assert.equal(validateSkill('/unused',{id:'gtm-os-custom-research',description:'Research target accounts'}),null);
  assert.match(validateSkill('/unused',{id:'gtm-os-start',description:'Clash with shipped skill'}),/shipped/);
});

test('a new session finds old handoffs and keeps old memory-validation hooks working', () => {
  const dir = mkdtempSync(join(tmpdir(), 'brain-session-rename-'));
  try {
    const brain = join(dir,'company'); mkdirSync(join(brain,'brain'),{recursive:true});
    mkdirSync(join(dir,'.gtm-os'),{recursive:true});
    writeFileSync(join(dir,'.gtm-os/handoff.md'),'by: Previous assistant\nconfirmed: yes\nKeep this content.\n');
    writeFileSync(join(brain,'brain/admin.md'),'---\ncompany: Existing Company\ndashboard: on-demand\nteam: []\n---\n');
    mkdirSync(join(brain,'.githooks'));
    execFileSync('git',['init','-q',brain]);
    execFileSync('git',['-C',brain,'config','gtm-os.lib','/old/cache/lib/brain.mjs']);
    const out = execFileSync('bash',[join(plugin,'hooks/session-start.sh')],{cwd:brain,encoding:'utf8',input:'{}',env:{...process.env,PLUGIN_ROOT:plugin,CODEX_HOME:join(dir,'profile'),GTM_BRAIN_HOME:dir,GTM_BRAIN_NO_SESSION_MAINTENANCE:'1',GTM_BRAIN_NO_COMPILE:'1',GTM_BRAIN_NO_WATCH:'1',GTM_BRAIN_NO_OPEN:'1'}});
    assert.ok(out.includes(`HANDOFF waiting: ${join(dir,'.gtm-os/handoff.md')}`));
    assert.equal(execFileSync('git',['-C',brain,'config','gtm-os.lib'],{encoding:'utf8'}).trim(),join(plugin,'lib/brain.mjs'));
    assert.ok(readFileSync(join(dir,'.gtm-os/handoff.md'),'utf8').includes('Keep this content.'));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
