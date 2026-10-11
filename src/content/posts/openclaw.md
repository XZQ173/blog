---
title: "openclaw"
description: ""
pubDate: 2026-06-11
tags: [飞书同步]
---

主流 Agent 框架（LangChain、Dify、Coze）在 Demo 阶段很好用，但它们的过度抽象在生产环境会成为负担——行为不可预测、排查困难、安全面大。

真正跑在生产上的 Coding Agent——Claude Code、Cursor、pi-mono——用的都是轻量级自定义架构。它们的共同模式：

1. EventStream 驱动的 Agent Loop（不是链式调用）

2. 可插拔的 Context Engine（不是简单的消息截断）

3. 并行工具执行 + MCP 协议（不是串行函数调用）

4. 文件级持久化记忆（不是向量数据库存对话）

## 1.为什么要自己写agent

用过 LangChain、Dify 或者 Coze。Demo 阶段很顺，部署到生产后开始出现问题：

- 行为不稳定，但 debug 时全是框架内部堆栈

- 想改一个细节，发现要翻三层抽象

- 上了生产遇到安全漏洞，依赖链太长修不动

这不是自己用得不好，是框架架构决定的。

Claude Code、Cursor、pi-mono——目前公认最好的 Coding Agent——都没有用 LangChain 或 Dify。

它们的共同模式：

### Pi-mono

[pi-mono](https://github.com/badlogic/pi-mono) 是 Mario Zechner 开源的终端 Coding Agent monorepo，TypeScript 实现，约 3000 行核心代码。

```
```

它的架构直接影响了 Claude Code 的设计思路。

### Openclaw

[OpenClaw](https://github.com/openclaw/openclaw) 在 pi-mono 的基础上增加了企业级特性：

```
```

核心能力差异：

### agent的本质

一个循环

下面为ai agent自主思考-调用工具-循环复盘(agent loop)

把对话历史发给大模型思考-是否调用工具-执行工具,拿到返回结果-将结果追加到对话上下文,再次丢给大模型-反复循环,直到不再调用任何大模型.

```
```

Agent 和 Chatbot 的区别只有一个：当模型返回 tool\_calls 时，执行工具并继续循环，而不是直接结束。

## 2.agnet loop

pi-mono 的核心在 `packages/agent/src/agent-loop.ts`。这个文件实现了整个 Agent 的执行引擎。

### 两个入口

```
```

`agentLoop()` 启动新对话，`agentLoopContinue()` 从历史 transcript 恢复。两者返回同一种类型：EventStream——一个异步事件生成器。

### EventStream 架构

pi-mono 不像传统框架那样返回最终结果，而是流式发射生命周期事件：

```
```

调用方（CLI、Web UI、测试）通过消费这个 EventStream 来驱动 UI 渲染、日志记录、进度展示。

为什么这么设计？

1. UI 解耦：TUI、Web UI、测试 harness 都消费同一个 EventStream，Agent 逻辑不需要知道渲染细节

2. 可观测性：每个事件都是结构化数据，天然支持日志、trace、metrics

3. 可恢复：事件序列就是 transcript，崩溃后从 transcript 恢复

### 核心循环数据流

![](/images/WvJhwJ8rcisvTxkrHnDcWsgonvf/img-1.png)

关键设计：

- 外层循环处理多轮对话（follow-up messages）

- 内层循环处理单轮中的多次工具调用

- 工具执行默认并行（`Promise.all`），可配置为顺序执行

### 工具执行：并行是默认

```
```

当模型一次返回多个 tool\_calls（比如同时读 3 个文件），pi-mono 会并行执行所有工具。这是 Coding Agent 速度快的关键原因之一。

对比 LangChain 的默认串行执行：

### Hooks：拦截与变换

pi-mono 提供了四个 Hook 点，让你在不修改核心循环的情况下注入逻辑：

```
```

实际用途：

- `beforeToolCall`：安全过滤（阻止危险命令）、权限控制

- `afterToolCall`：结果截断（大文件只保留前 N 行）

- `transformContext`：上下文压缩、注入系统指令

- `convertToLlm`：适配不同 LLM Provider 的消息格式

### OpenClaw 的 5 阶段执行模型

pi-mono 的 Agent Loop 是基础，OpenClaw 在此之上增加了更完整的执行阶段：

```
```

#### Hook 介入点

OpenClaw 定义了 4 个 Hook 介入点，覆盖执行全流程：

```
```

#### 并发控制：per-session 串行化

```
```

为什么？如果同一用户同时发两条消息，两个 Agent Loop 并发执行会导致：

- 消息顺序混乱（哪条先哪条后？）

- 上下文竞态（两个循环同时追加消息）

- 工具冲突（两个循环同时写同一个文件）

#### 并发控制：per-session 串行化

```
```

为什么？如果同一用户同时发两条消息，两个 Agent Loop 并发执行会导致：

- 消息顺序混乱（哪条先哪条后？）

- 上下文竞态（两个循环同时追加消息）

- 工具冲突（两个循环同时写同一个文件）

#### 多层超时

```
```

### Claude Code vs OpenClaw 的 Agent Loop 对比

根据 [claude-code-vs-openclaw](https://github.com/rrmars/claude-code-vs-openclaw) 的 11 维度对比（OpenClaw 赢 8 项）：

核心差异：Claude Code 是 Anthropic 的垂直集成产品（模型 + 工具 + 缓存一体化），OpenClaw 是 provider-agnostic 的开放架构。Claude Code 的 Prompt Caching 是独家优势，但 OpenClaw 在可插拔性和安全性上更强。

### 与传统框架的对比

#### LangChain 的链式模型

```
```

问题：当你需要工具调用循环时，链式模型就不够用了，需要引入 `AgentExecutor`，其内部实现和 pi-mono 的 Agent Loop 殊途同归。

#### pi-mono 的循环模型

```
```

没有链、没有 DAG、没有中间抽象层。一个 while 循环解决所有问题。

### 动手：跟踪一次完整执行

克隆 pi-mono 后，在 `agent-loop.ts` 的关键位置加 `console.log`：

```
```

观察一次 “读取 README.md 并总结” 任务的事件序列：

```
```

把这个事件流画成时序图，你就理解了整个执行模型。

![](/images/WvJhwJ8rcisvTxkrHnDcWsgonvf/img-2.png)

## 3.rag检索增强实现

RAG（Retrieval-Augmented Generation）在 Agent 系统中有两种用法：

1. 知识库问答：用户提问 → 检索相关文档 → 注入上下文 → 生成回答

2. 代码库导航：Agent 需要理解大型代码库时，按需检索相关代码片段

这一节覆盖从基础实现到生产级优化的完整路径。

![](/images/WvJhwJ8rcisvTxkrHnDcWsgonvf/img-3.png)

### 分块策略

#### 按语义边界分块（推荐）

```
```

#### 按固定窗口分块（简单场景）

```
```
