---
title: "agent概念"
description: ""
pubDate: 2026-05-26
tags: [飞书同步]
---

## 主线

可以把 Agent 先理解成一个最小闭环：

1. 接收目标                           （是否有状态）

2. 感知当前上下文                  （是否根据中间结果改变下一步行为）

3. 决定下一步动作

4. 调用模型或工具执行动作      （是否调用了外部工具）

5. 根据结果更新状态               （是否在不确定环境下推进工作）

6. 判断是否继续，直到完成或退出

### 1.什么是agent？

#### 1.定义

从工程角度看，Agent 是一个围绕目标持续推进任务的系统。

它通常具备下面几种能力：

这意味着 Agent 的重点不是“模型更强”，而是“系统闭环更完整”。

是一个由大模型驱动、能根据状态决定下一步动作的任务执行系统。

#### 2.agent的最小闭环

普通llm是：接收目标--->调用大模型，模型生成--->输出结果

#### 3.Agent 通常包含什么

一个稍微像样的 Agent，往往会逐步引入下面这些部分：

- state:当前任务状态

- Tools:查询、搜索、执行、写入等外部能力(外部工具)

- memory:会话内或跨会话记忆

- planner:决定下一步做什么

- policy/guardrails:限制它不能乱做(规则)

- Evaluator:判断结果是否足够好

不是每个 Agent 都必须全部具备，但越接近真实业务，这些模块就越重要。

#### 4.判断一个系统是不是agent

先不看是否调用外部工具,也不看用了什么框架

先看三个条件:

- 1.它是不是围绕目标持续推进任务。

- 2.它会不会根据中间状态改变行为。

- 3.它是不是一个闭环系统，而不是一次性生成。

#### 5.区分(agent和llm和workflow)

普通llm   一次输入一次输出

![](/images/KOjEwoF6MiVsmLkI1WVcDrwCnte/img-1.png)

Agent   系统会根据中间状态去决定下一步执行什么

![](/images/KOjEwoF6MiVsmLkI1WVcDrwCnte/img-2.png)

Workflow  执行路径由开发者预先设定

![](/images/KOjEwoF6MiVsmLkI1WVcDrwCnte/img-3.png)

### 2.Tool Calling

#### 1.意义

Tool calling不是为了让"模型更聪明",而是为了让"模型更有手" .

工具系统设计的第一原则不是“越多越强”，而是“越清晰越稳”.

#### 2.好工具

1. 职责清晰

工具到底做什么，边界必须明确。

不要让一个工具同时负责搜索、总结、打分、写入。

1. 输入清晰

参数结构应该明确、稳定、可校验。

最好是结构化字段，而不是一大段模糊字符串。

1. 输出清晰

返回值尽量稳定，方便模型和程序继续处理。

1. 权限清晰

能不能写、能不能删、能不能执行命令，必须有边界。

1. 错误可处理

工具失败时要能区分：

- 参数错误

- 权限错误

- 网络错误

- 数据为空

否则系统一失败就不知道问题在哪。

### 3.memory

state---当前任务执行的状态化结构

Short-term Memory---这是当前会话中保留下来的上下文。

Long-term Memory---这是跨会话、跨任务仍然有价值的信息。

对话窗口保留  保留最近几轮对话

摘要式记忆  把前面内容压缩成摘要，只保留关键结论。

结构化状态存储  把任务进度和中间结果保存在明确字段里。

检索式长期记忆  把长期信息存到数据库或向量库，需要时再召回。

### 4.rag

解决我现在缺什么的问题

模型当前不知道，或者上下文里没有，但系统可以从外部知识中取回来。

### 5.Agent 全链路任务流程图

```
用户Query → Workflow任务编排层(区分workflow和agent和llm)
    ↓
1.Memory组件（短期对话记忆+长期向量记忆）：读取历史上下文，补充用户历史信息()
    ↓
2.RAG检索模块：根据当前问题检索私有知识库，拼接参考文档(rag是从外部知识获取)
    ↓
3.Agent决策内核：LLM解析意图→生成思考+工具调用指令
    ↓【权限拦截层】
4.Tool工具网关（权限校验+入参校验）→ 合法则调用对应工具（搜索/代码执行/数据库）
    ↓
5.工具返回结果 → 回写入Memory
    ↓
6.Agent二次整合全部信息（用户输入+记忆+RAG文档+工具返回）生成最终回答
    ↓
7.Evaluation评估模块：校验回答合规性、任务完成度、准确性，指标回传优化Workflow
    ↓
输出最终结果给用户；评估不合格则回滚至Workflow重新发起一轮迭代
```

### 6.最小agent loop

```
# 最小Agent循环：思考→选工具→执行→汇总，单次循环
class MiniAgent:
    def __init__(self, llm, memory, tools:dict):
        self.llm = llm          # 大模型
        self.memory = memory    # 记忆实例
        self.tools = tools      # 可用工具字典 {name:func}

    def run(self, user_query:str):
        # 1.读取历史记忆
        history = self.memory.load()
        prompt = f"历史对话:{history}\n用户问题:{user_query}\n需要调用工具则返回【工具名|参数】，无需工具直接返回答案"
        
        while True:
            # 2.大模型思考决策
            resp = self.llm.generate(prompt)
            
            # 分支1：不需要调用工具，直接结束循环
            if "|" not in resp:
                final_ans = resp
                break
            
            # 分支2：解析工具调用指令
            tool_name, params = resp.split("|")
            # 权限拦截校验
            if not self._auth_check(tool_name):
                final_ans = f"无{tool_name}工具使用权限"
                break
            
            # 3.执行工具
            tool_result = self.tools[tool_name](params)
            # 工具结果写入记忆，下一轮带入上下文
            self.memory.save(f"工具{tool_name}执行结果:{tool_result}")
            # 更新prompt，进入下一轮思考
            prompt = f"历史:{self.memory.load()}\n基于工具结果重新回答原问题:{user_query}"
        
        # 最终结果落库
        self.memory.save(f"用户:{user_query},回复:{final_ans}")
        return final_ans

    # 权限拦截函数
    def _auth_check(self, tool_name):
        # 白名单权限控制
        allow_list = ["search", "calc"]
        return tool_name in allow_list
```
