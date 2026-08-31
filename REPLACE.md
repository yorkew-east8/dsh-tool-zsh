# REPLACE.md — 用 dsh-tool-zsh 替换 dsh-tool-bash

目标：把 DeepSeek Harness 的命令执行从 `bash -c` 换成 `zsh -c`（并可选地把模型侧工具名从 `bash` 换成 `zsh`），且可随时回滚。

## 前提

- `dsh` 已装（本仓库针对 `dsh@0.1.1-rc.2` 验证）。
- `pnpm` 在 PATH 上（`dsh plugin` 需要）：`npm install -g pnpm`。
- 目标 profile 名称（默认 `web`）。

## 一、只让命令走 zsh（功能核心，推荐先做这步）

```bash
dsh plugin --profile web add @yorkew-east8/dsh-zsh-bundle
```

这一步：
1. 安装 `zsh-sandbox`、`tool-zsh` 两个包（bundle 的依赖）。
2. 把 bundle 的 `cordis.patch.yml`（`disable bash-sandbox` + `insert zsh-sandbox`）并入 profile 的 bundle 层。

效果：host-plane 执行器 `ctx.shell` 从 `bash-sandbox` 换成 `zsh-sandbox`，**所有 session 的命令改用 `zsh -c` 执行**。模型侧工具名此时仍是 `bash`（描述文字仍写 `bash -c`），但实际走 zsh。

> 说明：本 step 是"功能核心"。web 表面 host 层的 `tool-bash` 已被 `web-app` bundle 禁用、工具由每个 session 的 agent preset 挂载，所以 bundle 只换执行器、不碰工具名——这正是避免 web 表面出现 host 层工具与 preset 工具冲突的原因。

### 验证命令真的走 zsh

在任意 session 里跑 `echo $0` / `echo $ZSH_VERSION`，或 `print -l`（zsh 专属 glob 内置），命中即 zsh。

## 二、把模型侧工具也改成 `zsh`（web 表面）

web 表面工具由 agent preset 挂载，需把本仓库提供的 `zsh` preset 装进用户层并设为默认。

```bash
# 1) 复制 preset（如 profile 已装 bundle，可把包里的文件拷出来，或直接从仓库拿）
cp -R agent-presets/zsh "$DSH_HOME/.agent-presets/zsh"   # $DSH_HOME 默认 ~/.dsh
```

`agent-presets/zsh/` 是 `standard` presets 的完整副本，仅把 shell 行从 `tool-bash` 换成 `tool-zsh`，并 `disabled` 掉 `tool-bash`。

```bash
# 2) 设默认 preset 为 zsh（新 session 生效）
# 编辑 $DSH_HOME/settings.yaml 增加：
#   agent-presets:
#     default: zsh
```

新建 session（或切换到 `zsh` preset 的空白 session）后，模型看到的是 `zsh` 工具。

### headless / tui 表面

这些表面在 host 层挂 `tool-bash`，直接在配置/`--patch` 里换工具名即可：

```yaml
- id: tool-bash
  disabled: true
- insert:
    - id: tool-zsh
      name: '@yorkew-east8/dsh-tool-zsh'
```

## 三、回滚

```bash
dsh plugin --profile web remove @yorkew-east8/dsh-zsh-bundle
```

并把 `$DSH_HOME/settings.yaml` 的 `agent-presets.default` 改回 `standard`（或删除），新 session 恢复 bash。若 bundle 已把 `zsh-sandbox` 写进 profile，重置后 host 层回到 `bash-sandbox`。

手动回滚（不卸载）：编辑 `~/.dsh/profiles/web/cordis.patch.yml`，删掉 `bash-sandbox: disabled` 与 `zsh-sandbox` 两段。

## 注意事项

- **同 profile 只能有一个 `shell` 提供者**：`zsh-sandbox` 与 `bash-sandbox` 都提供 `ctx.shell`，必须 disable 其中一个。bundle 已处理。
- 不要手动改 `@deepseek-ai/dsh` 安装目录里的 `bash-sandbox` 源码——`npm update`/重装会被覆盖。
- `@deepseek-ai/*`、`@deepseek-ai/schemastery` 是 peer 依赖，由 dsh 运行时提供；请勿把包当作普通 npm 库单独 `npm install`（要装就通过 `dsh plugin --profile <name> add <pkg>`）。
