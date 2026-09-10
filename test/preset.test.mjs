/**
 * The generated `zsh` preset must actually mount on the installed dsh.
 *
 * A preset is a list of plugin rows, and every row's `config` is validated
 * against that plugin's real schema. This is the check that would have caught
 * the preset shipping `dsh-persona` a `text:` field after upstream replaced it
 * with a required `prefix:` -- a failure that only surfaces when a session
 * using the preset starts, long after the file was written.
 *
 * @module dsh-tool-zsh/test/preset.test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureResolution, loadPreset, importPlugin, configSchemaOf, isPlainObject } from './helpers.mjs';

ensureResolution();

const rows = await loadPreset();

test('parses as a flat entry list', () => {
  assert.ok(Array.isArray(rows));
  assert.ok(rows.length > 0);
});

test('mounts the zsh tool and retires the bash tool', () => {
  const byId = new Map(rows.filter(isPlainObject).map((row) => [row.id, row]));

  assert.equal(byId.get('tool-bash')?.disabled, true);
  assert.equal(byId.get('tool-zsh')?.name, '@yorkew-east8/dsh-tool-zsh');
  assert.equal(byId.get('tool-zsh')?.disabled, "process.platform === 'win32'");
  assert.deepEqual(byId.get('tool-zsh')?.config, { enableRunInBackground: true });
});

test('keeps the Windows PowerShell twin platform-conditional', () => {
  const row = rows.find((entry) => isPlainObject(entry) && entry.id === 'tool-pwsh');
  assert.equal(row?.name, '@deepseek-ai/dsh-tool-pwsh');
  assert.equal(row?.disabled, "process.platform !== 'win32'");
});

test('carries the rows upstream added after this preset was first copied', () => {
  const ids = new Set(rows.filter(isPlainObject).map((row) => row.id));
  for (const required of ['persona', 'command-goal', 'present', 'tool-fs', 'tool-skill', 'tool-goal']) {
    assert.ok(ids.has(required), `preset is missing the ${required} row`);
  }
});

test('every row config satisfies the real plugin schema', async () => {
  const validated = [];
  const skipped = [];

  for (const row of rows) {
    if (!isPlainObject(row) || row.config === undefined) continue;
    if (typeof row.name !== 'string' || row.name.startsWith('cordis:')) continue;
    if (!isPlainObject(row.config)) continue;

    const module = await importPlugin(row.name);
    const schema = configSchemaOf(module);
    if (schema === undefined) {
      skipped.push(row.id ?? row.name);
      continue;
    }
    try {
      schema(row.config);
    } catch (error) {
      assert.fail(`${row.id ?? row.name} (${row.name}) config is invalid: ${error.message}`);
    }
    validated.push(row.id ?? row.name);
  }

  assert.deepEqual(skipped, [], `rows whose schema could not be resolved: ${skipped.join(', ')}`);
  assert.ok(validated.length > 0, 'expected at least one row config to validate');
  // The persona row is the one that silently broke when upstream replaced its
  // `text:` field with a required `prefix:`.
  assert.ok(validated.includes('persona'), `persona was not validated; validated: ${validated.join(', ')}`);
  assert.ok(validated.includes('tool-zsh'), `tool-zsh was not validated; validated: ${validated.join(', ')}`);
});

test('every referenced plugin package is actually installed', async () => {
  const missing = [];

  for (const row of rows) {
    if (!isPlainObject(row) || typeof row.name !== 'string') continue;
    if (row.name.startsWith('cordis:')) continue;
    if ((await importPlugin(row.name)) === undefined) missing.push(`${row.id} -> ${row.name}`);
  }

  assert.deepEqual(missing, [], `preset references plugins that dsh does not provide:\n  ${missing.join('\n  ')}`);
});
