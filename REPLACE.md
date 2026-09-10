# REPLACE.md — 用 dsh-tool-zsh 替换 dsh-tool-bash

目标：把 DeepSeek Harness 的命令执行从 `bash -c` 换成 `zsh -c`（并可选地把模型侧工具名从 `bash` 换成 `zsh`），且可随时回滚。

## 前提

- `dsh` 已装。本仓库针对 **`dsh@0.1.5-rc.1`** 验证（`npm view @deepseek-ai/dsh dist-tags` → `latest`/`next` 均为 `0.1.5-rc.1`）。
- `pnpm` 在 PATH 上（`dsh plugin` 需要）：`npm install -g pnpm`。
- 目标 profile 名称（默认 `web`）。

## 一、只让命令走 zsh（功能核心，推荐先做这步）

```bash
dsh plugin --profile web add @yorkew-east8/dsh-zsh-bundle
```

这一步：

1. 安装 `zsh-sandbox`、`tool-zsh` 两个依赖包；
2. 把 bundle 的 `cordis.patch.yml`（disable `bash-sandbox` + insert `zsh-sandbox`）并入 profile 的 bundle 层。

效果：host-plane 的 `ctx.shell` 从 `bash-sandbox` 换成 `zsh-sandbox`，**所有 session 的命令改用 `zsh -c` 执行**。模型侧工具名此时仍是 `bash`（描述文字仍写 `bash -c`），但实际走 zsh。

> 为什么 bundle 不换工具名：web 表面 host 层的 `tool-bash` 已被 `dsh-web-app` bundle disable，工具由每个 session 的 agent preset 挂载，在 host 层换会和 preset 冲突。

### 验证命令真的走 zsh

在任意 session 里跑 `echo $0` / `echo $ZSH_VERSION`，或 `print -l`（zsh 专属内置），命中即 zsh。

## 二、把模型侧工具也改成 `zsh`（web 表面）

web 表面工具由 agent preset 挂载，需把本仓库提供的 `zsh` preset 装进用户层并设为默认。

```bash
# 1) 复制 preset（$DSH_HOME 默认 ~/.dsh）
cp -R packages/bundle/agent-presets/zsh "$DSH_HOME/.agent-presets/zsh"
```

该 preset 是 dsh 自带 `standard` preset 的**生成副本**，只改两处：文件头注释、shell 行（`tool-bash` 全平台 disabled，新增 `tool-zsh`，`tool-pwsh` 保持平台条件）。

```bash
# 2) 设默认 preset 为 zsh（新 session 生效）
# 编辑 $DSH_HOME/settings.yaml 增加：
#   agent-presets:
#     default: zsh
```

新建 session（或切到 `zsh` preset）后，模型看到的是 `zsh` 工具。

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

并把 `$DSH_HOME/settings.yaml` 的 `agent-presets.default` 改回 `standard`（或删除），新 session 恢复 bash。

手动回滚（不卸载）：编辑 `~/.dsh/profiles/web/cordis.patch.yml`，删掉 `bash-sandbox: disabled` 与 `zsh-sandbox` 两段。

## 四、升级 dsh 之后

```bash
pnpm run sync           # 用新装的 dsh 重新生成 tool-zsh 与 preset
pnpm run verify         # 漂移检测 + 测试
```

- **`zsh-sandbox` 不需要任何操作**：它是 `SandboxBashExecutor` 的子类，只覆盖 `confine()`，上游改进自动继承。
- **`tool-zsh` / preset 需要重同步**：它们是生成副本。`pnpm run check:mirror` 会重新生成并逐行比对，漂移时退出非 0 并打印第一处差异所在行。
- 若 `sync` 报锚点匹配失败（preset 的 shell 行被上游改写），说明上游动了这个 preset，按报错提示更新 `scripts/mirror-preset.mjs` 里的锚点。

## 注意事项

- **同 context 只能有一个 `shell` 提供者**：`zsh-sandbox`、`bash-sandbox`、`pwsh-sandbox` 都提供 `ctx.shell`，必须只留一个。bundle 已处理（POSIX 留 zsh，Windows 留 pwsh）。
- 不要手动改 `@deepseek-ai/dsh` 安装目录里的 `bash-sandbox` 源码——`npm update`/重装会被覆盖。
- `@deepseek-ai/*`、`@deepseek-ai/schemastery` 一律是 `peerDependencies` 且值为 `*`，由 dsh 运行时提供。仓库根的 `.npmrc` 设了 `auto-install-peers=false`，避免 pnpm 把 registry 上那个陈旧的 `0.0.1-rc.1` 装进来。要装就走 `dsh plugin --profile <name> add <pkg>`。
