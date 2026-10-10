import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

import yaml

ROOT = Path(__file__).resolve().parents[1]


def manifest(path):
    return yaml.safe_load((ROOT / path).read_text())


def node(script, env):
    return subprocess.run(
        ['node', str(ROOT / script)],
        env={**os.environ, **env},
        check=True,
        capture_output=True,
        text=True,
    )


class ActionTests(unittest.TestCase):
    def setUp(self):
        self.action = manifest('action.yml')
        self.steps = self.action['runs']['steps']
        self.restore = next(s for s in self.steps if s.get('id') == 'cache')
        self.save = next(s for s in self.steps if s.get('uses') == '$/save-cache')
        self.trim = next(s for s in self.steps if s.get('uses') == '$/trim-gocache')

    def test_restore_and_outputs(self):
        self.assertEqual(self.action['inputs']['save']['default'], 'true')
        self.assertTrue(self.restore['uses'].startswith('actions/cache/restore@'))
        self.assertNotIn('if', self.restore)
        for output in ('cache-hit', 'cache-matched-key'):
            self.assertEqual(
                self.action['outputs'][output]['value'],
                '${{ steps.cache.outputs.' + output + ' }}',
            )
        self.assertEqual(self.save['with']['path'], self.restore['with']['path'])
        self.assertEqual(
            self.save['with']['key'], '${{ steps.cache.outputs.cache-primary-key }}'
        )
        self.assertTrue(self.restore['with']['key'].endswith('${{ github.run_id }}'))
        prefixes = self.restore['with']['restore-keys'].splitlines()
        self.assertEqual(len(prefixes), 4)
        for prefix in prefixes[:2]:
            self.assertIn('github.head_ref || github.ref_name', prefix)
        for prefix in prefixes[2:]:
            self.assertIn('github.event.repository.default_branch', prefix)
        self.assertIn('hashFiles', prefixes[0])
        self.assertNotIn('hashFiles', prefixes[1])
        self.assertIn('hashFiles', prefixes[2])
        self.assertNotIn('hashFiles', prefixes[3])

    def test_post_hook_order_and_gates(self):
        gate = "${{ inputs.save == 'true' && steps.cache.outputs.cache-hit != 'true' }}"
        self.assertEqual(self.save['if'], gate)
        self.assertEqual(self.trim['if'], gate)
        self.assertLess(self.steps.index(self.restore), self.steps.index(self.save))
        self.assertLess(self.steps.index(self.save), self.steps.index(self.trim))
        save_runs = manifest('save-cache/action.yml')['runs']
        self.assertEqual(save_runs['post-if'], 'success()')
        self.assertEqual(save_runs['main'], 'main.js')
        self.assertEqual(save_runs['post'], 'save.js')
        self.assertEqual(manifest('trim-gocache/action.yml')['runs']['post'], 'trim.js')
        # No immediate upload may run before the consumer's build/test steps.
        self.assertFalse(any(s.get('uses', '').startswith('actions/cache/save@')
                             for s in self.steps))

    def test_inputs_survive_post_phase(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / 'state'
            inputs = {'path': '/cache/build\n/cache/modules\n', 'key': 'go-cache-run-42'}
            node('save-cache/main.js', {
                'GITHUB_STATE': str(state),
                'INPUT_PATH': inputs['path'],
                'INPUT_KEY': inputs['key'],
            })
            name, value = state.read_text().strip().split('=', 1)
            self.assertEqual(name, 'cacheInputs')
            self.assertEqual(json.loads(value), inputs)
            # Intercept only the upstream upload; execute the real post wrapper.
            result = subprocess.run(
                ['node', '-e', '''
const fs = require('node:fs');
const vm = require('node:vm');
vm.runInNewContext(fs.readFileSync('save-cache/save.js', 'utf8'), {
  process,
  require(name) {
    if (name !== './dist/index.js') throw new Error('Unexpected module');
    console.log(JSON.stringify({path: process.env.INPUT_PATH, key: process.env.INPUT_KEY}));
  },
});
'''],
                cwd=ROOT,
                env={**os.environ, 'STATE_cacheInputs': value,
                     'INPUT_PATH': 'changed', 'INPUT_KEY': 'changed'},
                check=True, capture_output=True, text=True,
            )
            self.assertEqual(json.loads(result.stdout), inputs)

    def test_trim_before_upload_keeps_working_set(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp) / 'cache'
            cache.mkdir()
            state = Path(tmp) / 'state'
            old = cache / 'old'
            old.write_text('unused')
            os.utime(old, (1, 1))
            node('trim-gocache/main.js', {
                'GITHUB_STATE': str(state), 'INPUT_MAX-STALENESS-HOURS': '2',
            })
            # Simulate cache data produced by the caller after setup.
            current = cache / 'current'
            current.write_text('compiled during build')
            saved_state = dict(line.split('=', 1) for line in state.read_text().splitlines())
            node('trim-gocache/trim.js', {
                'INPUT_GOCACHE': str(cache),
                **{'STATE_' + key: value for key, value in saved_state.items()},
            })
            self.assertFalse(old.exists())
            self.assertEqual(current.read_text(), 'compiled during build')


if __name__ == '__main__':
    unittest.main()
