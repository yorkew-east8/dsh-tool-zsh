/**
 * zsh executor for the dsh `ctx.shell` capability seam.
 *
 * dsh hardcodes the shell argv inside its executors: `dsh-bash-sandbox` builds
 * `["bash", "-c", command]` and `dsh-pwsh-sandbox` builds the PowerShell twin.
 * Neither parameterises the shell, so selecting zsh means supplying an
 * executor that produces `["zsh", "-c", command]`.
 *
 * Rather than fork the executor, this plugin *subclasses* the shipped one. The
 * upstream class funnels every command through `this.confine(command, policy)`
 * -- `run()` and `start()` both call it -- so that single method is the seam
 * the package was built around. Overriding it reuses, unchanged and for free:
 *
 *   - sandbox mode resolution and the `danger-full-access` fast path
 *   - runner-failure classification and `SANDBOX_UNAVAILABLE` reporting
 *   - denial signature matching
 *   - per-process confinement facts tracked until settlement
 *   - approval/escalation plumbing and the `sandboxMode` capability fact
 *
 * Because only that one seam is touched, upstream fixes and new confinement
 * behaviour arrive automatically on upgrade: there is no copied source here to
 * drift. The remaining coupling is deliberately tiny and stable -- the exported
 * class, the `confine` hook, `this.ctx` (a public field of cordis `Service`),
 * and the `ctx.sandbox.confine(argv, policy)` provider contract.
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
export class ZshSandboxExecutor extends SandboxBashExecutor {
  /**
   * Wrap one shell command via the `ctx.sandbox` provider, forcing zsh.
   *
   * Provider errors propagate unchanged; the returned argv is handed directly
   * to the local executor's subprocess path, exactly as upstream does.
   *
   * @param command - shell source for the confined inner `zsh -c`.
   * @param policy - resolved confined execution policy.
   * @returns the provider's exact argv and settlement-classification facts.
   */
  confine(command, policy) {
    return this.ctx.sandbox.confine(['zsh', '-c', command], policy);
  }
}

export default ZshSandboxExecutor;
