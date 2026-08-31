# @yorkew-east8/dsh-zsh-sandbox

zsh 执行器：在 `ctx.shell` 能力缝上，把 bash-sandbox 硬编码的 `["bash","-c",cmd]` 换成 `["zsh","-c",cmd]`，其余沙箱、denial、escalation、timeout、spill 语义完全一致。
