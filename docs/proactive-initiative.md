# QQ 主动意图

QQ 不再用“随机等 30–90 分钟 + 概率发送”决定主动开口。

流程：

```text
承诺 / 工作下一步 / 真实念头 / pending thought / 完成任务 / 显式未来意图
        │
        ▼
LAAP initiative ledger（去重、到期、限流、在线状态）
        │
        ▼
qq_schedule_intention / 60s due scanner
        │
        ▼
主动唤醒同一个乌塔卡塔
        │
        ├─ 有具体内容 → qq_send_message / 表情 / 图片
        └─ 没有 → skipped，不重复叫醒
```

关键工具：

- `qq_schedule_intention`：登记具体理由、内容提示和到期时间；
- `qq_memory_append(category="pendingThought")`：把“我想说但还没说”接进同一本账；
- `capture_impulse`（LAAP MCP）：学习或干活时忽然想分享，记录触发内容、真实念头和为什么想到落柯；
- 自动扫描：只检查已到期意图，不生成随机话题；
- 发送成功：文字、表情、图片都会把 `message_id` 回写 LAAP；
- 回合没发：写 `skipped`，不会每分钟重复唤醒。

全天允许主动，不设置固定夜间静默。网络或 QQ 不在线时不领取；恢复在线后继续判断。

关键区别：捕获念头不是发送命令。账本只记住“她曾经真的这样想过”；轮到渠道时，她仍要重新判断这句话现在是否成立、是否值得说。扫描器不会把空状态变成聊天欲望。

共享账本接口：

- `POST /v1/initiative/create`
- `POST /v1/initiative/claim`
- `POST /v1/initiative/ack`
- `POST /v1/initiative/feedback`
- `GET /v1/initiative/status`
