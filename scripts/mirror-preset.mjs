/**
 * Keep the `zsh` agent preset an exact, reviewable copy of the shipped
 * `standard` preset.
 *
 * A preset has no "standard plus one change" patch semantics: the roster
 * mounts one file, so switching the shell tool means carrying a copy of the
 * whole preset. That copy drifts every time dsh adds, removes or reconfigures
 * a row -- and it drifts *silently*, because a stale row fails only when a
 * session using the preset starts.
 *
 * This script turns the copy into a build product with two anchored edits and
 * no other difference:
 *
 *   1. the header line naming the preset;
 *   2. the shell rows, swapping `tool-bash` for `tool-zsh`.
 *
 * Everything else -- including upstream's comments explaining the realm and
 * host-plane rules, which are the reason the file is worth reading -- is copied
 * verbatim. `pnpm run check:mirror` fails loudly when the copy is stale.
 *
 * @module dsh-tool-zsh/scripts/mirror-preset
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { root, resolveDshPackagesDir, readVersion, isMain } from './dsh-packages.mjs';

/** Upstream package owning the shipped presets. */
const UPSTREAM = '@deepseek-ai/dsh-agent-presets';
/** Upstream preset directory we copy. */
const UPSTREAM_PRESET = 'presets/standard/agent.cordis.yml';
/** File we generate, relative to the repository root. */
const TARGET = join('packages', 'bundle', 'agent-presets', 'zsh', 'agent.cordis.yml');

/**
 * Header line to replace.
 *
 * Anchored on the exact upstream text so that an upstream rewording stops the
 * generator rather than silently producing a file that still claims to be
 * `standard`.
 */
const HEADER_ANCHOR = '# The `standard` agent preset: the full coding agent, mounted once per process.';

/** Replacement header, naming this preset and pointing at the executor. */
const HEADER_REPLACEMENT = [
  '# The `zsh` agent preset: the full coding agent whose shell tool is the',
  '# zsh-named `tool-zsh` instead of `tool-bash`.',
  '#',
  '# Generated from the shipped `standard` preset by scripts/mirror-preset.mjs,',
  '# which changes exactly two things: this header, and the shell rows below.',
  '# Run `pnpm run sync` after upgrading dsh and `pnpm run check:mirror` to',
  '# detect drift.',
  '#',
  '# The executor that actually runs `zsh -c` is mounted on the HOST plane by the',
  '# `@yorkew-east8/dsh-zsh-bundle` profile bundle, not here: this preset only',
  '# chooses which model-facing tool a session sees.'
].join('\n');

/**
 * Shell rows to replace, copied verbatim from the upstream `standard` preset.
 *
 * Upstream disables `tool-bash` on Windows because PowerShell is the shell
 * there. This preset disables it everywhere and adds `tool-zsh`, while keeping
 * `tool-pwsh` platform-conditional so Windows still gets a working shell tool.
 */
const SHELL_ANCHOR = [
  "- id: tool-bash",
  "  name: '@deepseek-ai/dsh-tool-bash'",
  "  disabled: !!js process.platform === 'win32'",
  '',
  "- id: tool-pwsh",
  "  name: '@deepseek-ai/dsh-tool-pwsh'",
  "  disabled: !!js process.platform !== 'win32'"
].join('\n');

/** Replacement shell rows, selecting `tool-zsh` on non-Windows platforms. */
const SHELL_REPLACEMENT = [
  "- id: tool-bash",
  "  name: '@deepseek-ai/dsh-tool-bash'",
  '  # Replaced below by `tool-zsh` (POSIX) or by `tool-pwsh` (Windows).',
  '  disabled: true',
  '',
  "- id: tool-zsh",
  "  name: '@yorkew-east8/dsh-tool-zsh'",
  "  disabled: !!js process.platform === 'win32'",
  '  config:',
  '    enableRunInBackground: true',
  '',
  "- id: tool-pwsh",
  "  name: '@deepseek-ai/dsh-tool-pwsh'",
  "  disabled: !!js process.platform !== 'win32'"
].join('\n');

/**
 * Replace one anchored block, failing loudly when the anchor is gone.
 *
 * @param text - text to edit.
 * @param anchor - exact substring to find.
 * @param replacement - text to substitute.
 * @param label - name used in the error message.
 * @returns edited text.
 */
function replaceAnchor(text, anchor, replacement, label) {
  const occurrences = text.split(anchor).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `upstream preset ${label} anchor matched ${occurrences} times, expected exactly 1.\n` +
        `dsh changed this preset. Update the anchor in scripts/mirror-preset.mjs:\n` +
        anchor
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n')
    );
  }
  return text.split(anchor).join(replacement);
}

/**
 * Compose the desired preset contents from the installed dsh.
 *
 * @param packagesDir - directory holding the dsh `@deepseek-ai/*` packages.
 * @returns `{ version, contents }`.
 */
function plan(packagesDir) {
  const upstreamDir = join(packagesDir, ...UPSTREAM.split('/'));
  const version = JSON.parse(readFileSync(join(upstreamDir, 'package.json'), 'utf8')).version;
  const sourcePath = join(upstreamDir, UPSTREAM_PRESET);
  const source = readFileSync(sourcePath, 'utf8');

  let contents = replaceAnchor(source, HEADER_ANCHOR, HEADER_REPLACEMENT, 'header');
  contents = replaceAnchor(contents, SHELL_ANCHOR, SHELL_REPLACEMENT, 'shell rows');
  return { version, contents };
}

/**
 * Report the first divergence between two texts.
 *
 * @param expected - desired contents.
 * @param actual - committed contents.
 * @returns a message, or `undefined` when equal.
 */
function firstDifference(expected, actual) {
  const a = expected.split('\n');
  const b = actual.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) {
      const context = [];
      for (let j = Math.max(0, i - 2); j < Math.min(i + 3, Math.max(a.length, b.length)); j += 1) {
        context.push(`  ${j + 1} expected: ${a[j] ?? '<eof>'}`);
        context.push(`  ${j + 1} actual:   ${b[j] ?? '<eof>'}`);
      }
      return `first difference at line ${i + 1}:\n${context.join('\n')}`;
    }
  }
  return undefined;
}

const mode = process.argv.includes('--check') ? 'check' : process.argv.includes('--write') ? 'write' : undefined;
if (mode === undefined) {
  console.error('usage: node scripts/mirror-preset.mjs --write | --check');
  process.exit(2);
}

if (isMain(import.meta.url)) {
  const packagesDir = resolveDshPackagesDir();
  const { version, contents } = plan(packagesDir);
  const installed = await readVersion(packagesDir, UPSTREAM);
  const path = join(root, TARGET);

  if (mode === 'write') {
    if (existsSync(path) && readFileSync(path, 'utf8') === contents) {
      console.log(`${UPSTREAM}@${version} -> ${TARGET}\n  already up to date`);
    } else {
      writeFileSync(path, contents);
      console.log(`${UPSTREAM}@${version} -> ${TARGET}\n  wrote ${TARGET}`);
    }
    process.exit(0);
  }

  if (!existsSync(path)) {
    console.error(`${TARGET}: missing. Run \`pnpm run sync\`.`);
    process.exit(1);
  }
  const difference = firstDifference(contents, readFileSync(path, 'utf8'));
  if (difference !== undefined) {
    console.error(`${TARGET} is out of sync with ${UPSTREAM}@${installed}:`);
    console.error(`  ${difference}`);
    console.error('\nRun `pnpm run sync`, review the diff, and commit.');
    process.exit(1);
  }
  if (version !== installed) {
    console.log(`note: preset generated from ${version}, installed is ${installed}`);
  }
  console.log(`${TARGET} matches ${UPSTREAM}@${installed}`);
  process.exit(0);
}
