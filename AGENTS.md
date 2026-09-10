# AGENTS.md — dsh-tool-zsh 实现与维护说明

面向执行代理（及后续维护者）的事实与约束。面向人类的入口是 `README.md`，替换/回滚操作是 `REPLACE.md`。本文件独立包含实现所需信息。

## 仓库是什么

一个 pnpm 单仓库（`pnpm-workspace.yaml`，`packages/*`），把 DeepSeek Harness（dsh）的 shell 从 bash 换成 zsh。三个可发布包 + 一个生成的 preset 目录：

```
packages/zsh-sandbox/   @yorkew-east8/dsh-zsh-sandbox  （执行器，子类，抗升级）
packages/tool-zsh/      @yorkew-east8/dsh-tool-zsh     （模型侧工具，生成副本）
packages/bundle/        @yorkew-east8/dsh-zsh-bundle   （profile bundle，一键安装）
  agent-presets/zsh/     preset（standard 的生成副本，shell 行换成 tool-zsh）
scripts/                 镜像生成与漂移检测
test/                    node:test 验证套件
```

验证基线：**`dsh@0.1.5-rc.1`**（`latest` 与 `next` dist-tag 均指向它）。

## 关键事实（为什么这样改）

- 模型侧工具 `tool-bash`（`@deepseek-ai/dsh-tool-bash`）**shell 无关**：只调 `ctx.shell.run(ctx.shell.resolve(req))`，从不拼 `bash`。见其 `inject = ["tools","shell","systemPrompt","shellEnv"]`。
- "bash" 写死在执行器里两处 argv：`LocalBashExecutor.run()/start()`（`@deepseek-ai/dsh-bash-local`）和 `SandboxBashExecutor.confine()`（`@deepseek-ai/dsh-bash-sandbox`）。
- macOS/web 下实际挂的 `ctx.shell` 是 `bash-sandbox`，属 **host-plane** 行（`@deepseek-ai/dsh-base` bundle，`cordis.patch.yml` 中 `id: bash-sandbox`，位于 root 级 `- insert:` 列表）。一次挂载、所有 session 共享。
- web 表面由 `@deepseek-ai/dsh-web-app` bundle 把 host 层的 `tool-bash`/`tool-pwsh` `disabled:true`，每个 session 的工具由 agent preset（`standard`）挂载。**这决定了 web 上"改工具名"必须走 preset，不能只改 host 层。**
- `ShellExecutor extends Service`，构造 `super(ctx,"shell")`——提供的 service 名是 `shell`。**同一 context 只能有一个 `shell` 提供者**，挂第二个会抛 duplicate-service。所以 `zsh-sandbox` 必须与 `bash-sandbox` 二选一（Windows 上与 `pwsh-sandbox` 二选一）。
- 没有工具别名/改名机制：`dsh-tools` 只导出 `defineTool` 等，`ctx.tools.register` 是唯一注册缝，工具名不可配置。

## 两个包：两种截然不同的策略

### 1. zsh-sandbox —— 子类，不含任何拷贝源码

```js
import { SandboxBashExecutor } from '@deepseek-ai/dsh-bash-sandbox';
export class ZshSandboxExecutor extends SandboxBashExecutor {
  confine(command, policy) {
    return this.ctx.sandbox.confine(['zsh', '-c', command], policy);
  }
}
```

`confine()` 是上游为子类预留的 argv 拼装钩子：`SandboxBashExecutor.run()`（约 154 行）与 `start()`（约 181 行）都调 `this.confine(spec.command, {...policy, mode})`。覆盖它即可原样继承 mode 解析、`danger-full-access` 直通、runner 失败归类、denial 签名、`processFacts`、审批管线、`sandboxMode`。

`static inject` / `static Config` 通过原型链从 `LocalBashExecutor` 继承，**不要**重新声明。

`lib/types/index.d.ts` 是手写的空子类声明。**不要**引用 `SandboxBashExecutor['confine']`——上游把它标成 TS `private`（运行时是普通方法，所以 JS 覆盖可用，但类型层不可引用）。

全部耦合只有 4 项：`SandboxBashExecutor` 类、`confine` 钩子、`this.ctx`（cordis `Service` 的公开字段，见其构造函数文档 "the context to register in (stored as `this.ctx`)"）、`ctx.sandbox.confine(argv, policy)`。

### 2. tool-zsh —— 生成副本，靠漂移检测

工具名、描述、`name: "tool:bash"`、`toolName: "bash"`、`kind: "bash"` 全部写死，所以必须带改名副本。**升级免疫做不到**，因此改成"生成物 + 显式失败"：

```
pnpm run sync           node scripts/mirror-tool.mjs --write  +  scripts/mirror-preset.mjs --write
pnpm run check:mirror   同上 --check，漂移则退出 1 并打印第一处差异
```

`scripts/mirror-tool.mjs` 的改名是**整体 token 替换**（`Bash`→`Zsh`、`bash`→`zsh`），只保护一个例外：

```js
const PROTECTED = ['TOOL_BASH'];
```

`TOOL_BASH` 是上游源码里唯一的大写 `BASH`：它是 **host** system-prompt section 顺序表的键（`dsh-system-prompt` 的 `SECTION_ORDERS` 里 `TOOL_BASH: 1000`、`TOOL_PWSH: 1010`，**没有 `TOOL_ZSH`**）。保留它，`tool:zsh` 才能落在 bash 原本的槽位——这正是 `tool-pwsh` 用 `getSectionOrder("TOOL_PWSH")` 的做法。若改成字面量（旧版是 `105`），那段提示会跑到系统提示词很靠前的位置。

生成文件顶部有 4 行 `// @generated` 横幅；`stripBanner()` 按 `BANNER_LINES` 精确剥离，改横幅必须同步改这个常量（`banner()` 里有断言）。

`scripts/mirror-preset.mjs` 对上游 `standard` preset 做**两个锚定替换**（文件头注释行、shell 行块），其余逐字保留（保留上游那些解释 realm / host-plane 规则的注释）。锚点匹配数不等于 1 就报错并提示更新锚点——这是上游改写 preset 时的显式信号。

## 上游版本漂移的处理流程

1. `pnpm run check:mirror` 失败 → 打印 `packages/tool-zsh/...` 或 preset 的第一处差异行。
2. `pnpm run sync` 重新生成。
3. review diff（**重点看 `order:`、`Config`、工具描述、参数 schema 是否变**）。
4. 若 preset 报锚点失配，更新 `scripts/mirror-preset.mjs` 的 `SHELL_ANCHOR` / `HEADER_ANCHOR`。
5. `pnpm run verify` → commit。
6. `zsh-sandbox` 通常无需任何操作。

`check` 对"版本变了但代码没变"只在 stdout 打一行 note，不算失败，避免补丁级升级产生无意义 diff。

## 打包/解析约束（最重要）

- 包必须能在 **dsh 运行时的模块图**里解析到 `@deepseek-ai/*` 内部依赖。`dsh plugin --profile <name> add` 通过 pnpm 装进 profile，`nodeLinker: hoisted` + `autoInstallPeers: false`；缺失的 peers 从 `$DSH_HOME/profiles/node_modules` 的安装依赖闭包（symlink 到 dsh 安装）**parent-walk 回退**解析。所以：
  - `@deepseek-ai/*` 一律声明为 **`peerDependencies`（值 `"*"`）**，不要放进 `dependencies`。
  - 仓库根 `.npmrc` 设 `auto-install-peers=false`，否则 `pnpm install` 会去 registry 拉 `@deepseek-ai/*`（那里存在一个陈旧的 `0.0.1-rc.1`）并静默装错版本。
  - `dependencies` 里只放真正会从 registry 拉的包。当前只有 bundle 放 `workspace:*` 指向两个兄弟包（**必须**是 `workspace:*`：写成 `^0.1.0` 会让 `pnpm install` 去 registry 找未发布的包而 404）。
- bundle 包 `@yorkew-east8/dsh-zsh-bundle` 声明 `"dsh":{"bundle":{"patch":"./cordis.patch.yml"}}`，`dsh plugin add` 据此把它加入 `dsh.profile.bundles`。`pnpm -r publish` 会把 `workspace:*` 重写为实际版本再发布。
- 每个包目录各有一份 `LICENSE`：npm/pnpm 只会自动打包**包目录内**的 LICENSE，不会回溯 monorepo 根目录。

## 测试与脚本

```
scripts/dsh-packages.mjs   解析 $DSH_HOME/profiles/node_modules；ensureResolution() 把
                           node_modules/@deepseek-ai 软链到 dsh 的 scope（只链 scope，
                           不覆盖整个 node_modules，因此与 pnpm install 共存）
scripts/mirror-tool.mjs    tool-zsh 生成/漂移检测；导出 renameBashToZsh / stripBanner 供测试
scripts/mirror-preset.mjs  preset 生成/漂移检测
test/                      node:test，`node --test "test/*.test.mjs"`
```

测试直接**以本机安装的 dsh 为被测对象**（与 dsh 运行时同一套 parent-walk 解析），断言的是 dsh 真正会加载的东西：

- `zsh-sandbox.test.mjs`：是 `SandboxBashExecutor` 的真子类；`inject`/`Config` 继承自上游且值相同；**原型上只覆盖 `confine` 一个方法**；三种 mode 下 argv 都是 `["zsh","-c",...]`；policy 按引用透传；provider 同步抛错原样冒泡。
- `tool-zsh.test.mjs`：**差分测试**——同一 mock context 分别 mount 上游与本包，断言工具名/section 名是 `bash`↔`zsh`，order 都经 `getSectionOrder("TOOL_BASH")` 解析且相等，描述与参数 schema 只差改名，`Config`/`inject` 相同。
- `preset.test.mjs`：YAML 解析（`!!js` 先降级为普通 scalar）后，**每一行的 `config` 都喂给该插件真实的 `Config` 校验**（这正是当初 `dsh-persona` 从 `text:` 改成必填 `prefix:` 的破绽所在），并断言每个被引用的插件包都真的装得到。
- `mirror.test.mjs`：改名函数的忠实性（含 `TOOL_BASH` 不被改写、可往返），生成文件带横幅且正文除 `TOOL_BASH` 外无残留 bash 命名。

`yaml` 从 dsh 闭包内解析（`createRequire` 指向 `$DSH_HOME/profiles/node_modules`），因为仓库只链了 `@deepseek-ai` 这个 scope。

## 命名与发布

- npm 作用域 `@yorkew-east8`（`publishConfig.access: "public"`）。
- GitHub 仓库 `yorkew-east8/dsh-tool-zsh`（public）。
- 发布顺序：先 `zsh-sandbox`、再 `tool-zsh`、最后 `bundle`（bundle 依赖前面两者）。
- 三个包版本当前均为 `0.1.0`，尚未发布到 npm。
