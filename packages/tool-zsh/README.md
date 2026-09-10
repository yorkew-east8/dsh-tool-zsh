# @yorkew-east8/dsh-tool-zsh

模型侧的 `zsh` 工具：`@deepseek-ai/dsh-tool-bash` 的同名镜像，只把 `bash` 改成 `zsh`，调用已挂载的 `ctx.shell` 执行器。

## ⚠️ 这个包是生成物，不要手改

`lib/index.js` 和 `lib/types/*.d.ts` 顶部都有 `// @generated` 横幅，由脚本从**本机安装的 dsh** 生成：

```bash
pnpm run sync           # 重新生成（升级 dsh 之后跑这个）
pnpm run check:mirror   # 检测漂移，不同步就退出非 0
```

## 为什么是拷贝而不是继承

工具名不是可配置项：`dsh-tool-bash` 用 `defineTool({ name: "bash" })` 把名字写死，claude 侧描述文本、prompt section 名（`tool:bash`）、审批主体（`toolName: "bash"`）、后台任务 kind（`"bash"`）也都写死。dsh 没有任何工具别名 / 改名机制，所以要让模型看到 `zsh`，只能带一份改名后的副本。

**这意味着它无法对 dsh 升级完全免疫**——这是这个包和 `dsh-zsh-sandbox` 的本质区别（后者是子类，天然免疫）。能做到的是让漂移**显式**而不是静默：

1. 改名规则是机械化、可审计的整体 token 替换，且只保护一个例外（见下）；
2. `pnpm run check:mirror` 拿当前安装的 dsh 重新生成一遍并逐行比对，不一致就报错并指出第一处差异所在行；
3. 测试会**差分对比**上游插件与本包：用相同 mock context 分别 mount，断言唯一差别就是 bash→zsh。

升级 dsh 的标准流程因此是：`pnpm run sync` → review diff → `pnpm run verify` → commit。

## 唯一的语义差异

改名规则**故意不动** `TOOL_BASH`：

```js
order: ctx.systemPrompt.getSectionOrder("TOOL_BASH"),
```

`dsh-system-prompt` 的 section 顺序表里有 `TOOL_BASH: 1000`、`TOOL_PWSH: 1010`，但没有 `TOOL_ZSH`。写死字面量（比如旧版的 `105`）会把 `tool:zsh` 那段提示插到系统提示词很靠前的位置；复用 `TOOL_BASH` 槽位才能让它落在 bash 原本所在的位置——这也正是 `dsh-tool-pwsh` 用 `getSectionOrder("TOOL_PWSH")` 的做法。

## 测试覆盖的契约

`test/tool-zsh.test.mjs` 断言：

- 注册的工具名 `zsh`、section 名 `tool:zsh`
- section order 通过 `getSectionOrder("TOOL_BASH")` 解析，且与上游取到的值相同
- 描述、参数 schema、`Config`、`inject` 与上游**只差改名**
- `execute` / `presentCall` / `presentResult` 与上游同型
