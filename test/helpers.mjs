/**
 * Shared fixtures for the verification suite.
 *
 * These tests run against the *installed* dsh, using the same parent-walk
 * resolution the dsh loader uses at runtime, so they assert what dsh will
 * actually load rather than what a local `node_modules` happens to contain.
 *
 * @module dsh-tool-zsh/test/helpers
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { ensureResolution, root, resolveDshPackagesDir } from '../scripts/dsh-packages.mjs';

export { ensureResolution, root, resolveDshPackagesDir };

/** The generated zsh agent preset. */
export const presetPath = join(root, 'packages', 'bundle', 'agent-presets', 'zsh', 'agent.cordis.yml');

/** Our own packages, which are not part of the dsh closure. */
const LOCAL_PACKAGES = new Map([
  ['@yorkew-east8/dsh-tool-zsh', join(root, 'packages', 'tool-zsh', 'lib', 'index.js')],
  ['@yorkew-east8/dsh-zsh-sandbox', join(root, 'packages', 'zsh-sandbox', 'lib', 'index.js')]
]);

/**
 * Load and parse the generated preset.
 *
 * `!!js` tags hold host expressions that only the dsh loader can evaluate.
 * They are flattened to plain scalars first, which is enough to inspect the
 * row structure and to feed `config` blocks to the real plugin schemas.
 *
 * @returns the parsed entry list.
 */
export async function loadPreset() {
  // Resolved from inside the dsh closure: only the `@deepseek-ai` scope is
  // linked into this repository, so dsh's own dependencies are reached through
  // it rather than through a repository-level install.
  const require = createRequire(join(resolveDshPackagesDir(), 'noop.js'));
  const { parse } = require('yaml');
  const raw = readFileSync(presetPath, 'utf8');
  return parse(raw.replace(/\s*!!js\s+/g, ' '));
}

/**
 * Import the plugin module a preset row names.
 *
 * Sub-path rows such as `@deepseek-ai/dsh-tool-subagent-control/list-agents`
 * are alternate registrations of the package root, so the root is imported.
 *
 * @param name - the row's `name` field.
 * @returns the module namespace, or `undefined` when it is not a package row.
 */
export async function importPlugin(name) {
  if (typeof name !== 'string') return undefined;
  const local = LOCAL_PACKAGES.get(name);
  if (local !== undefined) return import(pathToFileURL(local).href);
  if (!name.startsWith('@deepseek-ai/')) return undefined;

  const packageName = name.split('/').slice(0, 2).join('/');
  try {
    return await import(packageName);
  } catch {
    return undefined;
  }
}

/**
 * Extract a plugin's config schema, whichever way it exports one.
 *
 * @param module - module namespace from {@link importPlugin}.
 * @returns the schema, or `undefined` when the plugin declares none.
 */
export function configSchemaOf(module) {
  if (module === undefined) return undefined;
  const candidate = module.Config ?? module.default?.Config;
  return typeof candidate === 'function' ? candidate : undefined;
}

/**
 * Whether a value is a plain object, as opposed to a group's nested entry list.
 *
 * @param value - value to test.
 * @returns true for a non-array, non-null object.
 */
export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Build a minimal cordis context capturing tool and prompt registrations.
 *
 * @param orderTable - section order table backing `getSectionOrder`.
 * @returns `{ ctx, tools, sections, orderQueries }`.
 */
export function mockToolContext(orderTable) {
  const tools = [];
  const sections = [];
  const orderQueries = [];
  const ctx = {
    tools: { register: (tool) => tools.push(tool) },
    systemPrompt: {
      section: (section) => sections.push(section),
      getSectionOrder: (name) => {
        orderQueries.push(name);
        return orderTable[name];
      }
    },
    shell: { sandboxMode: undefined },
    get: () => undefined,
    on: () => {}
  };
  return { ctx, tools, sections, orderQueries };
}
