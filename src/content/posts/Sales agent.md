---
title: "Sales agent"
description: ""
pubDate: 2026-09-19
tags: [飞书同步]
---

## 1.架构

企业微信事件先由连接服务完成渠道验签、账号处理和模板发送，再将最小化事件通过 HMAC Webhook 交给销售服务。销售服务识别意图、合并客户状态、匹配版本化 SOP，生成 `send_template`、`handoff` 或 `blocked` 动作并持久化；连接服务领取 Outbox 动作、发送并回传结果，只有 `sent` 才推进下一阶段，敏感场景进入人工队列。

```
```
