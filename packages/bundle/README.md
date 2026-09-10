# @yorkew-east8/dsh-zsh-bundle

一键替换 bundle：disable host 层的 `bash-sandbox`、insert `zsh-sandbox`，让所有 session 的命令走 zsh。

```bash
dsh plugin --profile web add @yorkew-east8/dsh-zsh-bundle
```

它做两件事：

1. 装上 `@yorkew-east8/dsh-zsh-sandbox` 和 `@yorkew-east8/dsh-tool-zsh` 两个依赖包；
2. 把自身 `cordis.patch.yml` 并入 profile 的 bundle 层。

**只换执行器，不换工具名。** web 表面 host 层的 `tool-bash` 已被 `dsh-web-app` bundle disable，工具由每个 session 的 agent preset 挂载，所以工具改名属于 preset 的职责。装完这一步后命令已经走 zsh，只是模型看到的工具仍叫 `bash`。

## Windows

`zsh` 不是 Windows shell，所以 `zsh-sandbox` 在 win32 上是 disabled 的，由 dsh 自带的 `pwsh-sandbox` 提供 `ctx.shell`。同一时刻只能有一个 `shell` 提供者。

## 附带 preset

`agent-presets/zsh/` 是 dsh 自带 `standard` preset 的生成副本，只把 shell 行换成 `tool-zsh`。安装方式见仓库根目录的 `REPLACE.md`。

## 卸载

```bash
dsh plugin --profile web remove @yorkew-east8/dsh-zsh-bundle
```
