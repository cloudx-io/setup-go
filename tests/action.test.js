const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { parse } = require('yaml');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = file => parse(read(file));
const action = manifest('action.yml');
const steps = action.runs.steps;
const restore = steps.find(step => step.id === 'cache');
const save = steps.find(step => step.uses?.startsWith('actions/cache@'));
const trim = steps.find(step => step.uses === '$/trim-gocache');

function node(script, env) {
  return execFileSync(process.execPath, [path.join(root, script)], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

function temporaryDirectory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-go-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function readState(file) {
  return Object.fromEntries(fs.readFileSync(file, 'utf8').trim().split('\n').map(line => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

test('restore configuration and outputs', () => {
  assert.equal(action.inputs.save.default, 'true');
  assert.ok(restore.uses.startsWith('actions/cache/restore@'));
  assert.equal(Object.hasOwn(restore, 'if'), false);
  for (const output of ['cache-hit', 'cache-matched-key']) {
    assert.equal(action.outputs[output].value, '${{ steps.cache.outputs.' + output + ' }}');
  }
  assert.equal(save.with.path, restore.with.path);
  assert.equal(save.with.key, '${{ steps.cache.outputs.cache-primary-key }}');
  assert.ok(restore.with.key.endsWith('${{ github.run_id }}'));
  const prefixes = restore.with['restore-keys'].trim().split('\n');
  assert.equal(prefixes.length, 4);
  for (const prefix of prefixes.slice(0, 2)) {
    assert.ok(prefix.includes('github.head_ref || github.ref_name'));
  }
  for (const prefix of prefixes.slice(2)) {
    assert.ok(prefix.includes('github.event.repository.default_branch'));
  }
  assert.ok(prefixes[0].includes('hashFiles'));
  assert.equal(prefixes[1].includes('hashFiles'), false);
  assert.ok(prefixes[2].includes('hashFiles'));
  assert.equal(prefixes[3].includes('hashFiles'), false);
});

test('post hooks trim before saving and gate uploads', () => {
  const gate = "${{ inputs.save == 'true' && steps.cache.outputs.cache-hit != 'true' }}";
  assert.equal(save.if, gate);
  assert.equal(trim.if, gate);
  assert.ok(steps.indexOf(restore) < steps.indexOf(save));
  assert.ok(steps.indexOf(save) < steps.indexOf(trim));
  assert.equal(manifest('trim-gocache/action.yml').runs.post, 'trim.js');
  // Uploads must not run before the consumer's build/test steps.
  assert.equal(steps.some(step => step.uses?.startsWith('actions/cache/save@')), false);
});

test('save registration performs only an exact-key metadata lookup', () => {
  assert.equal(save.uses.split('@')[1], restore.uses.split('@')[1]);
  assert.equal(save.with['lookup-only'], true);
  assert.equal(Object.hasOwn(save.with, 'restore-keys'), false);
  assert.equal(Object.hasOwn(save.with, 'fail-on-cache-miss'), false);
  assert.deepEqual(Object.keys(save.with).sort(), ['key', 'lookup-only', 'path']);
  assert.equal(restore.with['lookup-only'], undefined);
});

test('trimming before upload preserves the working set', t => {
  const dir = temporaryDirectory(t);
  const cache = path.join(dir, 'cache');
  fs.mkdirSync(cache);
  const state = path.join(dir, 'state');
  const old = path.join(cache, 'old');
  fs.writeFileSync(old, 'unused');
  fs.utimesSync(old, 1, 1);
  node('trim-gocache/main.js', {
    GITHUB_STATE: state,
    'INPUT_MAX-STALENESS-HOURS': '2',
  });
  // Simulate cache data produced by the caller after setup.
  const current = path.join(cache, 'current');
  fs.writeFileSync(current, 'compiled during build');
  node('trim-gocache/trim.js', {
    INPUT_GOCACHE: cache,
    ...Object.fromEntries(Object.entries(readState(state)).map(([key, value]) => [
      'STATE_' + key, value,
    ])),
  });
  assert.equal(fs.existsSync(old), false);
  assert.equal(fs.readFileSync(current, 'utf8'), 'compiled during build');
});
