/**
 * The zsh executor must be a *subclass* of the shipped sandbox executor, not a
 * fork of it: that is what makes it immune to dsh upgrades.
 *
 * @module dsh-tool-zsh/test/zsh-sandbox.test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureResolution } from './helpers.mjs';

ensureResolution();

const ours = await import('../packages/zsh-sandbox/lib/index.js');
const upstream = await import('@deepseek-ai/dsh-bash-sandbox');

/** Build an executor instance without running the service constructor. */
function seam(confine) {
  const executor = Object.create(ours.ZshSandboxExecutor.prototype);
  executor.ctx = { sandbox: { confine } };
  return executor;
}

test('exports the zsh executor as both a named and the default export', () => {
  assert.equal(typeof ours.ZshSandboxExecutor, 'function');
  assert.equal(ours.default, ours.ZshSandboxExecutor);
});

test('extends the shipped executor rather than copying it', () => {
  const base = upstream.SandboxBashExecutor;
  assert.equal(typeof base, 'function');
  assert.ok(base.isPrototypeOf(ours.ZshSandboxExecutor));
  assert.ok(ours.ZshSandboxExecutor.prototype instanceof base);
});

test('inherits inject and Config from upstream instead of restating them', () => {
  assert.deepEqual(ours.ZshSandboxExecutor.inject, upstream.SandboxBashExecutor.inject);
  assert.deepEqual(ours.ZshSandboxExecutor.inject, ['subprocess', 'sandbox', 'sandboxPolicy']);
  assert.equal(ours.ZshSandboxExecutor.Config, upstream.SandboxBashExecutor.Config);
});

test('overrides exactly one method', () => {
  const inherited = Object.getOwnPropertyNames(ours.ZshSandboxExecutor.prototype)
    .filter((key) => key !== 'constructor')
    .sort();
  assert.deepEqual(inherited, ['confine']);
});

test('confine() builds a zsh argv in every sandbox mode', async () => {
  const executor = seam((argv) => argv);
  for (const mode of ['read-only', 'workspace-write', 'danger-full-access']) {
    const argv = await ours.ZshSandboxExecutor.prototype.confine.call(executor, 'echo $ZSH_VERSION', { mode });
    assert.deepEqual(argv, ['zsh', '-c', 'echo $ZSH_VERSION'], `mode ${mode}`);
  }
});

test('confine() forwards the policy and the provider result untouched', async () => {
  const policy = { mode: 'workspace-write', workspaceRoot: '/tmp' };
  let received;
  const executor = seam((argv, receivedPolicy) => {
    received = { argv, policy: receivedPolicy };
    return { argv, enforcement: 'kernel', denialSignatures: [] };
  });

  const result = await ours.ZshSandboxExecutor.prototype.confine.call(executor, 'ls -la', policy);

  assert.deepEqual(received.argv, ['zsh', '-c', 'ls -la']);
  assert.equal(received.policy, policy, 'the policy object must be passed through by identity');
  assert.deepEqual(result, { argv: ['zsh', '-c', 'ls -la'], enforcement: 'kernel', denialSignatures: [] });
});

test('confine() propagates provider errors unchanged', () => {
  const failure = new Error('SANDBOX_UNAVAILABLE');
  const executor = seam(() => {
    throw failure;
  });
  // `confine` is synchronous upstream, so a provider that throws must throw
  // here too rather than being wrapped into a rejected promise.
  assert.throws(
    () => ours.ZshSandboxExecutor.prototype.confine.call(executor, 'ls', { mode: 'workspace-write' }),
    (error) => error === failure
  );
});
