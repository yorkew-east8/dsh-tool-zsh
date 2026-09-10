/**
 * Locate the `@deepseek-ai/*` packages that the running dsh provides.
 *
 * These packages are never installed into this repository. At runtime the dsh
 * loader resolves our packages' bare `@deepseek-ai/*` imports by parent-walk
 * from the profile's `node_modules`, whose hoisted closure is symlinked to the
 * dsh installation. Scripts and tests here use the same directory, so what we
 * mirror and verify is exactly what dsh will load.
 *
 * @module dsh-tool-zsh/scripts/dsh-packages
 */

import { existsSync, mkdirSync, symlinkSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

/** Repository root (the directory containing `packages/`). */
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Probe file that must exist inside a candidate packages directory. */
const PROBE = join('@deepseek-ai', 'dsh-tool-bash', 'package.json');

/**
 * Resolve the directory holding the dsh `@deepseek-ai/*` packages.
 *
 * @returns the first candidate that contains the probe package.
 * @throws when no candidate qualifies, with the list that was tried.
 */
export function resolveDshPackagesDir() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh');
  const candidates = [
    process.env.DSH_PACKAGES_DIR,
    join(home, 'profiles', 'node_modules'),
    join(home, 'profiles', 'web', 'node_modules')
  ].filter((candidate) => typeof candidate === 'string' && candidate.length > 0);

  for (const candidate of candidates) {
    if (existsSync(join(candidate, PROBE))) return realpathSync(candidate);
  }

  throw new Error(
    `cannot locate the dsh @deepseek-ai packages; tried:\n` +
      candidates.map((candidate) => `  - ${candidate}`).join('\n') +
      `\nSet DSH_PACKAGES_DIR to the directory containing @deepseek-ai/.`
  );
}

/**
 * Make our packages' `@deepseek-ai/*` imports resolvable from this repository.
 *
 * Links `<repo>/node_modules/@deepseek-ai` to the dsh scope rather than
 * replacing `node_modules` itself, so this coexists with a `pnpm install`
 * instead of being clobbered by it. Published packages never rely on this: dsh
 * resolves them through its own parent-walk fallback.
 *
 * @returns the resolved dsh packages directory.
 */
export function ensureResolution() {
  const target = resolveDshPackagesDir();
  const scope = join(target, '@deepseek-ai');
  const link = join(root, 'node_modules', '@deepseek-ai');

  if (!existsSync(link)) {
    mkdirSync(join(root, 'node_modules'), { recursive: true });
    symlinkSync(scope, link, 'dir');
    return target;
  }
  if (!existsSync(join(link, 'dsh-tool-bash', 'package.json'))) {
    throw new Error(
      `${link} exists but does not provide the dsh packages. Remove it so the ` +
        `resolver can link ${scope}.`
    );
  }
  return target;
}

/**
 * Read the version of an installed `@deepseek-ai/*` package.
 *
 * @param packagesDir - directory returned by {@link resolveDshPackagesDir}.
 * @param name - package name, e.g. `@deepseek-ai/dsh-tool-bash`.
 * @returns the `version` field.
 */
export async function readVersion(packagesDir, name) {
  const manifest = join(packagesDir, ...name.split('/'), 'package.json');
  const { readFileSync } = await import('node:fs');
  return JSON.parse(readFileSync(manifest, 'utf8')).version;
}

/**
 * Whether a module is the process entry point rather than an import.
 *
 * Lets the mirror scripts export their logic for tests while still behaving as
 * commands when run directly.
 *
 * @param importMetaUrl - the caller's `import.meta.url`.
 * @returns true when this module was launched as the main script.
 */
export function isMain(importMetaUrl) {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(importMetaUrl));
  } catch {
    return pathToFileURL(entry).href === importMetaUrl;
  }
}

/** Absolute path helper mirroring `import.meta.dirname` for older Node. */
export { dirname, join, resolve, mkdirSync };
