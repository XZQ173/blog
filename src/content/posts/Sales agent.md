---
title: "Sales agent"
description: ""
pubDate: 2026-09-19
tags: [飞书同步]
---

## 1.架构

企业微信事件先由连接服务完成渠道验签、账号处理和模板发送，再将最小化事件通过 HMAC Webhook 交给销售服务。销售服务识别意图、合并客户状态、匹配版本化 SOP，生成 `send_template`、`handoff` 或 `blocked` 动作并持久化；连接服务领取 Outbox 动作、发送并回传结果，只有 `sent` 才推进下一阶段，敏感场景进入人工队列。

```
企业微信                                  用户或渠道产生的一次业务消息
   ↓           它不直接以完整企微原始数据进入 AI Sales 服务，而是先由连接服务整理成业务事件
连接服务 Lengshan(服务中转层--lengshan/句子/灵犀)   灵犀已经抛弃(消息阻塞,道德感太强)                       
   ↓  HMAC Webhook    Webhook--一个服务通过 HTTP 请求主动通知另一个服务  HMAC--身份和完整性校验
AI Sales 销售决策服务
   ↓
意图识别 + 客户状态 + SOP    规则化分类-引入模型作为候选标签来源  客户生命周期状态管理
   ↓
send_template / handoff / blocked  
   ↓
SQLite Outbox
   ↓
Lengshan 领取并发送
   ↓
回传 sent / failed
   ↓
推进阶段或人工处理
```
