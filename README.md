# dsh-tool-zsh

让 DeepSeek Harness（dsh）的 shell 走 **zsh** 而不是 bash。

## 安装

```bash
dsh plugin --profile web add @yorkew-east8/dsh-zsh-bundle
```

装完命令就走 `zsh -c`。验证：在 session 里跑 `echo $ZSH_VERSION`。

## 可选：工具名也改成 zsh

模型默认看到的工具仍叫 `bash`（描述里写 `bash -c`），只是实际由 zsh 执行。想连名字一起换：

```bash
mkdir -p "$DSH_HOME/.agent-presets"
cp -R packages/bundle/agent-presets/zsh "$DSH_HOME/.agent-presets/zsh"
```

（`packages/bundle/agent-presets/zsh` 是仓库里的路径；从 npm 装的 bundle 包内也带着同一份。）

然后在 `$DSH_HOME/settings.yaml` 加上：

```yaml
agent-presets:
  default: zsh
```

新建 session 生效。

## 回滚

```bash
dsh plugin --profile web remove @yorkew-east8/dsh-zsh-bundle
```

并把 `agent-presets.default` 改回 `standard`。

## 包含什么

| 包 | 作用 |
|---|---|
| `dsh-zsh-sandbox` | 执行器：继承 dsh 自带的 `SandboxBashExecutor`，只把 argv 改成 `zsh -c` |
| `dsh-tool-zsh` | 模型侧工具 `zsh`：dsh `tool-bash` 的改名副本 |
| `dsh-zsh-bundle` | 一键安装入口 |

## 开发

```bash
pnpm install
pnpm run verify   # 检查与当前 dsh 的同步情况 + 跑测试
pnpm run sync     # 升级 dsh 之后重新生成镜像
pnpm -r publish   # 发布顺序：zsh-sandbox → tool-zsh → bundle
```

`dsh-tool-zsh` 和自带 preset 是从本机 dsh **生成**的，不要手改——改 `scripts/`。

详见 [REPLACE.md](REPLACE.md)（替换/回滚）与 [AGENTS.md](AGENTS.md)（实现细节）。
