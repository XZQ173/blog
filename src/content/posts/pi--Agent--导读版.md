---
title: "pi--Agent--导读版"
description: ""
pubDate: 2026-09-12
tags: [飞书同步]
---
**pi--Agent--导读版**

从一次 prompt 的全程到 Harness 契约：循环结构、工具执行、有状态 Agent、会话存储、环境抽象、上下文压缩、编辑算法、错误体系、崩溃恢复、技能系统，共 11 章 + 附录（约 2700 行）

**导读**

**pi-agent-core 架构导读**

全库只有一个循环，其余全是组合。

这本书从代码出发，讲清楚 @earendil-works/pi-agent-core 是怎么搭起来的：它承诺什么、拒绝什么、支点在哪里。全书对应 pi 仓库 main 分支的 commit 0df5a69e（v0.83.0，2026-08-05）。代码引用写成 文件:行号，**每一个引用都就地附上逐字引文**——想核对任何一处论断，当场就能验，不用去翻源码文件。行号会随代码演进漂移，以文件当前内容为准。

这本书的前身是我的两份"代码解读"（按文件组织的参考手册版、函数级版）。那一版覆盖更广但代码为"结构还原"。这一版换了一种写法：代码一律逐字引用，保留原注释，解读围着源码说，而不是替换源码说。读法变了，可信度的地基也变了。

读者假设--你会读 TypeScript，知道 LLM API 的基本概念（messages、tool calls、streaming），不需要事先了解 pi 仓库。

全库只有一份循环；每加一种能力，都是往它外面再包一层，而不是把它改大。

这句话贯穿全书。你会反复看到同一个 runAgentLoop 被不同层次的消费者调用；会看到工具执行被拆成三段，是为了让持久化层在段与段之间插桩，而不是因为循环本身需要；会看到并发输入被"单飞 + 双队列"结构性消灭，而不是靠锁。每一章末尾都会回指这句话，检查"这一处是组合，还是循环在变复杂"。

**组织方式**

整体 → 局部 → 横切。

*   第一部分 · 整体（第 0、1 章）：建立对整个系统的正确认知，不碰实现细节。读完这两章，你应该能不看代码就把整个系统讲清楚。
*   第二部分 · 局部（第 2–10 章）：逐个部件展开，顺序是依赖顺序--每章只依赖它前面的章。
*   第 2 章 · 工具执行：三段管线与并行纪律
*   第 3 章 · 有状态 Agent：单飞与双队列
*   第 4 章 · 会话与存储：Entry / Record 双轨
*   第 5 章 · 环境抽象：FileSystem / Shell
*   第 6 章 · 上下文压缩：自包含 checkpoint
*   第 7 章 · 编辑算法：精确到模糊的两级匹配
*   第 8 章 · Harness 契约：状态机与错误体系
*   第 9 章 · 持久化执行与崩溃恢复
*   第 10 章 · 技能 / 模板 / 消息投影
*   第三部分 · 横切（附录）：文件地图、术语表，以及那些不属于任何单一部件的澄清。

**与八股模块的映射**

这本书每一章都对应「AI Agent 面试八股」知识体系里的一个核心模块：代码精讲 + 落地讲解。精讲是 pi 的逐字源码，落地是这一章回答八股里的哪些问题。

![](/images/F6iuwKKr3iMtrVkOTV3cLcUZnab/img-1.png)

**点击图片可查看完整电子表格**

每章末尾的「落地：八股视角」会直接引用对应八股模块的面试题，用本章的代码作答——读完一章，你就多一块能对着源码讲清楚的八股。

**体例**

正文只讲从代码里能读出来的东西。代码引用统一写成 文件:行号，路径相对于 packages/agent/。每一个 文件:行号 都就地附上对应的逐字引文——这是全书的第一纪律：论断必须能被核对，代码必须是源码原样（连注释带空格），不是"理解后重写的样子"。确实需要省略的段落，会在代码块里用 // ...（折叠：XXX，见下文） 标注，并说清折叠了什么——把"折叠了什么"本身也变成可信度声明。

正文之外，书里有四种反复出现的结构：

*   插叙（### 级，章内）：补一块你可能缺、但与 pi 无关的背景知识——AbortController 模式、LLM 消息结构。跳读不影响主线。
*   岔路（### 级，章内）：主干里折叠掉的自包含旁支，在这里展开。它是主线的一部分，只是位置被推迟。岔路容得下超出本章平均难度的内容——正因为它可跳过，密度超标的段落都在岔路。啃不动可以先跳过，主线不依赖它。
*   为什么不去（章末）：用仓库里的设计文档或源码注释回答"这里为什么不写得更简单一点"。
*   回指（章末一句）：这一章的哪一处是"组合"，哪一处是"循环本体"。

**范围之外**

*   packages/ai 的内部实现（provider 目录、模型元数据）——本书只把它当作"实现了 StreamFn 契约的下游"。
*   packages/tui、packages/coding-agent——它们是本库的消费者，不是本书的主角（必要时作为真实用例引用）。
*   AgentHarness 的行为：在 0df5a69e 这个基线上，harness 是"类型完整、行为未完成"的契约桩（docs/harness-v2.md:2887 原文："type-complete but not behavior-complete"）。本书讲它的契约（它能被怎样调用、拒绝什么、承诺什么），和它的设计目标（harness-v2.md 规定的持久化语义），但不会假装它的执行方法能跑。

**两条路线（出发前必须分清）**

pi 是一个正在迁移的 monorepo。读任何一页之前，先记住这张图：

Plain Text  
路线 A（现在能跑） 路线 B（设计目标，当前是桩）  
src/agent.ts（有状态 Agent） src/harness/agent-harness.ts（契约+桩）  
└─ agent-loop.ts（循环） └─ docs/harness-v2.md 规定的完整语义  
└─ StreamFn（LLM 调用） └─ session/ + compaction/（已落地部分）

路线 A 是你现在能 new Agent() 跑起来的东西。路线 B 是 harness-v2 设计文档描述的、可崩溃恢复的持久化 harness——它的契约文件已经写满，但执行方法全部 reject(HarnessNotImplemented)（agent-harness.ts:360）。这是迁移状态，不是 bug。

两条路线共享同一个循环原语 runAgentLoop。设计文档 harness-v2.md:1755（§14）写明了这一点：将来 harness 落地时，agent-loop.ts 会被拆成 building blocks，harness 复用同一批块、在块之间插入持久化写，而 runAgentLoop 的现有签名和行为不变。这就是全书那句话的出处：循环只有一份，harness 是在它之上的组合，不是另一套循环。

准备好了，就从第 0 章进去。

**系列文件**

本书按章节拆分为独立文件，可整本连读，也可单章取用。每章自带全部逐字引文，行号以 pi 仓库 commit 0df5a69e 为准。

![](/images/F6iuwKKr3iMtrVkOTV3cLcUZnab/img-2.png)

**点击图片可查看完整电子表格**

怎么读： 第 0、1 章连着读（建立整体心智模型）；第 2–10 章按依赖顺序（每章只依赖它前面的章）；附录按需查阅。正文里的「第 N 章」即本表中的文件。遇到不认识的函数名，回第 0 章末尾「代码大观」查函数索引。

**0.它是什么：一个循环，和它周围的世界**

模块定位（八股 01 基础概念 + 02 核心框架）：这一章回答八股里的两个入门问题——「**Agent 到底是什么、由什么组成**」和「**ReAct 循环在工程里长什么样**」.八股给你定义和类比，这一章给你 pi 的代码：定义里的每一块，在 pi-agent-core 里都有对应的文件。

**从一个场景开始**

你在写一个应用，想在里面嵌入一个能"自己干活"的 AI agent：你给它一句话，它调模型，模型说要调工具，它执行工具，把结果喂回模型，如此往复，直到模型说"完了"。中间每一步你都想实时看到，文字是一个字一个字流出来的，工具是一个一个执行的，因为你要把这些渲染到 UI 上。

这就是 pi-agent-core 要解决的全部问题。它的 README 用一句话概括：

Plain Text  
\# packages/agent/README.md:2  
Stateful agent with tool execution and event streaming. Built on \`@earendil-works/pi-ai\`.

拆开看，它给你三样东西：

1.  一个 agent 循环（src/agent-loop.ts）：prompt 进来，事件流出去，中间是"调模型 → 执行工具 → 再调模型"的往复。
2.  一层状态（src/agent.ts）：Agent 类替你持有对话历史、当前正在流的消息、正在执行的工具，让你在任意时刻都能回答"它现在到哪一步了"。
3.  一套装备（src/harness/）：持久化会话、上下文压缩、内置的文件/shell 工具、skill 加载——把"能跑的循环"变成"能上线 coding agent 的循环"。

三层各管一段，而串起它们的那根线，就是全书那句话：循环只有一份，状态和装备都是组合上去的。

**它拒绝做什么**

理解一个库，不能只看它能做什么，还要看它拒绝做什么。pi-agent-core 有四条明确的拒绝，每一条都能从代码里核实。

拒绝一：不认识任何模型厂商。 全仓库搜不到一个 provider 的名字。循环拿到的模型接口是一个函数类型：

TypeScript  
_// src/types.ts:28_  
export type StreamFn = (  
model: Model<Api>,  
context: Context,  
options?: SimpleStreamOptions,  
) => AssistantMessageEventStream | Promise<AssistantMessageEventStream>;

它只约定形状：给我 Model 和 Context，还我一个事件流。谁来提供这个函数？隔壁的 @earendil-works/pi-ai——那是另一个包，有自己的 provider 目录和模型元数据。本包对它的唯一依赖就是这几个类型。注意 StreamFn 上方的契约注释（src/types.ts:22），它把"失败怎么处理"也写死了：

TypeScript  
_// src/types.ts:22_  
\* Contract:  
\* - Must not throw or return a rejected promise for request/model/runtime failures.  
\* - Must return an AssistantMessageEventStream.  
\* - Failures must be encoded in the returned stream via protocol events and a  
\* final AssistantMessage with stopReason "error" or "aborted" and errorMessage.

失败不抛异常、不 reject，而是编码进流里、用一条带 stopReason: "error" 的消息收尾。这条契约是第 1 章里"循环永远收到闭合事件流"的根——它把"出错"从一个跨边界的异常，变成了一个边界内的值。

拒绝二：不碰 UI。 包里没有一行渲染代码。它对外沟通的方式只有一种：发事件。全部事件就是一个可辨识联合，十种：

TypeScript  
_// src/types.ts:422_  
export type AgentEvent =  
_// Agent lifecycle_  
| { type: "agent\_start" }  
| { type: "agent\_end"; messages: AgentMessage\[\] }  
_// Turn lifecycle - a turn is one assistant response + any tool calls/results_  
| { type: "turn\_start" }  
| { type: "turn\_end"; message: AgentMessage; toolResults: ToolResultMessage\[\] }  
_// Message lifecycle - emitted for user, assistant, and toolResult messages_  
| { type: "message\_start"; message: AgentMessage }  
_// Only emitted for assistant messages during streaming_  
| { type: "message\_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }  
| { type: "message\_end"; message: AgentMessage }  
_// Tool execution lifecycle_  
| { type: "tool\_execution\_start"; toolCallId: string; toolName: string; args: any }  
| { type: "tool\_execution\_update"; toolCallId: string; toolName: string; args: any; partialResult: any }  
| { type: "tool\_execution\_end"; toolCallId: string; toolName: string; result: any; isError: boolean };

文字流、工具进度、生命周期，全在这十种里。你想画成终端、网页还是日志文件，是你的事。注意这十种事件分属四个层级（run / turn / message / tool），第 1 章会跟着一次真实调用把它们逐个点亮。

拒绝三：核心不做持久化。 Agent 类的对话历史就是一个内存数组：

TypeScript  
_// src/agent.ts:71（createMutableAgentState 内）_  
let tools = initialState?.tools?.slice() ?? \[\];  
let messages = initialState?.messages?.slice() ?? \[\];

进程退出，一切归零。持久化存在，但它在 harness 层（第 4 章），而且是"追加条目到树"的模型——核心循环对此一无所知。这是"循环只有一份"的另一面：循环不背持久化的复杂度，持久化是挂在循环外的组合层。

拒绝四：核心不碰运行时 API。 src/ 根目录里没有任何 node:fs、node:child\_process。全部文件和 shell 访问都被逼到一个接口后面（ExecutionEnv，第 5 章细讲），唯一的 Node 实现被隔离在 harness/env/nodejs.ts，通过单独的入口导出：

TypeScript  
_// packages/agent/package.json - exports_  
{  
".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },  
"./node": { "types": "./dist/node.d.ts", "import": "./dist/node.js" },  
"./session/testing": { "types": "./dist/harness/session/testing/index.d.ts",  
"import": "./dist/harness/session/testing/index.js" }  
}

主入口 . 不带任何 Node 依赖；要用文件和 shell 工具，得显式从 ./node 进。所以这个包的核心可以跑在浏览器里——src/proxy.ts 就是为此准备的。组合层（Node 实现）和循环层（纯接口）被入口分开了。

**两层而不是一层：循环只有一份**

这个包最容易产生的误解是：Agent 类和 AgentHarness 类是什么关系？继承？包装？

都不是。看依赖方向：

Plain Text  
agent-loop.ts (runAgentLoop — 无状态循环，793 行)  
▲  
│  
agent.ts (Agent 类, 589 行) ← 路线 A，现在能跑

Agent 直接调用 runAgentLoop，证据在它的 runPromptMessages 里：

TypeScript  
_// src/agent.ts:405（Agent.runPromptMessages）_  
private async runPromptMessages(  
messages: AgentMessage\[\],  
options: { skipInitialSteeringPoll?: boolean } = {},  
): Promise<void> {  
await this.runWithLifecycle(async (signal) => {  
await runAgentLoop(  
messages,  
this.createContextSnapshot(),  
this.createLoopConfig(options),  
(event) => this.processEvents(event),  
signal,  
this.streamFunction,  
);  
});  
}

那 AgentHarness 呢？在 0df5a69e 这个基线上，它还不调用 runAgentLoop——它的全部执行方法都是桩：

TypeScript  
_// src/harness/agent-harness.ts:360_  
private unavailable<T>(operation: string): Promise<T> {  
return Promise.reject(this.closed ? new HarnessClosed() : new HarnessNotImplemented(operation));  
}

prompt、steer、resume、abort……每一个都走 unavailable()，reject 一个 HarnessNotImplemented（agent-harness.ts:371 起逐个可见）。设计文档把这件事写得很坦白：

Plain Text  
// docs/harness-v2.md:2887（节选：F0 工单一句见第 8 章）  
\- \`AgentHarness\` is type-complete but not behavior-complete. Execution-bearing methods  
reject with \`HarnessNotImplemented\`; some read/configuration/watch/manual-drive  
methods still expose local scaffold behavior. \[…\]

所以此时此刻，Agent 是 runAgentLoop 唯一的消费者。但 AgentHarness 不是 Agent 的子类，也不是它的包装：按设计（harness-v2.md:1755，§14），它将来是同一循环原语之上的另一层组合，只是组合进去的东西多得多——持久化、压缩、hook、phase 状态机。而 runAgentLoop 本体，届时会被拆成 building blocks，harness 复用同一批块、在块之间插入持久化写，签名和行为不变。

为什么要并存两层？因为它们的"重"不一样。嵌入一个聊天面板，用 Agent 就够；造一个 coding agent，用 AgentHarness。循环本体只有一份——这是整个包结构立得住的根：新能力都是组合出来的，循环从不为此变大。

这是全书那句话第一次落地：Agent 和 AgentHarness 不是继承链，而是同一循环原语上的两个组合层。第 1 章会跟着 Agent 把循环走一遍；第 8、9 章再讲 AgentHarness 的契约与设计目标。

**一章小结**

*   pi-agent-core 是一个 agent 循环库：循环、状态、装备三层。
*   它不认识模型厂商、不碰 UI、核心不做持久化、核心不碰运行时 API——四条拒绝都能从代码核实。
*   Agent 是 runAgentLoop 现在的消费者；AgentHarness 是它将来按同一原语组合的消费者（当前是契约桩）。循环只有一份。

下一章不再谈定位，跟着一次真实的 prompt() 调用，把循环从头到尾走一遍。

**为什么不去**

**为什么不直接依赖 pi-ai？** StreamFn 上方的契约注释（src/types.ts:22）把动机写在了脸上：模型目录是会膨胀的（每家厂商、每个模型、每项定价），而循环的契约只需要一个函数形状——并且这个函数"不得抛异常、不得 reject，失败编码进流"。依赖一个类型，而不是依赖一个目录，循环就把自己和"模型厂商会怎么变"彻底解耦了。pi-ai 装多少 provider，是 pi-ai 的事；本包只认 StreamFn 这个形状。

**为什么 AgentHarness 现在宁可全桩，也不先跑一个内存版？** 因为 harness 的全部价值在于"**持久化 + 崩溃恢复**"——一个不落盘的 harness 和 Agent 没有本质区别，写了也只是重复。设计文档选择先把契约写满（type-complete），让消费者能对着类型编程，再把行为逐个落地（F0 工单，harness-v2.md:2887）。这是"**架构先行、实现跟进**"的工程节奏，不是偷懒。

**回指：**四条拒绝都是"循环本体不背的复杂度"——厂商、UI、持久化、运行时，全被推到组合层或下游。循环只留一件事：往复。

**落地：八股视角**

Q：Agent 和 Chain 的区别是什么？

A： Chain 是编译期**定死的管线**，第 1 步的输出喂给第 2 步，顺序在代码里写死；Agent 是**运行时决策**，模型每一轮自己决定下一步调什么工具，路径不在代码里。pi 的 runLoop 就是后者的实体：模型输出 toolCall 就执行工具、把结果喂回去，模型不输出就停。决策权在模型，循环只提供往复。

Q：ReAct 循环在真实代码里长什么样？

A： ReAct = Reason + Act 交替：**模型推理（reasoning）→ 选动作（工具调用）→ 观察结果（toolResult 喂回）→ 再推理**。pi 的内层 while 转一圈就是这个交替：streamAssistantResponse（推理）→ executeToolCalls（行动）→ toolResult 消息进上下文（观察）。八股里的 ReAct 伪代码，在 pi 里就是 agent-loop.ts:155 那个循环。

Q：Agent 的「组成」对应 pi 的哪些文件？

A： 八股说 Agent 由**模型、工具、记忆、规划**组成。在 pi 里：模型 = StreamFn 类型（types.ts:28），工具 = AgentTool 数组（循环从 context.tools 里查），记忆 = 消息数组（第 3、4 章的 Agent 状态与会话树），规划 = 循环本身（runLoop 的往复）。概念和代码一一对应，这是读源码的价值：八股不再是一堆名词。

**代码大观：先认名字，再进细节**

这一节是全书所有代码的索引。不用背——它的用途是：当你读后面某章看到一个函数名，能回这里查"它是谁、谁在调它、解决什么问题"。每一行都标注了细讲章节，正文里会有逐字引文。

第一层：入口与状态（src/agent.ts，第 1、3 章细讲）

![](/images/F6iuwKKr3iMtrVkOTV3cLcUZnab/img-3.png)

**点击图片可查看完整电子表格**

第二层：循环本体（src/agent-loop.ts，第 1、2 章细讲）

![](/images/F6iuwKKr3iMtrVkOTV3cLcUZnab/img-4.png)

**点击图片可查看完整电子表格**

第三层：会话与存储（harness/session/，第 4 章细讲）

![](/images/F6iuwKKr3iMtrVkOTV3cLcUZnab/img-5.png)

**点击图片可查看完整电子表格**

第四层：环境、压缩、编辑、错误、技能（第 5-10 章细讲）

![](/images/F6iuwKKr3iMtrVkOTV3cLcUZnab/img-6.png)

**点击图片可查看完整电子表格**

怎么读这张表： 第一、二层是主链路（一次 prompt 的必经之路），第 1 章会逐个点亮；第三、四层是组合层和工具层，后面各章分别展开。读正文时遇到不认识的函数名，回来查这一节就行。

**1\. 一次 prompt 的全程：从 prompt() 到 agent\_end**

模块定位（八股 02 核心框架 · ReAct）：八股里的 ReAct 是一张伪代码图，reasoning → action → observation 循环。这一章让这张图活过来：跟着 agent.prompt("读一下 config.json") 这一句真实调用，把循环从入口走到出口，看 ReAct 的三个动作在 pi 代码里各自落在哪一行。走完这一章，后面每一章的模块你都已经见过了，本章是全书的地图。

**出发：Agent.prompt**

一次对话从哪开始？答案就一个方法：Agent.prompt()。它是这个包对外的脸——你在 UI 里敲一句话、在脚本里调一次接口，最后都落在这里。它接收你的输入（字符串、图片或整组消息），把这次对话跑完。看它的实现，注意三件事：它先检查什么、把消息交给谁、自己做了什么：

TypeScript  
_// src/agent.ts:346（Agent.prompt）_  
async prompt(input: string | AgentMessage | AgentMessage\[\], images?: ImageContent\[\]): Promise<void> {  
if (this.activeRun) {  
throw new Error(  
"Agent is already processing a prompt. Use steer() or followUp() to queue messages, or wait for completion.",  
);  
}  
const messages = this.normalizePromptInput(input, images);  
await this.runPromptMessages(messages);  
}

它做的第一件事和 AI 无关：检查 activeRun。一个 Agent 实例同一时刻只跑一个 run——想插队，走 steer() 或 followUp() 队列，这是后话。注意错误信息把三条出路直接报给你：这不是一个含糊的"busy"，而是一句指路。prompt() 把归一化后的消息交给 runPromptMessages，这里能看到后续所有准备的接线方式：

TypeScript  
_// src/agent.ts:405（Agent.runPromptMessages）_  
private async runPromptMessages(  
messages: AgentMessage\[\],  
options: { skipInitialSteeringPoll?: boolean } = {},  
): Promise<void> {  
await this.runWithLifecycle(async (signal) => {  
await runAgentLoop(  
messages,  
this.createContextSnapshot(),  
this.createLoopConfig(options),  
(event) => this.processEvents(event),  
signal,  
this.streamFunction,  
);  
});  
}

注意顺序：runWithLifecycle 包在最外层，而 createContextSnapshot() 和 createLoopConfig(options) 是 runAgentLoop 的实参——它们在 executor 真正执行时才求值，也就是在生命周期建立之后。

接下来要回答一个问题：runAgentLoop 要用的三样东西——上下文、配置、事件回调——从哪来？前两样由 Agent 的两个私有方法现场准备，事件回调就是 processEvents 自己。先看上下文怎么准备。

第一件，快照上下文：

TypeScript  
_// src/agent.ts:433（Agent.createContextSnapshot）_  
private createContextSnapshot(): AgentContext {  
return {  
systemPrompt: this.\_state.systemPrompt,  
messages: this.\_state.messages.slice(),  
tools: this.\_state.tools.slice(),  
};  
}

注意消息数组是浅拷贝——循环会往里推新消息，但替换不了调用方手里那个数组的引用。第二件，装配循环配置（src/agent.ts:441），把 Agent 实例上的回调和两个队列的 drain 函数打包成 AgentLoopConfig。这一步的直觉是：循环不认 Agent 实例，只认一张配置表——模型、工具、钩子、队列拉取函数全部摊在表里，循环按表取用：

TypeScript  
_// src/agent.ts:441（Agent.createLoopConfig，删减）_  
private createLoopConfig(options: { skipInitialSteeringPoll?: boolean } = {}): AgentLoopConfig {  
let skipInitialSteeringPoll = options.skipInitialSteeringPoll === true;  
const shouldStopAfterTurn = this.shouldStopAfterTurn;  
return {  
model: this.\_state.model,  
reasoning: this.\_state.thinkingLevel === "off" ? undefined : this.\_state.thinkingLevel,  
_// ...（onPayload / onResponse / transport / thinkingBudgets 等透传键，折叠）_toolExecution: this.toolExecution,  
beforeToolCall: this.beforeToolCall,  
afterToolCall: this.afterToolCall,  
shouldStopAfterTurn: shouldStopAfterTurn  
? async (context) => await shouldStopAfterTurn(context, this.signal)  
: undefined,  
_// ...（prepareNextTurn 的适配器，折叠，见本章"岔路"）_convertToLlm: this.convertToLlm,  
transformContext: this.transformContext,  
getApiKey: this.getApiKey,  
getSteeringMessages: async () => {  
if (skipInitialSteeringPoll) {  
skipInitialSteeringPoll = false;  
return \[\];  
}  
return this.steeringQueue.drain();  
},  
getFollowUpMessages: async () => this.followUpQueue.drain(),  
};  
}

两个队列的 drain 函数被打包成了 getSteeringMessages / getFollowUpMessages 两个回调——循环在固定点 poll 它们（本章"两层结构"一节会看到 poll 的位置）。skipInitialSteeringPoll 是个一次性的闸：continue() 路径已经 drain 过 steering，进循环时跳过第一次 poll，避免重复注入。

两个实参准备好了。回到外层：runWithLifecycle 建立一个 AbortController、登记 activeRun、置 isStreaming = true，然后才执行 executor：

TypeScript  
_// src/agent.ts:482（Agent.runWithLifecycle）_  
private async runWithLifecycle(executor: (signal: AbortSignal) => Promise<void>): Promise<void> {  
if (this.activeRun) {  
throw new Error("Agent is already processing.");  
}  
  
const abortController = new AbortController();  
let resolvePromise = () => {};  
const promise = new Promise<void>((resolve) => {  
resolvePromise = resolve;  
});  
this.activeRun = { promise, resolve: resolvePromise, abortController };  
  
this.\_state.isStreaming = true;  
this.\_state.streamingMessage = undefined;  
this.\_state.errorMessage = undefined;  
  
try {  
await executor(abortController.signal);  
} catch (error) {  
await this.handleRunFailure(error, abortController.signal.aborted);  
} finally {  
this.finishRun();  
}  
}

promise / resolvePromise 这三行是一个"手动引爆的 Promise"：new Promise 的 executor 是同步执行的，所以构造完成的瞬间，resolvePromise 就拿到了这个 Promise 的 resolve 函数。这个 Promise 的用途，本章"收尾"一节会拆开用到——它是 waitForIdle() 的扳机。

**插叙：executor 与 signal 两个模式**

runWithLifecycle 的签名里有两个值得展开的模式，它们在后文会反复出现。

模式一：executor 回调（"你带活儿来，我管前后"）。 runWithLifecycle 自己不干活，它收一个函数 (signal) => Promise<void> 当参数。为什么不让它直接调用 runAgentLoop？因为有两个调用方想共用同一套"前后手续"，但干的活不一样——runPromptMessages 跑 runAgentLoop，runContinuation 跑 runAgentLoopContinue（src/agent.ts:421）：

TypeScript  
_// src/agent.ts:421（Agent.runContinuation）_  
private async runContinuation(): Promise<void> {  
await this.runWithLifecycle(async (signal) => {  
await runAgentLoopContinue(  
this.createContextSnapshot(),  
this.createLoopConfig(),  
(event) => this.processEvents(event),  
signal,  
this.streamFunction,  
);  
});  
}

把"活"抽象成参数，前后的手续（建 controller、登记、置状态、兜异常、收尾）就只写一份。本质是把不变的括号和可变的内容分开。

模式二：AbortController / AbortSignal（"遥控器与电线"）。 这是 Web 标准 API，Node 内置，和 TypeScript 无关。规则很简单：new AbortController() 造出一个遥控器，持有者随时可以按 .abort()；每个 controller 带一根"电线" controller.signal（AbortSignal），可以任意往下传。拿到 signal 的人不能按按钮，只能听——轮询 signal.aborted，或注册 abort 事件。

所以这是一个单向的取消广播：只有创建者能取消，所有下游只能服从。 看 runWithLifecycle 里 signal 的旅程：controller 在这里创建，signal 交给 executor → executor 传给 runAgentLoop → 循环再传给 streamFn（取消 HTTP 请求）和每个工具的 execute()（终止正在跑的命令）。而按按钮的手在别处：

TypeScript  
_// src/agent.ts:319（Agent.abort）_  
abort(): void {  
this.activeRun?.abortController.abort();  
}

你在 UI 上点"停止" → agent.abort() → controller 按下。注意 abort() 本身没有任何队列或时机判断——它就是同步按按钮，所以"什么时候停"不取决于循环转到哪，而取决于听到广播的三方各自多快响应。第 3 章会拆这三个响应方；这里只要记住：abort 结束的是整个 run，不是当前 turn。

**进入循环：runAgentLoop 的开场**

executor 跑起来，调用 runAgentLoop。它先把 prompt 消息追加进上下文，发出 agent\_start、turn\_start 和 prompt 自己的 message\_start/message\_end，然后把控制权交给真正的引擎 runLoop：

TypeScript  
_// src/agent-loop.ts:95（删减）_  
export async function runAgentLoop(prompts: AgentMessage\[\],  
context: AgentContext,  
config: AgentLoopConfig,  
emit: AgentEventSink,  
signal: AbortSignal | undefined,  
streamFn: StreamFn,  
): Promise<AgentMessage\[\]> {  
const newMessages: AgentMessage\[\] = \[...prompts\];  
const currentContext: AgentContext = {  
...context,  
messages: \[...context.messages, ...prompts\],  
};  
  
await emit({ type: "agent\_start" });  
await emit({ type: "turn\_start" });  
for (const prompt of prompts) {  
await emit({ type: "message\_start", message: prompt });  
await emit({ type: "message\_end", message: prompt });  
}  
  
await runLoop(currentContext, newMessages, config, signal, emit, streamFn ?? getDefaultStreamFn());  
return newMessages;  
}

注意两个数组的不同命运。newMessages 是 runAgentLoop 新建的（\[...prompts\]），交给 runLoop 填充，跑完原样 return 给调用方——就地推消息是结果回传的通道。currentContext.messages 则另起了新数组（\[...context.messages, ...prompts\]），循环往里推多少条，调用方手里的 context.messages（也就是 Agent 的 state.messages 快照）都纹丝不动。一个负责回报结果，一个负责隔离副作用。

**循环的两层结构**

runLoop 这个"真正的引擎"里，循环到底在哪里？先说清楚"循环"指什么。日常说的"agent 循环"是模型 → 工具 → 模型的往复：模型产出工具调用，工具结果喂回模型，模型再产出，直到没有工具调用为止。这个往复在代码里不是递归，是迭代——runLoop 里的一个 while。而 runLoop 里其实有两个 while，这就是"两层结构"的字面出处。把真实代码摆出来（只折叠 prepareNextTurn 块——它是岔路不是主干，见本章"岔路"专节；其余逐行保真）：

TypeScript  
_// src/agent-loop.ts:155（折叠 prepareNextTurn 块；其余逐行保真）_  
async function runLoop(initialContext: AgentContext,  
newMessages: AgentMessage\[\],  
initialConfig: AgentLoopConfig,  
signal: AbortSignal | undefined,  
emit: AgentEventSink,  
streamFunction: StreamFn,  
): Promise<void> {  
let currentContext = initialContext;  
let config = initialConfig;  
let firstTurn = true;  
_// Check for steering messages at start (user may have typed while waiting)_let pendingMessages: AgentMessage\[\] = (await config.getSteeringMessages?.()) || \[\];  
  
_// Outer loop: continues when queued follow-up messages arrive after agent would stop_while (true) {  
let hasMoreToolCalls = true;  
  
_// Inner loop: process tool calls and steering messages_while (hasMoreToolCalls || pendingMessages.length > 0) {  
if (!firstTurn) {  
await emit({ type: "turn\_start" });  
} else {  
firstTurn = false;  
}  
  
_// Process pending messages (inject before next assistant response)_if (pendingMessages.length > 0) {  
for (const message of pendingMessages) {  
await emit({ type: "message\_start", message });  
await emit({ type: "message\_end", message });  
currentContext.messages.push(message);  
newMessages.push(message);  
}  
pendingMessages = \[\];  
}  
  
_// Stream assistant response_const message = await streamAssistantResponse(currentContext, config, signal, emit, streamFunction);  
newMessages.push(message);  
  
if (message.stopReason === "error" || message.stopReason === "aborted") {  
await emit({ type: "turn\_end", message, toolResults: \[\] });  
await emit({ type: "agent\_end", messages: newMessages });  
return;  
}  
  
_// Check for tool calls_const toolCalls = message.content.filter((c) => c.type === "toolCall");  
  
const toolResults: ToolResultMessage\[\] = \[\];  
hasMoreToolCalls = false;  
if (toolCalls.length > 0) {  
_// A "length" stop means the output was cut off by the token limit, so// every tool call in the message may carry truncated arguments. Fail// them all instead of executing potentially borked calls._const executedToolBatch =  
message.stopReason === "length"  
? await failToolCallsFromTruncatedMessage(toolCalls, emit)  
: await executeToolCalls(currentContext, message, config, signal, emit);  
toolResults.push(...executedToolBatch.messages);  
hasMoreToolCalls = !executedToolBatch.terminate;  
  
for (const result of toolResults) {  
currentContext.messages.push(result);  
newMessages.push(result);  
}  
}  
  
await emit({ type: "turn\_end", message, toolResults });  
  
_// ...（prepareNextTurn：两圈之间换快照的岔路，折叠，见下文专节）_if (  
await config.shouldStopAfterTurn?.({  
message,  
toolResults,  
context: currentContext,  
newMessages,  
})  
) {  
await emit({ type: "agent\_end", messages: newMessages });  
return;  
}  
  
pendingMessages = (await config.getSteeringMessages?.()) || \[\];  
}  
  
_// Agent would stop here. Check for follow-up messages._const followUpMessages = (await config.getFollowUpMessages?.()) || \[\];  
if (followUpMessages.length > 0) {  
_// Set as pending so inner loop processes them_  
pendingMessages = followUpMessages;  
continue;  
}  
  
_// No more messages, exit_break;  
}  
  
await emit({ type: "agent\_end", messages: newMessages });  
}

内层 while 转一圈 = 一个 turn：注入插队消息（如果有）→ 调一次模型 → 执行工具（如果有）→ turn\_end。它的退出条件 hasMoreToolCalls || pendingMessages.length > 0 读作"模型没要新工具，也没人插队"——日常说的"agent 跑完了"，在代码里就是这个条件变假。

每圈开头补发一个 turn\_start——除了第一圈。firstTurn 旗标就是干这个的：第一圈的 turn\_start 在进 runLoop 之前已经由 runAgentLoop 发过了（agent-loop.ts:110），如果不压住，订阅者会看到两个挨着的 turn\_start。这个旗标没有别的用途，纯粹是事件去重。

外层 while (true) 转一圈 = 一批 follow-up。 内层耗尽后，循环本来该结束了，但先问一句 follow-up 队列：有人排队"顺便再做一件事"，就把它们塞进 pendingMessages，continue 回去让内层再转；没有，break。外层存在的全部理由就是这一问。

为什么需要两层，而不是一个大 while？因为两种队列的检查时机不同：steering 在每个 turn 之后都要看（用户在 agent 工作时随时插话），follow-up 只能在"agent 真的要停了"的点才看。合并成一个循环，就得在同一个条件里表达两种时机，代码会长出奇怪的旗标；两层 while 各管一种时机，条件读起来就是业务语义本身。steering 和 follow-up 共用一套注入管线（都是塞进 pendingMessages），区别只在 poll 的时机。

**插叙：消息的三件套**

骨架里的 message、toolResults、pendingMessages 全都是消息数组。整个对话历史就是一个 Message 数组，而 Message 只有三种角色——user 说，assistant 做，toolResult 把工具结果喂回去。循环的"模型 → 工具 → 模型"往复，落到数据上就是 assistant 消息和 toolResult 消息在数组里交替追加。

值得破除一个命名直觉：message 听起来像"一句话"，实际上它是模型一轮输出的全部内容的容器——"轮"才是它的单位，不是"句"。AssistantMessage.content 不是字符串，是内容块数组，一条消息可以"想一段、说一段、调两个工具"，全部混排在同一个数组里。骨架里那个 filter 之所以成立："模型这一步有没有要干活" = "这个数组里有没有 type: "toolCall" 的块"。文本块和思考块不进工具管线，它们只是对话内容。

**调模型：两道闸门**

内层循环的核心动作是 streamAssistantResponse。在真正发出请求之前，消息要过两道闸门：

TypeScript  
_// src/agent-loop.ts:289（streamAssistantResponse 内）_let messages = context.messages;  
if (config.transformContext) {  
messages = await config.transformContext(messages, signal);  
}  
  
_// Convert to LLM-compatible messages (AgentMessage\[\] -> Message\[\])_const llmMessages = await config.convertToLlm(messages);

*   transformContext（可选）：直接操作 agent 侧的消息数组——剪掉老消息、注入外部上下文。输入输出都是 AgentMessage\[\]。
*   convertToLlm（必需）：把 AgentMessage 翻译成 LLM 侧的 Message。LLM 只认识 user/assistant/toolResult 三种角色，你的自定义消息类型（"通知""压缩摘要"）要么被转换，要么被过滤掉。

这两道闸门是全书最重要的设计之一，第 10 章会展开。这里只需要记住文件头注释写的那句话：

TypeScript  
_// src/agent-loop.ts:1/\*\*  
\* Agent loop that works with AgentMessage throughout.  
\* Transforms to Message\[\] only at the LLM call boundary.  
\*/_

循环本体从头到尾只说 AgentMessage，翻译只发生在 LLM 调用边界上。 这是"循环只有一份"的另一种表达：循环不认识 provider 的消息格式，翻译是边界上的组合层。

过了闸门，调 streamFn，事件开始回流。循环拿着流事件维护一份"正在成形的消息"（partialMessage），就地更新，同时向订阅者转发：

TypeScript  
_// src/agent-loop.ts:314（streamAssistantResponse 内）_let partialMessage: AssistantMessage | null = null;  
let addedPartial = false;  
  
for await (const event of response) {  
switch (event.type) {  
case "start":  
partialMessage = event.partial;  
context.messages.push(partialMessage);  
addedPartial = true;  
await emit({ type: "message\_start", message: { ...partialMessage } });  
break;  
  
case "text\_start":  
case "text\_delta":  
case "text\_end":  
case "thinking\_start":  
case "thinking\_delta":  
case "thinking\_end":  
case "toolcall\_start":  
case "toolcall\_delta":  
case "toolcall\_end":  
if (partialMessage) {  
partialMessage = event.partial;  
context.messages\[context.messages.length - 1\] = partialMessage;  
await emit({  
type: "message\_update",  
assistantMessageEvent: event,  
message: { ...partialMessage },  
});  
}  
break;  
  
case "done":  
case "error": {  
const finalMessage = await response.result();  
if (addedPartial) {  
context.messages\[context.messages.length - 1\] = finalMessage;  
} else {  
context.messages.push(finalMessage);  
}  
if (!addedPartial) {  
await emit({ type: "message\_start", message: { ...finalMessage } });  
}  
await emit({ type: "message\_end", message: finalMessage });  
return finalMessage;  
}  
}  
}

九种增量事件（text/thinking/toolcall 各 start/delta/end）能共用一个函数体，是因为流事件个个带一份完整的 partial 快照，不是增量，是"到目前为止的整条消息"。所以循环不需要分辨来的是哪一组：partialMessage = event.partial 整体换上，就地更新，覆盖的最后一格正是 start 时 push 进去占位的那个。收到 done（或 error），response.result() 取出最终消息，替换占位格，发 message\_end，这一轮模型调用结束。

**执行工具：先准备，再开火**

assistant 消息里如果带着 toolCall 内容块，就进入工具执行。入口处有一个容易漏掉的守卫——输出被 token 上限截断时（stopReason: "length"），每个工具调用的参数都可能是残缺的 JSON，全部标记为错误，一个都不执行，让模型自己重新发一遍：

TypeScript  
_// src/agent-loop.ts:208// A "length" stop means the output was cut off by the token limit, so// every tool call in the message may carry truncated arguments. Fail// them all instead of executing potentially borked calls._const executedToolBatch =  
message.stopReason === "length"  
? await failToolCallsFromTruncatedMessage(toolCalls, emit)  
: await executeToolCalls(currentContext, message, config, signal, emit);

正常情况下，进入 executeToolCalls，每个工具调用走三段管线：prepare（找工具、校验参数、问 beforeToolCall 放不放行）→ execute（真正调 tool.execute()）→ finalize（问 afterToolCall 要不要改写结果）。这里跟一遍主路就够，管线的完整契约留给第 2 章。

工具结果变成 toolResult 消息进上下文，turn\_end 发出，一个 turn 结束。接着是四个决策点（按代码里的询问顺序）：prepareNextTurn（换不换下一圈的装备，岔路）→ shouldStopAfterTurn（要不要体面地停）→ steering poll（有没有人插队）→ follow-up poll（真要停了，有没有人留后话）。四个都落空，发 agent\_end，runLoop 返回。

**岔路：两圈之间换快照（prepareNextTurn）**

主干引文里折叠掉的那块，现在展开。它在每个 turn\_end 之后、下一次 poll steering 之前，给宿主一个"换掉下一圈的装备"的机会。

坦白说，这条岔路是本章最难啃的一段——契约、适配、实现横跨三层，难度在本章平均线之上。啃不动就先跳过，主线不依赖它；读完后面几章再回来也来得及。

先说这段代码回答什么问题：run 跑到一半，宿主想换上下文、换模型、换思考强度——比如 coding agent 发现当前任务需要更强的模型。循环怎么给宿主留这个口子？答案是 prepareNextTurn 这个可空回调：每个 turn 结束时循环问一句"要换装备吗"，宿主答"要"就换，答不上来就保持原样。下面这段是循环层的调用现场，注意回调的入参出参形状：

TypeScript  
_// src/agent-loop.ts:226_const nextTurnContext = {  
message,  
toolResults,  
context: currentContext,  
newMessages,  
};  
const nextTurnSnapshot = await config.prepareNextTurn?.(nextTurnContext);  
if (nextTurnSnapshot) {  
currentContext = nextTurnSnapshot.context ?? currentContext;  
config = {  
...config,  
model: nextTurnSnapshot.model ?? config.model,  
reasoning:  
nextTurnSnapshot.thinkingLevel === undefined  
? config.reasoning  
: nextTurnSnapshot.thinkingLevel === "off"  
? undefined  
: nextTurnSnapshot.thinkingLevel,  
};  
}

它回答的问题是：一个 run 跑到一半，宿主想换上下文、换模型、换思考强度怎么办？ 快照的每个字段都可缺省，缺省就 ?? 回落到当前值——宿主可以只换模型不动上下文，反之亦然。thinkingLevel: "off" 被显式翻译成 reasoning: undefined，因为下游契约是用"没有 reasoning 字段"而不是 "off" 来表达关闭——那个三层三元表达式就是在做词汇表对齐。

Agent 层把这个契约暴露成两个可赋值的公开属性（prepareNextTurn 旧版只给 signal，prepareNextTurnWithContext 新版多给 turn 信息），装配时归一成循环认识的单一签名（agent.ts:459）。两个名字并存是兼容性历史。真正实现它的是宿主——coding-agent 每圈重读 systemPrompt、工具、模型；harness 每圈落盘后重建快照。这条岔路的全部意义：换装备是组合层的事，循环只提供"问一句"的口子。

**收尾：事件如何落地，run 何时算完**

AgentEvent 的事件分属四个层级，不同层级各有来源：

Plain Text  
run agent\_start · agent\_end ← 骨架（「循环的两层结构」）  
turn turn\_start · turn\_end ← 骨架，内层循环每圈  
message message\_start · message\_update · message\_end ← 回流（assistant）· 注入（prompt、插队、follow-up）  
tool tool\_execution\_start · \_update · \_end ← 工具管线（「执行工具」）

四个层级的事件全都流过 Agent.processEvents。它做两件事：先把事件归约进状态，然后逐个 await 所有订阅者：

TypeScript  
_// src/agent.ts:540（Agent.processEvents 内，删减）_private async processEvents(event: AgentEvent): Promise<void> {  
switch (event.type) {  
case "message\_end":  
this.\_state.streamingMessage = undefined;  
this.\_state.messages.push(event.message);  
break;  
case "tool\_execution\_start": {  
const pendingToolCalls = new Set(this.\_state.pendingToolCalls);  
pendingToolCalls.add(event.toolCallId);  
this.\_state.pendingToolCalls = pendingToolCalls;  
break;  
}  
_// ...（message\_start / message\_update / tool\_execution\_end / turn\_end / agent\_end 各 case，折叠）_  
}  
  
const signal = this.activeRun?.abortController.signal;  
if (!signal) {  
throw new Error("Agent listener invoked outside active run");  
}  
for (const listener of this.listeners) {  
await listener(event, signal);  
}  
}

"逐个 await"是 Agent 和裸循环之间最实质的差别——订阅者的异步处理是 run 结算的一部分。agent\_end 发出 ≠ run 结束；所有 agent\_end 监听器跑完，finishRun() 清掉运行时状态，waitForIdle() 才 resolve：

TypeScript  
_// src/agent.ts:525（Agent.finishRun）_private finishRun(): void {  
this.\_state.isStreaming = false;  
this.\_state.streamingMessage = undefined;  
this.\_state.pendingToolCalls = new Set<string>();  
this.activeRun?.resolve();  
this.activeRun = undefined;  
}

而 waitForIdle() 返回的就是 runWithLifecycle 里那个手动引爆的 Promise：

TypeScript  
_// src/agent.ts:328（Agent.waitForIdle）_waitForIdle(): Promise<void> {  
return this.activeRun?.promise ?? Promise.resolve();  
}

这段三行代码值得拆成六个问题读，每个问题都有一条真实证据：

1.  它什么时候 resolve？ 看 runWithLifecycle 的结构：executor 跑完 → finally 里的 finishRun() → resolvePromise() 被调用。所以 resolve 时刻 = "run 彻底结束"，比 agent\_end 事件晚一拍——晚的那一拍是监听器逐个跑完。
2.  谁在 await 它？ 任何持有 agent 引用的人。prompt() 自己也 await（runPromptMessages → await runWithLifecycle 一条链下来），但真正需要 waitForIdle() 的是那些手里没有 prompt 返回的 Promise 的代码，它只有 agent 引用。没有 active run 时它返回一个立即 resolve 的 Promise（"已经在 idle，不用等"），所以"等安静"的调用在空闲状态下零开销，也可以放心地在 agent\_end 监听器里写数据库，循环会等监听器跑完，而监听器不会等循环。
3.  为什么需要它？ 因为"run 是否彻底结算"是 Agent 的私有知识。activeRun 是私有字段，外部能观察到的最晚信号是 agent\_end 事件——但事件发出 ≠ 监听器跑完（processEvents 逐个 await，见上）。拿事件当结算信号，早了一个身位。库不把这个答案挂出来，外部只能猜错。
4.  它在哪里被调用？ 这个包自己的生产代码里没有调用点，waitForIdle() 是纯公开 API，调用方在库外。仓库里的真实用法有两类。一类是测试，断言前等落定，coding-agent 的导航测试每步 prompt 后都等它：

TypeScript  
_// packages/coding-agent/test/agent-session-tree-navigation.test.ts:33_await session.prompt("First message");  
await session.agent.waitForIdle();  
await session.prompt("Second message");  
await session.agent.waitForIdle();

注意第二行 await session.prompt(...) 本身就会等到结算，测试为什么还要再等一次？因为测试的下一行要读 sessionManager.getTree()，树的最新状态是监听器写进去的，而监听器在 prompt 返回之后还在跑。等 idle 就是等"监听器也全部跑完"。另一类调用点是下游包装层的 abort 流程，按了停止必须等它真的安静才能返回，这个证据链在第 8 章讲 harness 契约时会用到。

1.  那 Agent.waitForIdle() 为什么必须存在，而不是让调用方自己等 agent\_end？ 因为 agent\_end 是事件，不是 Promise——等一个事件需要自己包装 Promise，而"什么时候算结算完"的判定（监听器 settle）在 Agent 内部。把结算语义封装成 waitForIdle()，判定逻辑只写一份，外部拿到的就是一个可 await 的 Promise。
2.  保证的反面：在监听器里 await 它，会死锁。 同一条结算语义，站错位置就是陷阱。监听器里 await agent.waitForIdle()，等的是结算；而结算在等你——processEvents 逐个 await 监听器，你不 return，executor 就不算跑完，activeRun.promise 就不 resolve；你又在等它 resolve——环闭合了。不需要线程参与，Promise 依赖成环就够了，而且没有任何超时或 abort 能打破它。harness 层的设计文档把这个坑明确写了出来：

Plain Text  
// docs/harness-v2.md:730（节选）  
runWhenIdle(callback: () => void | Promise<void>): Promise<void>; // runtime-only

出路是换一个方向：把回调传进去，自己的监听器正常 return，结算照常完成；链走完后 harness 再来调这个回调，返回的 Promise 等回调跑完才 resolve——从登记那一刻起，你就不在依赖环里。注意在当前基线上它只是签名 + 桩实现（agent-harness.ts:413：async runWhenIdle(callback) { await callback(); }），行为等 F0 落地。一句话记住这条边界：waitForIdle() 是旁观者的工具，参与者碰不得。

**一章小结**

一次 prompt() 的全程：

Plain Text  
prompt() → runPromptMessages → runWithLifecycle → runAgentLoop(快照, 装配) → runLoop  
├─ transformContext → convertToLlm → streamFn（流式）  
├─ prepare → execute → finalize（工具三段管线）  
├─ turn\_end → prepareNextTurn? → shouldStopAfterTurn? → steering?  
└─ follow-up? → 外层再来一圈  
→ agent\_end → await 所有监听器 → finishRun → waitForIdle resolve

turn 结束后的四个决策点，按代码里的询问顺序（对照骨架引文 agent-loop.ts:226-272）：

1.  prepareNextTurn——换不换下一圈的装备？见"岔路"。
2.  shouldStopAfterTurn——要不要体面地停？
3.  steering poll——有没有人插队？有则注入，内层再转一圈。
4.  follow-up poll——真要停了，有没有人留了后话？有则外层续命。

四个都落空，发 agent\_end，runLoop 返回。abort 不在这条链上：它不等 turn 结束，随时生效。

下一章把这一章路过的循环本体单独拎出来，讲清楚两层 while 的每一个分支。

**为什么不去**

为什么并发 prompt() 直接抛错，而不是自动排队等上一轮？ 因为自动排队会把"想插队还是想等结束"的决策藏起来——而这正是 steer 和 followUp 两种语义的分野。prompt() 的错误信息（agent.ts:349）把三条出路直接报给你，而不是默默替你选一条。库的选择是把决策显式化：流式期间再调 prompt() 就 throw，steer 打断当前 run，followUp 等 agent 将要停止才投递。

为什么 emit 要逐个 await 订阅者，而不是 fire-and-forget？ 因为监听器的典型工作是落盘、flush——推出去不等，run 返回时写入可能还没完成。所以订阅者的异步处理被算进 run 的结算：agent\_end 只代表"循环不再发事件"，idle 要等它的监听器全部 settle。subscribe 的 JSDoc（agent.ts:247）把这条语义写在了明面上："agent\_end is the final emitted event for a run, but the agent does not become idle until all awaited listeners for that event have settled."

回指：这一章的循环本体（runLoop）只有一份。Agent 的状态、队列、生命周期包装、事件归约，全是循环之外的组合层。循环自己不持状态、不认模型厂商、不碰 UI——它只消费 AgentContext、回报 AgentEvent。

**落地：八股视角**

Q：ReAct 循环和 Plan-and-Execute 有什么区别？pi 属于哪种？

A： ReAct 是边走边想——每轮推理完就执行动作；Plan-and-Execute 是先规划再执行——计划器产出步骤列表，执行器照单执行。pi 的 runLoop 是 ReAct：没有独立的计划阶段，模型每轮输出什么就执行什么，prepareNextTurn 那个岔路是唯一接近"换计划"的口子，但也只是换上下文/模型，不是换执行路径。八股里 Plan-and-Execute 的优势（计划可复核、步骤可回滚）在 pi 里由 harness 的持久化层承担（第 9 章），而不是由循环承担。

Q：模型无限循环调用工具怎么办？

A： 八股的朴素答案是"轮次上限"。pi 的答案是分层：循环层靠 shouldStopAfterTurn（宿主可以在 turn 后强制停）+ terminate 批量举旗（第 2 章），harness 层靠 maxRetries 和恢复归约里的重试上限（第 9 章）。上限放在组合层而不是循环本体——循环不知道自己跑了几轮，问"要不要停"的权限交给宿主。

Q：agent 的"实时看到每一步"是怎么做到的？

A： 第 0 章的十种 AgentEvent 就是答案：message\_update 让你看到文字一个字一个字流出来，tool\_execution\_start/update/end 让你看到工具逐个执行。订阅者拿事件渲染 UI，循环不关心渲染。八股里说的"流式 + 事件驱动"，pi 用事件联合 + 订阅回调落地。
