/**
 * `tool-zsh` is a rename of `@deepseek-ai/dsh-tool-bash`, so the strongest
 * thing we can assert is a *differential* one: run the shipped plugin and ours
 * against identical contexts and check that every difference is exactly the
 * bash -> zsh rename, and nothing else.
 *
 * This is what turns an upstream upgrade into a loud, specific failure instead
 * of a silently wrong tool. It runs against the installed dsh, so it also
 * pins the one deliberate semantic difference: the prompt-section slot.
 *
 * @module dsh-tool-zsh/test/tool-zsh.test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureResolution, mockToolContext } from './helpers.mjs';

ensureResolution();

const upstream = await import('@deepseek-ai/dsh-tool-bash');
const ours = await import('../packages/tool-zsh/lib/index.js');

/** Section order table as the host system-prompt service defines it. */
const ORDER = { TOOL_BASH: 1000, TOOL_PWSH: 1010 };

/** Run one plugin against a fresh mock context. */
function mount(plugin) {
  const harness = mockToolContext(ORDER);
  plugin.apply(harness.ctx, { enableRunInBackground: true });
  assert.equal(harness.tools.length, 1, `${plugin.name} must register exactly one tool`);
  assert.equal(harness.sections.length, 1, `${plugin.name} must register exactly one section`);
  return { tool: harness.tools[0], section: harness.sections[0], orderQueries: harness.orderQueries };
}

const shipped = mount(upstream);
const renamed = mount(ours);

/** The rename the mirror is allowed to perform. */
const toZsh = (text) => text.split('Bash').join('Zsh').split('bash').join('zsh');

test('registers the same tool under the zsh name', () => {
  assert.equal(shipped.tool.name, 'bash');
  assert.equal(renamed.tool.name, 'zsh');
  assert.equal(upstream.name, 'tool-bash');
  assert.equal(ours.name, 'tool-zsh');
});

test('registers the same prompt section under the zsh name', () => {
  assert.equal(shipped.section.name, 'tool:bash');
  assert.equal(renamed.section.name, 'tool:zsh');
});

test('takes the prompt-section slot upstream uses, not a hardcoded literal', () => {
  assert.deepEqual(shipped.orderQueries, ['TOOL_BASH']);
  assert.deepEqual(renamed.orderQueries, ['TOOL_BASH'], 'tool-zsh must resolve its order through the host table');
  assert.equal(renamed.section.order, shipped.section.order);
  assert.equal(renamed.section.order, ORDER.TOOL_BASH);
});

test('differs from upstream by the rename and nothing else', () => {
  assert.equal(renamed.section.text, toZsh(shipped.section.text));
  assert.equal(renamed.tool.description, toZsh(shipped.tool.description));
  assert.deepEqual(
    renamed.tool.parameters,
    JSON.parse(toZsh(JSON.stringify(shipped.tool.parameters))),
    'the parameter schema must match upstream apart from the rename'
  );
});

test('exposes the same configuration contract', () => {
  assert.deepEqual(ours.Config({ enableRunInBackground: false }), upstream.Config({ enableRunInBackground: false }));
  assert.deepEqual(ours.Config({}), upstream.Config({}));
  assert.deepEqual(ours.inject, upstream.inject);
});

test('keeps the shipped tool surface', () => {
  for (const key of ['execute', 'presentCall', 'presentResult']) {
    assert.equal(typeof renamed.tool[key], typeof shipped.tool[key], `${key} must match upstream`);
  }
});
