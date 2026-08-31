# AGENTS.md — dsh-tool-zsh 实现与维护说明

面向执行代理（及后续维护者）的事实与约束。面向人类的入口是 `README.md`，替换/回滚操作是 `REPLACE.md`。本文件独立包含实现所需信息。

## 仓库是什么

一个 pnpm 单仓库（`pnpm-workspace.yaml`，`packages/*`），把 DeepSeek Harness（dsh）的 shell 从 bash 换成 zsh。三个可发布包 + 一个 preset 目录：

```
packages/zsh-sandbox/   @yorkew-east8/dsh-zsh-sandbox  （执行器）
packages/tool-zsh/      @yorkew-east8/dsh-tool-zsh     （模型侧工具）
packages/bundle/        @yorkew-east8/dsh-zsh-bundle   （profile bundle，一键安装入口）
  agent-presets/zsh/     preset（standard 副本，shell 行换成 tool-zsh）
```

## 关键事实（为什么这样改）

- 模型侧工具 `tool-bash`（`@deepseek-ai/dsh-tool-bash`）**shell 无关**：只调 `ctx.shell.run(ctx.shell.resolve(req))`，从不拼 `bash`。见其 `lib/index.js` 的 `inject = ["tools","shell","systemPrompt","shellEnv"]`。
- "bash" 写死在执行器里，两处 argv：`LocalBashExecutor.run()/start()`（`@deepseek-ai/dsh-bash-local`）和 `SandboxBashExecutor.confine()`（`@deepseek-ai/dsh-bash-sandbox`）。
- macOS/web 下实际挂的 `ctx.shell` 是 `bash-sandbox`，属 **host-plane** 行（`@deepseek-ai/dsh-base` bundle，`cordis.patch.yml` 中 `id: bash-sandbox`）。一次挂载、所有 session 共享。
- web 表面由 `@deepseek-ai/dsh-web-app` bundle 把 host 层的 `tool-bash` 等行 `disabled:true`，每个 session 的工具由 agent preset（`standard`）挂载。**这决定了 web 上"改工具名"必须走 preset，不能只改 host 层。**
- `ShellExecutor extends Service`，构造 `super(ctx,"shell")`——提供的 service 名是 `shell`。**同一 context 只能有一个 `shell` 提供者**，挂第二个会抛 duplicate-service。所以 `zsh-sandbox` 必须 `disabled` 掉 `bash-sandbox`。

## 两个包的实现方式

两者都是**镜像**而非独立重写：

1. **zsh-sandbox**：从 `@deepseek-ai/dsh-bash-sandbox/lib/index.js` 拷贝（其 `helpers` 已内联、自包含），把 class `SandboxBashExecutor`→`ZshSandboxExecutor`、`confine()` 里 `["bash","-c",cmd]`→`["zsh","-c",cmd]`，`export` 改 `ZshSandboxExecutor`。`static inject = ["subprocess","sandbox","sandboxPolicy"]`、`static Config = LocalBashExecutor.Config` 保持不变（靠 `LocalBashExecutor` 继承）。
   - 结构：`lib/index.js`（自包含 ESM，运行时 import `@deepseek-ai/dsh-bash-local` / `@deepseek-ai/dsh-sandbox`）+ `lib/types/*.d.ts`（拷贝自 bash-sandbox）。
2. **tool-zsh**：从 `@deepseek-ai/dsh-tool-bash/lib/index.js` 拷贝，做全局 `bash`→`zsh`、`Bash`→`Zsh` 替换。关键运行时标识：插件 `name="tool-zsh"`、`defineTool({name:"zsh"})`、`toolName:"zsh"`、`kind:"zsh"`、`systemPrompt.section name:"tool:zsh"`、描述为 `Execute a zsh command (\`zsh -c\`)`。

## 打包/解析约束（最重要）

- 包必须能在 **dsh 运行时的模块图**里解析到 `@deepseek-ai/*` 内部依赖。dsh 的 `dsh plugin --profile <name> add` 通过 pnpm 装进 profile，`nodeLinker: hoisted` + `autoInstallPeers: false`；缺失的 peers 从 `$DSH_HOME/profiles/node_modules` 的安装依赖闭包（symlink 到 dsh 安装）**parent-walk 回退**解析。所以：
  - `@deepseek-ai/dsh-*` 一律声明为 **`peerDependencies`（值 `"*"`）**，不要放进 `dependencies`（否则 pnpm 会尝试从 registry 安装未发布的内部包而失败）。同理 `@deepseek-ai/schemastery` 也必须是 peer。
  - `dependencies` 里只放真正会从 registry 拉的包。当前两包无此类依赖。
- bundle 包 `@yorkew-east8/dsh-zsh-bundle` 声明 `"dsh":{"bundle":{"patch":"./cordis.patch.yml"}}`，`dsk plugin add` 据此把它加入 `dsh.profile.bundles`。它的 `dependencies` 用 `workspace:*` 指向两个兄弟包；`pnpm -r publish` 会把 `workspace:*` 重写为实际版本再发布。

## 替换链路（分表面）

- 功能核心（命令真的走 zsh）：**bundle 换 host 执行器**。`bundle/cordis.patch.yml` 目前只 `disabled: true`(`bash-sandbox`) + `insert`(`zsh-sandbox`)，不碰工具名。
- 工具名 `bash`→`zsh`：**web 用 preset**（`agent-presets/zsh/` 复制到 `$DSH_HOME/.agent-presets/zsh/` 并设默认 preset）；**headless/tui 用 config patch**（disable `tool-bash`、insert `tool-zsh`）。

## 测试命令（已通过）

- `node --check packages/*/lib/index.js`
- composition：`dsh --profile web --dump-config --patch packages/bundle/cordis.patch.yml` → 见 `bash-sandbox disabled`、`zsh-sandbox inserted`。
- executor seam：import `zsh-sandbox`，`Object.create(proto)` 绕过构造，`fake.ctx={sandbox:{confine:(argv)=>argv}}`，调 `confine("echo $ZSH_VERSION",{mode})` 应返回 `["zsh","-c",…]`。
- tool registration：`import tool-zsh`，`m.apply(mockCtx,{enableRunInBackground:true})`，`ctx.tools.register` 捕获到 `name:"zsh"`，`systemPrompt.section` 收到 `name:"tool:zsh"`。

## 命名与发布

- npm 作用域 `@yorkew-east8`（`publishConfig.access: "public"`）。
- GitHub 仓库 `yorkew-east8/dsh-tool-zsh`（public）。
- 发布顺序：先 `zsh-sandbox`、再 `tool-zsh`、最后 `bundle`（bundle 依赖前面两者）。
