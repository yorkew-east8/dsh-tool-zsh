# @yorkew-east8/dsh-zsh-sandbox

让 DeepSeek Harness（dsh）的 shell 执行器跑 `zsh -c`，而不是 `bash -c`。

## 它怎么做的

dsh 把 shell 写死在执行器里：`dsh-bash-sandbox` 拼 `["bash","-c",command]`，`dsh-pwsh-sandbox` 拼 PowerShell。这个包**不复制**执行器，而是继承它、只覆盖一个方法：

```js
import { SandboxBashExecutor } from '@deepseek-ai/dsh-bash-sandbox';

export class ZshSandboxExecutor extends SandboxBashExecutor {
  confine(command, policy) {
    return this.ctx.sandbox.confine(['zsh', '-c', command], policy);
  }
}
```

`confine()` 是上游自己定义的扩展点：`run()` 和 `start()` 都把命令交给它再拼 argv。覆盖它之后，以下行为全部原样继承——**包括未来上游的修复和新行为**：

- sandbox mode 解析与 `danger-full-access` 直通
- runner 失败归类与 `SANDBOX_UNAVAILABLE` 上报
- denial 签名匹配
- 每个进程的 confinement facts（保留到进程结束）
- 审批 / escalation 管线，以及 `sandboxMode` 能力事实

因此**这个包不会随 dsh 升级而漂移**：这里没有拷贝来的源码。全部耦合只有 4 项，都是稳定接口：

| 依赖 | 说明 |
|---|---|
| `SandboxBashExecutor` | 上游导出的执行器类 |
| `confine(command, policy)` | 上游为子类预留的 argv 拼装钩子 |
| `this.ctx` | cordis `Service` 的公开字段（`Service` 构造函数的文档化行为） |
| `ctx.sandbox.confine(argv, policy)` | sandbox provider 的能力契约 |

## 安装

```bash
dsh plugin --profile web add @yorkew-east8/dsh-zsh-bundle
```

单独装（一般不需要）：`dsh plugin --profile web add @yorkew-east8/dsh-zsh-sandbox`。

## 注意

同一个 context 只能有一个 `shell` 提供者（执行器注册的就是 `shell` 服务）。本包必须与 `bash-sandbox` **二选一**：bundle 已经 disable 掉 `bash-sandbox`，Windows 上则是本包和 `bash-sandbox` 一起被 disable、由 `pwsh-sandbox` 顶替。
