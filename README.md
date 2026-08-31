# dsh-tool-zsh

让 [@deepseek-ai/dsh](https://github.com/deepseek-ai/deepseek-harness)（DeepSeek Harness）的 shell 无缝改走 **zsh**：把执行器从 `bash-sandbox` 换成 `zsh-sandbox`，并把模型侧工具从 `bash` 换成 `zsh`。

## 它改什么

dsh 里 shell 的"bash"是**写死在执行器**里的（`bash-local` 与 `bash-sandbox` 的 argv 都是 `["bash","-c",cmd]`）。本仓库提供三个可发布包：

| 包 | 作用 |
|---|---|
| `@yorkew-east8/dsh-zsh-sandbox` | zsh 执行器：`SandboxBashExecutor` 的镜像，argv 改 `["zsh","-c",cmd]`，沙箱、denial、escalation、timeout、spill 语义完全一致 |
| `@yorkew-east8/dsh-tool-zsh` | 模型侧 `zsh` 工具：`dsh-tool-bash` 的镜像，注册名为 `zsh` 的工具，调用已挂载的 `ctx.shell` |
| `@yorkew-east8/dsh-zsh-bundle` | 一键 profile bundle：disable `bash-sandbox`、insert `zsh-sandbox`（host-plane 执行器交换） |

以及一个 agent preset（`agent-presets/zsh/`）——`standard` 的副本，仅把 shell 行换成 `tool-zsh`，用于 web 表面把工具名也改成 `zsh`。

## 快速开始（web 表面）

```bash
# 1) 安装 bundle，把 host-plane 执行器换成 zsh（命令从此走 zsh）
dsh plugin --profile web add @yorkew-east8/dsh-zsh-bundle
```

这会安装 `zsh-sandbox` 并 disable `bash-sandbox`。**命令立刻改用 zsh 执行**（模型侧工具名仍为 `bash`）。

### 把工具名也改成 `zsh`（可选）

web 表面与 headless 的表现不同：

- **web**：工具由每个 session 的 agent preset 挂载。把本仓库的 `agent-presets/zsh/` 复制到 `$DSH_HOME/.agent-presets/zsh/`，然后在 `settings.yaml` 里把默认 preset 设为 `zsh`：
  ```yaml
  agent-presets:
    default: zsh
  ```
- **headless/tui**：在配置文件/`--patch` 里 disable `tool-bash`、insert `tool-zsh`。

## 回滚

在 `~/.dsh/profiles/web/cordis.patch.yml` 里删掉 zsh 相关行（或 `dsh plugin --profile web remove @yorkew-east8/dsh-zsh-bundle`），重启后回到 bash。

## 开发与发布

```bash
pnpm install            # monorepo
pnpm -r publish         # 依次发布三个包（zsh-sandbox → tool-zsh → bundle）
```

详见 [REPLACE.md](REPLACE.md)（替换/回滚说明）与 [AGENTS.md](AGENTS.md)（面向执行代理的实现与约束）。
