# QQ 图片与合成图链路

## 路由

```text
QQ 消息图片 / 本地图片库
        │
        ├─ qq_list_images     → 列出 media/images 内可发送图片
        ├─ qq_compose_image   → 生成 PNG、返回预览和 artifact
        └─ qq_send_image      → 自审 + 发送 + get_msg 回读
```

## 图片库

默认目录：`qq-bridge/media/images/`。

- 只允许 PNG、JPEG、GIF、WebP 的相对路径；
- 拒绝绝对路径、URL、`..` 和符号链接逃逸；
- 合成图写入 `generated/`；
- 大小、像素上限来自 `config.json` 的 `socialV2.media`。

## 两段式发送

1. `qq_compose_image` 或 `qq_list_images` 让模型先看到图片；
2. `qq_send_image` 必须提交：
   - `intent`：为什么发；
   - `expected`：预期对方怎么理解或接着做什么。

桥接收到后再检查收件人白名单、图片签名、大小、像素和频率。发送后调用
OneBot `get_msg`，只有回读消息含 `image` 段才返回 `verified=true`。

## 状态落点

- `state/image-artifacts.json`：生成图、发送状态、自审和回执；
- `state/image-sends.jsonl`：每次发送的追加分析记录；
- `state/social-v2.json`：会话 recentMessages 中的图片记录与自审内容。

## 守护

`scripts/qq-stack-guard.mjs` 不再只看端口，还读取 bridge `/api/status`：

- DSH ready；
- SnowLuma WebSocket connected；
- QQ account online；
- SnowLuma 没有自报 `good=false`；
- 最近心跳时间可读。

guard 不自动拉起 DSH，避免后台制造重复窗口；DSH 缺失时只记录
`manual-restart-required`。
