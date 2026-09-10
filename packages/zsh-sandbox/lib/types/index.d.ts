/**
 * Sandbox-consuming zsh executor: `SandboxBashExecutor` with a zsh argv.
 *
 * Deliberately declared as a bare subclass. The interesting behaviour lives in
 * the overridden `confine` method, which upstream marks `private` and which
 * consumers never call directly, so restating it here would only add a second
 * thing to keep in sync with dsh.
 *
 * @module @yorkew-east8/dsh-zsh-sandbox
 */

import { SandboxBashExecutor } from '@deepseek-ai/dsh-bash-sandbox';

/**
 * Sandbox-consuming zsh executor.
 *
 * Registers as `ctx.shell` and behaves exactly like `SandboxBashExecutor`
 * except that the confined inner shell is `zsh -c`.
 */
export declare class ZshSandboxExecutor extends SandboxBashExecutor {}

export default ZshSandboxExecutor;
