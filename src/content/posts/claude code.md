---
title: "claude code"
description: ""
pubDate: 2026-05-28
tags: [飞书同步]
---

这个模块做一件事：从零手写一个 Agent，一层一层叠加机制，最终变成一个能处理真实任务的 Coding Agent。

## 1.agent loop

这一节不做其他的事情,只需要做一件事就是搭建出一个最小的可运行框架.一个循环,后续不管如何增加步骤,这个最小的循环框架始终不变.

为什么要搭建循环喃?

\_\_语言模型能推理代码，但碰不到真实世界——不能读文件、跑测试、看报错。没有循环，每次工具调用你都得手动把结果粘回去--------你自己就是那个循环。

一个退出条件控制整个流程：循环持续运行，直到模型不再调用工具。

![](/images/UP0ZwLC36iJAYAkNgc8cePzPn7c/img-1.png)

真实的 Claude Code ——它用 1700+ 行 TypeScript 实现了状态机、自动压缩、token 恢复等机制。

下面只是一个最小的循环

```
import anthropic
client = anthropic.Anthropic()
MODEL = "claude-opus-4-6"

SYSTEM = "你是一个 Coding Agent，可以执行 bash 命令来完成任务。"

TOOLS = [{
    "name": "bash",
    "description": "执行 shell 命令，返回输出",
    "input_schema": {
        "type": "object",
        "properties": {
            "command": {"type": "string", "description": "要执行的 shell 命令"}
        },
        "required": ["command"]
    }
}]

import subprocess

def run_bash(command: str) -> str:
    result = subprocess.run(
        command, shell=True, capture_output=True, text=True, timeout=30
    )
    return result.stdout + result.stderr

def agent_loop(query: str):
    messages = [{"role": "user", "content": query}]

    while True:
        response = client.messages.create(
            model=MODEL, system=SYSTEM,
            messages=messages, tools=TOOLS, max_tokens=8000,
        )
        messages.append({"role": "assistant", "content": response.content})

        # 没有工具调用 → 结束if response.stop_reason != "tool_use":
            for block in response.content:
                if hasattr(block, "text"):
                    print(block.text)
            return# 执行所有工具调用，收集结果
        results = []
        for block in response.content:
            if block.type == "tool_use":
                output = run_bash(block.input["command"])
                print(f"[bash] {block.input['command']}")
                print(f"  → {output[:200]}")
                results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": output,
                })
        messages.append({"role": "user", "content": results})

if __name__ == "__main__":
    query = input("You: ").strip()
    agent_loop(query)
```

### 1.关键设计解析

#### messages 是累积的

每一轮对话的 LLM 响应和工具结果都追加进 messages，不是替换。这让模型始终能看到完整的执行历史。

即滚雪球式的对话记忆.

```
# 轮次 1：用户消息
messages = [{"role": "user", "content": "列出当前目录的 Python 文件"}]

# 轮次 1：LLM 响应（包含 tool_use block）
messages.append({"role": "assistant", "content": response.content})

# 轮次 1：工具结果
messages.append({"role": "user", "content": [tool_result]})

# 轮次 2：LLM 继续推理...
```

#### stop_reason 是唯一的退出条件

#### tool_result 的格式

工具结果必须以 `role: "user"` 消息的形式返回，且 content 是一个列表：

```
{
    "role": "user",
    "content": [
        {
            "type": "tool_result",
            "tool_use_id": block.id,  # 必须和 tool_use 的 id 匹配"content": "命令输出..."
        }
    ]
}
```

### 2.源码

Claude Code 的真实实现在 `src/query.ts` 中，是一个 1729 行的 `while(true)` 状态机。

#### 1.两层架构：QueryEngine (会话管理)+ queryLoop(单轮执行逻辑)

Claude Code 把 Agent Loop 拆成两层：

`QueryEngine` 的核心字段直接映射了我们教学实现中的 `messages` 列表：

```
// src/QueryEngine.ts
export class QueryEngine {
  private mutableMessages: Message[]      
  // ← 对应我们的 messages = []
  private abortController: AbortController // ← 我们没有：取消信号--会话中断能力
  private readFileState: FileStateCache    // ← 我们没有：文件读取缓存--避免重复读取文件
  private totalUsage: NonNullableUsage     // ← 我们没有：token 用量追踪--累计输入输出token
  private permissionDenials: SDKPermissionDenial[]
  // ...
}
```

queryLoop 的状态机

我们的 `while True` 里只有一个判断：`stop_reason != "tool_use"` 就退出。而真实的 `queryLoop` 在每次迭代中携带一个 `State` 对象，跟踪压缩状态、恢复计数和 stop hook：

```
// src/query.ts — 循环状态type State = {
  messages: Message[]
  toolUseContext: ToolUseContext
  autoCompactTracking: AutoCompactTrackingState | undefined
  maxOutputTokensRecoveryCount: number
  hasAttemptedReactiveCompact: boolean
  maxOutputTokensOverride: number | undefined
  pendingToolUseSummary: Promise<ToolUseSummaryMessage | null> | undefined
  stopHookActive: boolean | undefined
  turnCount: number
  transition: Continue | undefined  // ← 上一轮为什么 continue 了
}
```

messages 当前轮次完整对话上下文，来自上层 `QueryEngine`，包含用户、模型、工具交互记录。

toolUseContext 工具调用全局上下文，存储可用工具列表、工具执行环境、文件读写权限等配置。

autoCompactTracking 上下文自动压缩追踪状态，记录压缩触发时机、压缩前后 token 量、压缩规则，用于超长上下文裁剪。

maxOutputTokensRecoveryCount 输出 Token 超限重试计数器，当模型返回超出最大输出限制时，记录重试次数，防止无限死循环。

hasAttemptedReactiveCompact 标记本轮是否已经执行过主动上下文压缩，避免同一轮循环重复压缩。

maxOutputTokensOverride 临时覆盖模型最大输出 token 限制，用于工具调用长返回内容场景。

pendingToolUseSummary 异步工具执行摘要 Promise，当工具执行耗时较长时，存储异步摘要任务，避免阻塞循环。

stopHookActive 中断钩子激活标记，关联上层 `abortController`，支持中途终止 Agent 循环。

turnCount 当前 Agent 循环轮次计数，用于限制最大循环次数，防止死循环。

transition 流转标记，记录上一轮循环没有退出、继续执行的原因（工具调用 / 压缩重试 / 报错恢复），用于日志排查与分支判断。

每轮循环结束时，状态机通过 `transition.reason` 决定下一步。终止时返回 `Terminal`：

六种状态转移

![](/images/UP0ZwLC36iJAYAkNgc8cePzPn7c/img-2.png)

具体来说：

#### 2.prompt-too-long 恢复链

这是最精妙的部分。当对话变得太长，API 返回 prompt-too-long 错误时，Claude Code 有一条三级恢复链：

```
prompt_too_long
    ↓
[1] context collapse — 折叠已暂存的历史摘要（轻量）
    ↓ 还是太长？
[2] reactive compact — 对整段对话做激进压缩（重量）
    ↓ 还是太长？
[3] 返回 { reason: 'prompt_too_long' } 终止
```

#### 3.max_output_tokens 恢复链

当模型输出被 `max_tokens` 截断时：

![](/images/UP0ZwLC36iJAYAkNgc8cePzPn7c/img-3.png)

### 3.真实架构对比

核心洞察：我们的 30 行代码和 Claude Code 的 1729 行代码共享同一个骨架——`while(true)` 循环驱动 LLM 调用和工具执行,差异全在容错和优化上.

### 4.这 30 行代码做了什么

```
用户输入
   ↓
messages = [user_message]
   ↓
while True:
    LLM 调用 → 追加 assistant 响应
    if stop_reason != "tool_use": break
    执行每个工具调用 → 追加 tool_result
```

仅此而已。没有魔法，没有框架，没有隐藏逻辑。

而 Claude Code 在这个骨架上加了一层状态机外壳：

```
while (true):
    API 调用 → 流式处理 → 追加消息
    if prompt_too_long → collapse → reactive compact → 终止
    if max_output_tokens → 升级 8k→64k → 多轮恢复 → 终止
    if stop_hook 失败 → 注入错误重试
    if 有工具调用 → 执行 → state.transition = next_turn → continuereturn { reason: 'completed' }
```

## 2.tool use:拓展模型能触达的边界

前面只有一个 `bash` 工具。这一节加 3 个专用工具，同时引入一个关键设计：dispatch map。

加工具不需要改循环,循环永远不变.

### 1.问题

只有 `bash` 时，所有操作都走 shell：

- `cat` 输出可能被截断，不可预测

- `sed` 遇到特殊字符就崩

- 每次 bash 调用都是不受约束的安全面，没有路径沙箱

专用工具（`read_file`、`write_file`、`edit_file`）可以在工具层做路径验证，防止模型意外访问工作区外的文件。

关键洞察：加工具不需要改循环.

### 2.dispatch map 设计

01的工具执行是硬编码的：

```
# s01：硬编码，每加一个工具就要改循环
if block.name == "bash":
    output = run_bash(block.input["command"])
```

02换成 dispatch map：

```
#字典查找，加工具只加 handler
TOOL_HANDLERS = {
    "bash":       lambda **kw: run_bash(kw["command"]),    
    "read_file":  lambda **kw: run_read(kw["path"], kw.get("limit")),
    "write_file": lambda **kw: run_write(kw["path"], kw["content"]),
    "edit_file":  lambda **kw: run_edit(kw["path"], kw["old_text"], kw["new_text"]),}
# 循环中：一行查找替代 if/elif 链
handler = TOOL_HANDLERS.get(block.name)
output = handler(**block.input) if handler else f"Unknown tool: {block.name}"

#lambda 匿名函数
#**kw 关键字参数解包、字典字面量 {key: value}、dict.get()、三元表达式 A if cond else B
"""
这是工具路由分发器：根据工具名称（bash/read_file/write_file/edit_file）自动匹配
对应的执行函数，替代传统一长串if/elif判断，可读性、扩展性更强
键"bash"对应匿名 lambda 函数： 
**kw：接收调用时传入的所有关键字参数，打包成字典kw
执行run_bash函数，从参数字典取出command命令传给它 
例：传入command="ls -l"，等价调用run_bash(command="ls -l")
"""
```

循环体本身和01 完全一样，只是工具执行那行变成了字典查找。

这个 Python 字典正是 Claude Code 真实架构的简化映射——在 Claude Code 源码中，同样的思路被推到了工业级规模。

### 3.源码实证：Claude Code 的工具注册表

工具注册：`src/tools.ts`

Claude Code 在 `getAllBaseTools()` 函数中返回一个 `Tools` 数组——这就是它的 “dispatch map”。核心工具直接注册，实验性工具通过 feature flag 条件注册：

```
// src/tools.ts — 工具注册表（简化）
export function getAllBaseTools(): Tools {
  return [
    AgentTool,
    TaskOutputTool,
    BashTool,
    // 内嵌搜索工具时跳过 Glob/Grep
    ...(hasEmbeddedSearchTools() ? [] : [GlobTool, GrepTool]),
    FileReadTool,
    FileEditTool,
    FileWriteTool,
    NotebookEditTool,
    WebFetchTool,
    TodoWriteTool,
    WebSearchTool,
    SkillTool,
    AskUserQuestionTool,
    EnterPlanModeTool,
    ExitPlanModeV2Tool,
    // feature flag 条件注册
    ...(SleepTool ? [SleepTool] : []),
    ...cronTools,  // CronCreate, CronDelete, CronList
    ...(isWorktreeModeEnabled()
      ? [EnterWorktreeTool, ExitWorktreeTool] : []),
    ...(isTodoV2Enabled()
      ? [TaskCreateTool, TaskGetTool, TaskUpdateTool, TaskListTool] : []),
    ...(isToolSearchEnabledOptimistic() ? [ToolSearchTool] : []),
    // ... 共计 ~40 个工具
  ]
}
```

关键设计：数组展开 + 条件三元运算符。`feature('PROACTIVE')` 返回 `true` 时 `SleepTool` 才会进入数组；`process.env.USER_TYPE === 'ant'` 控制 Anthropic 内部工具。这让同一个二进制产物能服务不同用户群。

##### 完整工具清单

`src/tools/` 目录下共 40+ 个工具目录：

##### Tool 类型定义：`src/Tool.ts`

每个工具都实现 `Tool<Input, Output, Progress>` 类型：

```
// src/Tool.ts — 核心类型（简化）
export type Tool<Input, Output, P> = {
  readonly name: string
  readonly inputSchema: Input           // Zod schemacall(
    args: z.infer<Input>,
    context: ToolUseContext,
    canUseTool: CanUseToolFn,
    parentMessage: AssistantMessage,
    onProgress?: ToolCallProgress<P>,
  ): Promise<ToolResult<Output>>
  description(input, options): Promise<string>
  isEnabled(): boolean                  // 是否在当前环境可用
  isReadOnly(input): boolean            // 只读操作？
  isDestructive?(input): boolean        // 不可逆操作？
  isConcurrencySafe(input): boolean     // 可并发执行？
  maxResultSizeChars: number            // 结果超限时持久化到磁盘
  readonly shouldDefer?: boolean        // 延迟加载（需 ToolSearch 发现）
}
```

#### 工具返回值：`ToolResult<T>`

```
export type ToolResult<T> = {
  data: T                    // 工具输出内容
  newMessages?: Message[]    // 可选：注入额外消息到上下文
  contextModifier?: (ctx: ToolUseContext) => ToolUseContext  // 可选：修改后续上下文
}
```

`data` 是返回给 LLM 的主体内容。`newMessages` 让工具可以向消息历史注入系统提示。`contextModifier` 让工具（如 `EnterPlanModeTool`）可以改变后续循环的行为。

##### ToolUseContext：工具运行时上下文

```
export type ToolUseContext = {
  messages: Message[]               // 完整对话历史
  abortController: AbortController  // 中断控制
  getAppState(): AppState           // 读全局状态
  setAppState(f): void              // 写全局状态
  queryTracking?: QueryChainTracking  // 查询链追踪
  options: {
    tools: Tools                    // 可用工具列表
    mcpClients: MCPServerConnection[]
    mainLoopModel: string// ...
  }
}
export type QueryChainTracking = {
  chainId: string   // 同一轮对话的链 ID
  depth: number     // 嵌套深度（Agent 中的 Agent）
}
```

##### 权限模型：`ToolPermissionContext`

每次工具调用前都经过权限检查：

```
export type ToolPermissionContext = DeepImmutable<{
  mode: PermissionMode                    // 'default' | 'plan' | 'bypass'
  alwaysAllowRules: ToolPermissionRulesBySource   // 始终允许
  alwaysDenyRules: ToolPermissionRulesBySource     // 始终拒绝
  alwaysAskRules: ToolPermissionRulesBySource      // 始终询问
  additionalWorkingDirectories: Map<string, AdditionalWorkingDirectory>
  isBypassPermissionsModeAvailable: boolean
  shouldAvoidPermissionPrompts?: boolean  // 后台 Agent 自动拒绝
}>
```

权限检查的结果是三选一：allow（直接执行）、deny（拒绝并返回错误）、ask（弹出对话框请求用户授权）。工具还通过 `isReadOnly()` 和 `isDestructive()` 标记自身的危险等级，`filterToolsByDenyRules()` 在工具列表发送给模型之前就过滤掉被禁止的工具。

### 4.路径沙箱

```
from pathlib import Path

WORKDIR = Path(".").resolve()

def safe_path(p: str) -> Path:
    """防止路径逃逸工作区"""
    path = (WORKDIR / p).resolve()
    if not path.is_relative_to(WORKDIR):
        raise ValueError(f"Path escapes workspace: {p}")
    return path
```

所有文件操作都通过 `safe_path()` 验证，模型无法读写工作区外的文件。

在 Claude Code 的真实实现中，`ToolPermissionContext` 中的 `additionalWorkingDirectories` 字段允许配置额外的合法工作目录，实现更灵活的沙箱策略。

### 5.四个工具的实现

```
import subprocess
from pathlib import Path

def run_bash(command: str) -> str:
    result = subprocess.run(
        command, shell=True, capture_output=True, text=True, timeout=30
    )
    return (result.stdout + result.stderr)[:50000]

def run_read(path: str, limit: int = None) -> str:
    text = safe_path(path).read_text()
    lines = text.splitlines()
    if limit and limit < len(lines):
        lines = lines[:limit]
    return "\n".join(lines)[:50000]

def run_write(path: str, content: str) -> str:
    p = safe_path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content)
    return f"Written: {path}"def run_edit(path: str, old_text: str, new_text: str) -> str:
    p = safe_path(path)
    content = p.read_text()
    if old_text not in content:
        return f"Error: old_text not found in {path}"
    p.write_text(content.replace(old_text, new_text, 1))
    return f"Edited: {path}"
```

### 6.工具 Schema

每个工具需要一个 schema 告诉 LLM 怎么调用：

```
TOOLS = [
    {
        "name": "bash",
        "description": "执行 shell 命令",
        "input_schema": {
            "type": "object",
            "properties": {"command": {"type": "string"}},
            "required": ["command"]
        }
    },
    {
        "name": "read_file",
        "description": "读取文件内容，支持 limit 参数限制行数",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "limit": {"type": "integer", "description": "最多读取的行数（可选）"}
            },
            "required": ["path"]
        }
    },
    {
        "name": "write_file",
        "description": "写入文件，自动创建父目录",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "content": {"type": "string"}
            },
            "required": ["path", "content"]
        }
    },
    {
        "name": "edit_file",
        "description": "精确查找替换文件中的内容",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "old_text": {"type": "string", "description": "要替换的原文本"},
                "new_text": {"type": "string", "description": "替换后的新文本"}
            },
            "required": ["path", "old_text", "new_text"]
        }
    }
]
```

在 Claude Code 中，schema 使用 Zod 定义（`inputSchema` 字段），运行时自动转换为 JSON Schema 发送给 API。每个工具还有动态 `description()` 方法，可以根据当前权限上下文生成不同的描述文本。

![](/images/UP0ZwLC36iJAYAkNgc8cePzPn7c/img-4.png)

### 补充

#### 为什么 edit_file 比 bash sed 更好

```
# bash sed：遇到特殊字符（/、&、\n）就崩
sed -i 's/old_text/new_text/' file.py

# edit_file：Python 字符串替换，无特殊字符问题
run_edit("file.py", old_text="def foo():", new_text="def bar():")
```

`edit_file` 还有一个额外好处：如果 `old_text` 不存在，会返回明确的错误信息，而不是静默成功（sed 的常见陷阱）。

## 3.TodoWrite：让 Agent 不再迷路

前面的 Agent 能执行工具，但在多步任务里容易迷路——重复做已完成的事，跳过某个步骤，或者中途忘记目标。

所以这一节加一个规划层：TodoManager。

注:Claude Code 内部已经将 TodoWrite 标记为 V1（已弃用），新版本使用基于文件持久化的 Task 工具族（V2）。我先讲 V1 的设计思路，再深入 V2 的真实源码实现。

### 1.问题

没有规划层时，模型靠对话历史“记住”任务进度。这有几个问题：

- 重复工作：读了文件 A 又读一遍

- 跳过步骤：忘记某个子任务

- 上下文漂移：多轮工具调用后，最初的任务目标被淹没

所以给agent加一个任务清单,让agent按任务清单来一步一步的完成任务

### 2.V1 设计：TodoWrite + TodoManager

#### Python 实现

```
from dataclasses import dataclass, field
from typing import List, Literalimport json

Status = Literal["pending", "in_progress", "completed"]

@dataclassclass TodoItem:
    id: str
    content: str
    status: Status = "pending"class TodoManager:
    def __init__(self):
        self.todos: List[TodoItem] = []
        self._rounds_since_update = 0def add(self, content: str) -> str:
        item = TodoItem(id=str(len(self.todos) + 1), content=content)
        self.todos.append(item)
        return item.iddef update(self, todo_id: str, status: Status):
        for item in self.todos:
            if item.id == todo_id:
                # 同时只能有一个 in_progressif status == "in_progress":
                    for other in self.todos:
                        if other.status == "in_progress":
                            other.status = "pending"
                item.status = status
                self._rounds_since_update = 0return f"Updated {todo_id} → {status}"return f"Todo {todo_id} not found"def view(self) -> str:
        if not self.todos:
            return "No todos."
        lines = []
        for item in self.todos:
            icon = {"pending": "○", "in_progress": "◐", "completed": "●"}[item.status]
            lines.append(f"{icon} [{item.id}] {item.content}")
        return "\n".join(lines)

    def attention_check(self) -> str | None:
        """3 轮没有更新 todo → 注入提醒"""
        self._rounds_since_update += 1if self._rounds_since_update >= 3:
            pending = [t for t in self.todos if t.status != "completed"]
            if pending:
                return f"\n[提醒] 还有 {len(pending)} 个未完成的任务，记得更新 todo 状态。"return None
```

关键设计：同时只能有一个 `in_progress` 任务。 这强迫模型专注于当前任务，而不是同时标记多个任务为进行中。

#### V1 的局限

V1 是纯内存方案——所有 todo 存在 `appState.todos` 里：

```
// TodoWriteTool.ts — V1 的核心逻辑async call({ todos }, context) {
    const appState = context.getAppState()
    const todoKey = context.agentId ?? getSessionId()
    const oldTodos = appState.todos[todoKey] ?? []
    const allDone = todos.every(_ => _.status === 'completed')
    const newTodos = allDone ? [] : todos

    context.setAppState(prev => ({
        ...prev,
        todos: {
            ...prev.todos,
            [todoKey]: newTodos,
        },
    }))
    // ...
}
```

每次调用时，模型要传入整个 todo 列表的完整快照来覆盖旧列表。这意味着：

- 无法跨会话持久化——进程退出，任务列表消失

- 无法多 Agent 共享——内存状态无法被其他进程读取

- 操作粒度粗——不能单独更新一个任务，必须传整个列表

### 3.todo 工具

```
todo_manager = TodoManager()

def run_todo(action: str, content: str = None,
             todo_id: str = None, status: str = None) -> str:
    if action == "add":
        return f"Added: {todo_manager.add(content)}"elif action == "update":
        return todo_manager.update(todo_id, status)
    elif action == "view":
        return todo_manager.view()
    return f"Unknown action: {action}"

TOOL_HANDLERS["todo"] = lambda **kw: run_todo(**kw)
```

加进 TOOLS schema：

```
{
    "name": "todo",
    "description": "管理任务列表。在开始多步任务时先创建 todo，每完成一步更新状态。",
    "input_schema": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["add", "update", "view"],
                "description": "add: 添加任务, update: 更新状态, view: 查看列表"
            },
            "content": {"type": "string", "description": "任务内容（add 时必填）"},
            "todo_id": {"type": "string", "description": "任务 ID（update 时必填）"},
            "status": {
                "type": "string",
                "enum": ["pending", "in_progress", "completed"],
                "description": "新状态（update 时必填）"
            }
        },
        "required": ["action"]
    }
}
```

### 4.attention_check：注意力机制

模型有时会忘记更新 todo。在每次 LLM 调用前检查：

```
def agent_loop(query: str):
    messages = [{"role": "user", "content": query}]

    while True:
        # 检查是否需要注入提醒
        reminder = todo_manager.attention_check()
        if reminder:
            messages[-1]["content"] += reminder  # 附加到最新消息

        response = client.messages.create(...)
        # ... 正常循环 ...
```

3 轮没有更新 todo 时，提醒会附加到当前消息末尾，让模型重新关注任务进度。

### 5.V2：Task 工具族

Claude Code 在内部用 `isTodoV2Enabled()` 做功能开关，将 TodoWrite（V1）替换为一组细粒度的 Task 工具。V2 的核心差异：文件持久化 + 单任务操作 + hooks 生命周期。

#### 切换机制：isTodoV2Enabled

```
// src/utils/tasks.ts
export function isTodoV2Enabled(): boolean {
// 通过环境变量强制启用（供 SDK 用户使用）
  if (isEnvTruthy(process.env.CLAUDE_CODE_ENABLE_TASKS)) {
    return true
  }
  // 交互式会话默认启用 V2；非交互式（SDK）默认用 V1
  return !getIsNonInteractiveSession()
}
```

这个函数同时控制两侧：

```
// TodoWriteTool.ts — V1 只在 V2 未启用时生效
isEnabled() {
    return !isTodoV2Enabled()
}

// TaskCreateTool.ts — V2 只在启用时生效
isEnabled() {
    return isTodoV2Enabled()
}
```

在 `src/tools.ts` 中，工具列表根据开关动态组装：

```
// src/tools.ts
TodoWriteTool,                          // V1，始终注册但 isEnabled 受控
...(isTodoV2Enabled()
  ? [TaskCreateTool, TaskGetTool, TaskUpdateTool, TaskListTool]
  : []),
```

#### Task 数据模型

V2 的任务不再是内存对象，而是磁盘上的 JSON 文件：

```
// src/utils/tasks.ts — Task schema
export const TaskSchema = lazySchema(() =>
  z.object({
    id: z.string(),
    subject: z.string(),               // 任务标题（祈使句）
    description: z.string(),            // 任务描述
    activeForm: z.string().optional(),  // 进行中的展示文案（现在分词形式）
    owner: z.string().optional(),       // 负责的 Agent ID
    status: TaskStatusSchema(),         // pending | in_progress | completed
    blocks: z.array(z.string()),        // 本任务阻塞了哪些任务
    blockedBy: z.array(z.string()),     // 哪些任务阻塞了本任务
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
)
```

存储路径：`~/.claude/tasks/{taskListId}/{taskId}.json`。每个任务一个文件，支持文件锁（`proper-lockfile`）防止并发冲突。

### 6.五个 Task 工具

##### TaskCreate：创建任务

```
// src/tools/TaskCreateTool/TaskCreateTool.ts
inputSchema: z.strictObject({
    subject: z.string(),          // 任务标题
    description: z.string(),      // 任务描述
    activeForm: z.string().optional(),  // spinner 展示文案
    metadata: z.record(z.string(), z.unknown()).optional(),
})
```

创建时自动触发 `executeTaskCreatedHooks`——如果 hook 返回 `blockingError`，任务会被立即删除：

```
async call({ subject, description, activeForm, metadata }, context) {
    const taskId = await createTask(getTaskListId(), {
        subject, description, activeForm,
        status: 'pending',
        owner: undefined,
        blocks: [], blockedBy: [],
        metadata,
    })

    // 执行 TaskCreated hooksconst generator = executeTaskCreatedHooks(taskId, subject, description, ...)
    for await (const result of generator) {
        if (result.blockingError) {
            blockingErrors.push(getTaskCreatedHookMessage(result.blockingError))
        }
    }
    if (blockingErrors.length > 0) {
        await deleteTask(getTaskListId(), taskId)
        throw new Error(blockingErrors.join('\n'))
    }
    // ...
}
```

##### TaskUpdate：更新任务

可更新的字段最多：

```
inputSchema: z.strictObject({
    taskId: z.string(),
    subject: z.string().optional(),
    description: z.string().optional(),
    activeForm: z.string().optional(),
    status: TaskUpdateStatusSchema.optional(),  // 包含 'deleted' 特殊状态
    addBlocks: z.array(z.string()).optional(),   // 添加阻塞关系
    addBlockedBy: z.array(z.string()).optional(),
    owner: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
})
```

设置 `status: 'deleted'` 会物理删除任务文件。标记为 `completed` 时触发`executeTaskCompletedHooks`。

一个重要细节：当 Agent Swarm 模式开启时，标记 `in_progress` 会自动设置 `owner`：

```
// 自动设置 owner
if (isAgentSwarmsEnabled() && status === 'in_progress'
    && owner === undefined && !existingTask.owner) {
    const agentName = getAgentName()
    if (agentName) {
        updates.owner = agentName
    }
}
```

##### TaskGet：查询单个任务

```
inputSchema: z.strictObject({
    taskId: z.string(),
})
// 返回: { id, subject, description, status, blocks, blockedBy }
```

只读操作，标记了 `isReadOnly: true` 和 `isConcurrencySafe: true`。

##### TaskList：列出所有任务

```
inputSchema: z.strictObject({})  // 无参数
```

会过滤掉 `metadata._internal` 为 true 的内部任务，并且从 `blockedBy` 中去除已完成任务的引用——让模型看到的阻塞关系始终是有效的。

##### TaskStop：停止后台任务

```
inputSchema: z.strictObject({
    task_id: z.string().optional(),
    shell_id: z.string().optional(),  // 向后兼容已废弃的 KillShell
})
```

这个工具停止的是后台运行的进程任务（如长时间运行的 shell 命令），不是 Task 列表中的逻辑任务。它保留了 `KillShell` 作为别名以兼容旧的 transcript。

##### V2 的文件存储与并发控制

```
// src/utils/tasks.ts// 任务存储目录
export function getTasksDir(taskListId: string): string {
    return join(getClaudeConfigHomeDir(), 'tasks', sanitizePathComponent(taskListId))
}

// 创建任务 — 带文件锁
export async function createTask(taskListId, taskData): Promise<string> {
    const lockPath = await ensureTaskListLockFile(taskListId)
    let release = await lockfile.lock(lockPath, LOCK_OPTIONS)
    try {
        const highestId = await findHighestTaskId(taskListId)
        const id = String(highestId + 1)
        const task = { id, ...taskData }
        await writeFile(getTaskPath(taskListId, id), JSON.stringify(task, null, 2))
        return id
    } finally {
        await release()
    }
}
```

锁的参数为 swarm 场景优化——最多支持 10+ 个并发 Agent，重试 30 次，退避 5-100ms：

```
const LOCK_OPTIONS = {
    retries: { retries: 30, minTimeout: 5, maxTimeout: 100 }
}
```

删除任务时还会维护 high water mark 文件（`.highwatermark`），确保已删除的任务 ID 不会被复用。

### 7.Verification Nudge：防止跳过验证

V1 和 V2 都有一个相同的安全机制——当 3 个以上任务全部标记为 completed，且没有任何一个包含 “verif” 关键词时，工具返回中会注入一段提醒：

```
// V2 中的实现（TaskUpdateTool.ts）
if (updates.status === 'completed') {
    const allTasks = await listTasks(taskListId)
    const allDone = allTasks.every(t => t.status === 'completed')
    if (allDone && allTasks.length >= 3
        && !allTasks.some(t => /verif/i.test(t.subject))) {
        verificationNudgeNeeded = true
    }
}
```

注入的提醒会要求模型在写总结之前先 spawn 一个 verification agent。这是对“所有任务完成 -> 循环退出 -> 跳过验证”这个常见失败模式的结构性防御。

### 8.V1 vs V2 对比

### 9.典型执行过程

对于“重构 src/ 目录下的所有模块”这样的任务：

```
模型第 1 轮：
  todo(add, "分析现有代码结构")
  todo(add, "重构 auth.py")
  todo(add, "重构 api.py")
  todo(add, "运行测试")
  todo(update, "1", "in_progress")

模型第 2 轮：
  bash("find src/ -name '*.py'")
  read_file("src/auth.py")
  todo(update, "1", "completed")
  todo(update, "2", "in_progress")

模型第 3 轮：
  edit_file("src/auth.py", ...)
  todo(update, "2", "completed")
  todo(update, "3", "in_progress")
  ...
```

![](/images/UP0ZwLC36iJAYAkNgc8cePzPn7c/img-5.png)

### 10.设计哲学：渐进式复杂度

TodoWrite 的 V1→V2 演化是 Claude Code 设计指南提到的渐进式复杂度原则的典型案例：

入门用户：不需要知道任务系统的存在，Claude 自动管理工作流程。

进阶用户：V1 的 TodoWrite 提供了简单的任务跟踪——一个字典，几个操作，足够应付大多数场景。

专家用户：V2 的 Task 工具族提供了完整的后台执行、磁盘持久化、并发控制，支持复杂的多任务工作流。

每个层次都是完整可用的，不需要理解下一层才能使用当前层。这和 Claude Code 整体的设计理念一致——对新手友好，对专家强大。

设计指南还强调了代码即文档原则。V2 源码中 `isTodoV2Enabled()` 的命名就是一个例子：函数名本身就解释了它的用途，注释只补充“为什么”（feature flag + 客户端版本检查），不重复“做什么”。

## 4.Subagent：上下文隔离的正确姿势

*“大任务拆小，每个小任务干净的上下文”*

这一节加一个 `task` 工具。调用它会启动一个子 Agent，子 Agent 有完整的工具能力，但它的上下文完全隔离——父 Agent 只看到最终摘要。

### 1.问题

Agent 工作越久，messages 数组越胖。读文件、跑命令的每条输出都永久留在上下文里。

“这个项目用什么测试框架？”可能要读 5 个文件，但父 Agent 只需要一个词：“pytest”。

如果直接在父 Agent 里做，这 5 次 read\_file 的完整输出都会留在 messages 里，占用宝贵的上下文空间，干扰模型对后续任务的判断。

### 2.解决方案

![](/images/UP0ZwLC36iJAYAkNgc8cePzPn7c/img-6.png)

子 Agent 可能跑了 30 次工具调用，但整个消息历史直接丢弃。父 Agent 收到的只是一段摘要文本。

### 3.源码实证：Claude Code 真实的 AgentTool

#### AgentTool 完整参数 schema

`AgentTool.tsx` 定义了两层 schema。基础参数（`baseInputSchema`）：

```
// src/tools/AgentTool/AgentTool.tsx
const baseInputSchema = lazySchema(() => z.object({
  description: z.string()
    .describe('A short (3-5 word) description of the task'),
  prompt: z.string()
    .describe('The task for the agent to perform'),
  subagent_type: z.string().optional()
    .describe('The type of specialized agent to use for this task'),
  model: z.enum(['sonnet', 'opus', 'haiku']).optional()
    .describe("Optional model override for this agent."),
  run_in_background: z.boolean().optional()
    .describe('Set to true to run this agent in the background.')
}));
```

完整参数（`fullInputSchema`）在基础上扩展了多 Agent 协作与隔离：

```
// 多 Agent 参数
name:      z.string().optional()   // 让 Agent 可通过 SendMessage({to: name}) 被寻址
team_name: z.string().optional()   // 团队名称
mode:      permissionModeSchema()  // 权限模式，如 "plan" 需要审批

// 隔离模式
isolation: z.enum(['worktree', 'remote']).optional()
  // "worktree" — 创建临时 git worktree，Agent 在代码副本上工作
  // "remote"  — 在远程 CCR 环境中启动（始终后台运行）

// 工作目录覆盖
cwd: z.string().optional()
  // 绝对路径，覆盖 Agent 的工作目录，与 worktree 互斥
```

这意味着 Claude Code 的 Agent 不是简单的“子任务执行器”，而是支持 模型选择 / 后台执行 / 团队协作 / 代码隔离 的完整多 Agent 系统。

#### runAgent.ts 执行流程

`runAgent.ts` 是子 Agent 的核心运行逻辑。简化后的流程：

![](/images/UP0ZwLC36iJAYAkNgc8cePzPn7c/img-7.png)

关键设计：sync Agent 共享父的 abortController（Ctrl+C 同时停掉），async Agent 用独立的 AbortController。

#### QueryChainTracking：嵌套 Agent 是支持的

```
// src/Tool.ts
export type QueryChainTracking = {
  chainId: string   // UUID，同一条调用链共享
  depth: number     // 0 = 顶层 Agent，每嵌套一层 +1
}
```

在 `query.ts` 中，每次进入 query 循环时：

```
// src/query.ts — 初始化或递增
const queryTracking = toolUseContext.queryTracking
  ? {
      chainId: toolUseContext.queryTracking.chainId,
      depth: toolUseContext.queryTracking.depth + 1,  // 嵌套时 +1
    }
  : {
      chainId: deps.uuid(),   // 顶层生成新 UUID
      depth: 0,               // 顶层从 0 开始
    }
```

这意味着 Claude Code 支持 Agent 嵌套调用：Agent A 调用 Agent B，Agent B 再调用 Agent C，depth 从 0 → 1 → 2 递增。`chainId` 保持不变，用于遥测和调试时追踪整条调用链。

#### 120 秒自动转后台

```
// src/tools/AgentTool/AgentTool.tsx
function getAutoBackgroundMs(): number {
  if (isEnvTruthy(process.env.CLAUDE_AUTO_BACKGROUND_TASKS)
    || getFeatureValue_CACHED_MAY_BE_STALE(
         'tengu_auto_background_agents', false)) {
    return 120_000;  // 120 秒
  }
  return 0;
}
```

如果一个同步 Agent 执行超过 120 秒，会自动转为后台任务。这解决了“子任务意外耗时很长，阻塞父 Agent 交互”的问题。

#### LocalAgentTask / RemoteAgentTask

后台 Agent 有完整的进度跟踪机制：

```
// src/tasks/LocalAgentTask/LocalAgentTask.tsx
export type AgentProgress = {
  toolUseCount: number;      // 已执行的工具调用次数
  tokenCount: number;        // 消耗的 token 总数
  lastActivity?: ToolActivity;
  recentActivities?: ToolActivity[];  // 最近 5 条活动
  summary?: string;          // 周期性摘要
};
```

`LocalAgentTask` 负责本地后台 Agent，`RemoteAgentTask` 负责远程 CCR 环境中的 Agent。两者都通过 `registerAsyncAgent` / `registerRemoteAgentTask` 注册到 AppState，父 Agent 可以随时查看进度。

### 4.简化python实现

理解了核心架构后,让我们用python来简易还原一下.

#### Subagent 运行器

```
import uuid

# 模拟 QueryChainTracking
def make_tracking(parent_tracking=None):
    """生成调用链追踪信息"""if parent_tracking:
        return {
            "chain_id": parent_tracking["chain_id"],
            "depth": parent_tracking["depth"] + 1
        }
    return {"chain_id": str(uuid.uuid4()), "depth": 0}

def run_subagent(prompt: str, parent_tracking=None,
                 model=None) -> str:
    """启动子 Agent，返回最终摘要文本

    与 Claude Code 的关键对应：
    - parent_tracking → QueryChainTracking（支持嵌套）
    - model → AgentTool 的 model 参数
    - CHILD_TOOLS 包含 task → 允许递归（靠 depth 追踪）
    """
    tracking = make_tracking(parent_tracking)
    use_model = model or MODEL

    sub_messages = [{"role": "user", "content": prompt}]

    for _ in range(30):  # 安全限制
        response = client.messages.create(
            model=use_model,
            system=SUBAGENT_SYSTEM,
            messages=sub_messages,
            tools=PARENT_TOOLS,  # 子 Agent 也有 task 工具，允许嵌套
            max_tokens=8000,
        )
        sub_messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason != "tool_use":
            break

        results = []
        for block in response.content:
            if block.type == "tool_use":
                if block.name == "task":
                    # 递归调用子 Agent，传递 tracking
                    output = run_subagent(
                        block.input["prompt"],
                        parent_tracking=tracking,
                        model=block.input.get("model"),
                    )
                else:
                    handler = TOOL_HANDLERS.get(block.name)
                    output = (handler(**block.input) if handler
                              else f"Unknown tool: {block.name}")
                results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": str(output)[:50000]
                })
        sub_messages.append({"role": "user", "content": results})

    return "".join(
        b.text for b in response.content if hasattr(b, "text")
    ) or "(no summary)"
```

### 5.task 工具定义

```
PARENT_TOOLS = BASE_TOOLS + [
    {
        "name": "task",
        "description": (
            "启动子 Agent 处理子任务，返回摘要。""子 Agent 有独立的上下文和完整的工具能力（包括再次调用 task）。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "description": {
                    "type": "string",
                    "description": "3-5 个词的任务简述"
                },
                "prompt": {
                    "type": "string",
                    "description": "子任务的完整描述，需自包含"
                },
                "model": {
                    "type": "string",
                    "enum": ["sonnet", "opus", "haiku"],
                    "description": "可选的模型覆盖"
                }
            },
            "required": ["description", "prompt"]
        }
    }
]

TOOL_HANDLERS["task"] = lambda **kw: run_subagent(
    kw["prompt"], model=kw.get("model")
)
```

注意：子 Agent 拥有 `task` 工具。 与我们最初以为的“禁止递归”不同，Claude Code 通过 `QueryChainTracking.depth` 追踪嵌套深度而非禁止嵌套。实际的安全边界是 `maxTurns` 限制和 token 预算，而不是剥夺工具。

### 6.子任务 prompt 要自包含

父 Agent 给子 Agent 的 prompt 必须包含所有必要的上下文，因为子 Agent 看不到父 Agent 的对话历史。

```
# 错误：子 Agent 不知道"这个项目"是什么"找出这个项目使用的测试框架"
# 正确：自包含的任务描述
"读取 /workspace/learn-claude-code 项目根目录下的文件，
 找出使用的测试框架（查看 requirements.txt、setup.py、pyproject.toml 等），
 返回测试框架名称和版本。"
```

### 7.什么时候用 task

适合用子 Agent 的场景：

- 需要读大量文件但只关心结论（“这个模块有什么问题？”）

- 需要独立验证（一个子 Agent 写代码，另一个子 Agent 审查）

- 独立的子任务，结果互不依赖

- 需要不同模型（用 haiku 做简单搜索，用 opus 做复杂推理）

不适合用子 Agent 的场景：

- 子任务之间有依赖（A 的输出是 B 的输入）

- 任务简单，单次工具调用就能完成

- 需要父 Agent 全程参与推理

---

### 8.设计哲学：隔离即安全

设计指南将 Claude Code 的多 Agent 模式总结为三个递进的隔离级别：

隔离级别越高，安全性越强，但协调成本也越高。这是一个经典的工程权衡。

源码中 `QueryChainTracking` 的 depth 机制体现了为失败设计的原则——不是禁止嵌套，而是追踪深度，在达到限制时优雅停止。120 秒自动转后台也是同样的思路：不是限制子 Agent 的执行时间，而是在超时后自动切换到不阻塞用户的模式。

另一个设计洞察：子 Agent 返回的是文本摘要，不是原始数据。这不是技术限制，而是刻意的设计——父 Agent 只需要结论，不需要子 Agent 的完整上下文。这和管理的委托原则一致：委派任务时，你要的是结果报告，不是执行日志。

## 5.Skill Loading：按需加载领域知识

把所有领域知识塞进 system prompt 会浪费 20,000+ token。这一节实现按需加载：系统提示只告诉模型“有哪些技能”，详细文档在模型主动请求时才加载。(按需加载框架,节省token,提高反应速度.)

### 1.问题

假设 Agent 需要处理多种任务：代码审查、写测试、生成文档、数据库操作……

如果把所有这些领域的最佳实践全部放进 system prompt：

- 每次调用都消耗 20,000+ token

- 大量无关知识干扰模型推理

- token 费用线性增加

大多数对话只用到其中一两个技能,其余的都是浪费.

### 2.解决方案:两层注入策略

![](/images/UP0ZwLC36iJAYAkNgc8cePzPn7c/img-8.png)

知识是临时的——模型用完这轮，下次需要时再加载。上下文不会被长期占用。

按需加载--just in time    

### 3.源码实证：三条加载路径

Claude Code 的技能系统并不只有一种目录格式。源码 `loadSkillsDir.ts` 揭示了三条并行的加载路径：

#### 路径 1：现代 `/skills/` 目录（推荐）

只支持目录格式：`skill-name/SKILL.md`。

```
~/.claude/skills/
  code-review/SKILL.md        ← 完整的代码审查指南
  write-tests/SKILL.md        ← 测试编写最佳实践
```

源码中 `loadSkillsFromSkillsDir()` 函数明确只接受目录，单独的 `.md` 文件会被跳过：

```
// 来自 loadSkillsDir.ts → loadSkillsFromSkillsDir()
if (!entry.isDirectory() && !entry.isSymbolicLink()) {
  // Single .md files are NOT supported in /skills/ directory
  return null
}

const skillDirPath = join(basePath, entry.name)
const skillFilePath = join(skillDirPath, 'SKILL.md')
```

#### 路径 2：遗留 `/commands/` 目录（已废弃）

同时支持目录格式（`SKILL.md`）和单文件格式（`xxx.md`）。源码将 `loadedFrom` 标记为 `'commands_DEPRECATED'`：

```
// 来自 loadSkillsDir.ts → loadSkillsFromCommandsDir()
skills.push({
  skill: createSkillCommand({
    ...parsed,
    loadedFrom: 'commands_DEPRECATED',  // 明确标记废弃
    paths: undefined,  // 遗留路径不支持条件激活
  }),
  filePath,
})
```

#### 路径 3：MCP 技能

通过 `mcpSkillBuilders.ts` 注册表模式实现。这是一个依赖解耦技巧——`loadSkillsDir.ts` 在模块初始化时注册构建函数，MCP 模块在需要时取用，避免循环依赖：

```
// loadSkillsDir.ts 尾部
registerMCPSkillBuilders({
  createSkillCommand,
  parseSkillFrontmatterFields,
})
```

#### 路径 4：内置技能（Bundled Skills）

编译进 CLI 的技能，通过 `bundledSkills.ts` 中的 `registerBundledSkill()` 注册。内置技能可以携带附加文件（`files` 字段），首次调用时才解压到磁盘：

```
// 来自 bundledSkills.ts
if (files && Object.keys(files).length > 0) {
  skillRoot = getBundledSkillExtractDir(definition.name)
  let extractionPromise: Promise<string | null> | undefinedconst inner = definition.getPromptForCommand
  getPromptForCommand = async (args, ctx) => {
    extractionPromise ??= extractBundledSkillFiles(definition.name, files)
    const extractedDir = await extractionPromise
    // ...
  }
}
```

注意 `extractionPromise ??= ...` 这个写法——通过缓存 Promise（而非结果）保证并发调用者共享同一次解压操作。

### 4.源码实证：五级优先级解析

`getSkillDirCommands()` 函数定义了严格的加载优先级。所有层级并行加载，然后按顺序合并——靠前的优先：

```
// 来自 loadSkillsDir.ts → getSkillDirCommands()
const [
  managedSkills,      // 1. 策略级（企业管控）
  userSkills,         // 2. 用户级（~/.claude/skills/）
  projectSkillsNested,// 3. 项目级（.claude/skills/，含父目录遍历）
  additionalSkillsNested, // 4. --add-dir 指定的额外目录
  legacyCommands,     // 5. 遗留 /commands/（废弃）
] = await Promise.all([
  loadSkillsFromSkillsDir(managedSkillsDir, 'policySettings'),
  loadSkillsFromSkillsDir(userSkillsDir, 'userSettings'),
  Promise.all(projectSkillsDirs.map(dir =>loadSkillsFromSkillsDir(dir, 'projectSettings'))),
  Promise.all(additionalDirs.map(dir =>loadSkillsFromSkillsDir(join(dir, '.claude', 'skills'), 'projectSettings'))),
  loadSkillsFromCommandsDir(cwd),
])
```

对应的目录路径：

加载后通过 `realpath` 进行跨路径去重（处理符号链接和重叠的父目录扫描）：

```
// 来自 loadSkillsDir.ts
async function getFileIdentity(filePath: string): Promise<string | null> {
  try {
    return await realpath(filePath)
  } catch {
    return null
  }
}
```

### 5.源码实证：Frontmatter 元数据

每个 `SKILL.md` 支持 YAML frontmatter，解析后控制技能行为。

`parseSkillFrontmatterFields()` 函数展示了完整字段集：

```
---
name: "Code Review"                 # 显示名称
description: "专业代码审查"          # 技能描述
allowed-tools:                       # 自动授权的工具列表
    - Read
    - Grep
    - Glob
when-to-use: "当用户要求审查代码时"   # 模型判断何时使用
model: opus                          # 模型覆盖（inherit = 继承当前）
user-invocable: true                 # 用户是否可直接 /xxx 调用
disable-model-invocation: false      # 禁止模型主动调用
context: fork                        # 执行模式：inline 或 fork
effort: high                         # 推理投入度
paths:                               # 条件激活的路径模式
    - "src/**/*.ts"
    - "!**/test/**"
hooks:                               # 生命周期钩子
    PreToolUse:
        - matcher: ".*"
        hooks:
            - command: "echo hook fired"
shell:                               # Shell 执行设置
    type: bash
---
```

源码中的返回值类型直接反映这些字段：

```
// parseSkillFrontmatterFields() 返回值（简化）
{
  displayName, description, allowedTools, argumentHint,
  argumentNames, whenToUse, version, model,
  disableModelInvocation, userInvocable, hooks,
  executionContext,  // 'fork' | undefined
  agent, effort, shell,
}
```

### 6.源码实证：条件技能与动态发现

#### 条件技能（paths frontmatter）

带 `paths` 字段的技能不会立即加入上下文。它们被存入 `conditionalSkills` Map，当用户操作的文件路径匹配时才激活：

```
// 来自 loadSkillsDir.ts → activateConditionalSkillsForPaths()
const skillIgnore = ignore().add(skill.paths)  // gitignore 风格匹配
for (const filePath of filePaths) {
  const relativePath = isAbsolute(filePath)
    ? relative(cwd, filePath)
    : filePath
  if (skillIgnore.ignores(relativePath)) {
    dynamicSkills.set(name, skill)
    conditionalSkills.delete(name)
    activatedConditionalSkillNames.add(name)
    break
  }
}
```

模式匹配使用 `ignore` 库（与 `.gitignore` 相同的语法），支持否定模式。这意味着你可以写：

```
paths:
  - "src/**/*.ts"
  - "!**/generated/**"
```

#### 动态目录发现

`discoverSkillDirsForPaths()` 在文件操作时自动发现嵌套的 `.claude/skills/` 目录：

```
// 来自 loadSkillsDir.ts → discoverSkillDirsForPaths()
while (currentDir.startsWith(resolvedCwd + pathSep)) {
  const skillDir = join(currentDir, '.claude', 'skills')
  if (!dynamicSkillDirs.has(skillDir)) {
    dynamicSkillDirs.add(skillDir)
    // 检查 gitignore 以阻止 node_modules 内的技能if (await isPathGitignored(currentDir, resolvedCwd)) {
      continue
    }
    newDirs.push(skillDir)
  }
  currentDir = dirname(currentDir)
}
```

安全措施：被 `.gitignore` 排除的目录（如 `node_modules/some-pkg/.claude/skills/`）不会被加载。

### 7.源码实证：Shell 命令替换与安全

技能提示中支持两个特殊变量和内联 Shell 命令：

```
// 来自 loadSkillsDir.ts → createSkillCommand() → getPromptForCommand()

// 变量替换
finalContent = finalContent.replace(/\$\{CLAUDE_SKILL_DIR\}/g, skillDir)
finalContent = finalContent.replace(/\$\{CLAUDE_SESSION_ID\}/g, getSessionId())

// Shell 命令执行（仅非 MCP 技能）if (loadedFrom !== 'mcp') {
  finalContent = await executeShellCommandsInPrompt(finalContent, ...)
}
```

这意味着在 SKILL.md 中可以写：

```
当前技能目录：${CLAUDE_SKILL_DIR}
会话 ID：${CLAUDE_SESSION_ID}

运行 lint 检查：
!`cd ${CLAUDE_SKILL_DIR} && npm run lint 2>&1 | head -20`
```

关键安全边界：MCP 技能（远程且不可信）永远不会执行内联 Shell 命令.

### 8.源码实证：SkillTool 的两条执行路径

`SkillTool.ts` 揭示了技能调用时的两条执行路径：

#### Inline 模式（默认）

技能内容注入为 user message，模型在同一上下文中继续处理：

```
// SkillTool.ts → call()
// Inline 路径：processPromptSlashCommand 展开技能内容
const processedCommand = await processPromptSlashCommand(
  commandName, args || '', commands, context,
)

return {
  data: { success: true, commandName, allowedTools, model },
  newMessages,           // 技能内容作为新消息注入
  contextModifier(ctx) { // 修改后续上下文（工具权限、模型等）
  // ... 合并 allowedTools、覆盖模型、设置 effort
  },
}
```

#### Fork 模式（子 Agent）

当 frontmatter 指定 `context: fork` 时，技能在隔离的子 Agent 中执行，拥有独立 token 预算：

```
// SkillTool.ts → call()
if (command?.type === 'prompt' && command.context === 'fork') {
  return executeForkedSkill(command, commandName, args, context, ...)
}

// executeForkedSkill() 内部
for await (const message of runAgent({
  agentDefinition,
  promptMessages,
  // ...
})) {
  agentMessages.push(message)
}
const resultText = extractResultText(agentMessages, 'Skill execution completed')
agentMessages.length = 0  // 释放内存
```

Fork 模式的优势：

- 独立 token 预算，不消耗主会话上下文

- 完成后只返回结果文本，子 Agent 的完整消息历史被释放

- 适合长时间运行的复杂技能

### 9.源码实证：技能列表的预算控制

`prompt.ts` 中的技能列表注入有精确的预算控制机制——系统提示只放名称和描述，占上下文窗口的 1%：

```
// 来自 prompt.ts
export const SKILL_BUDGET_CONTEXT_PERCENT = 0.01
export const CHARS_PER_TOKEN = 4
export const DEFAULT_CHAR_BUDGET = 8_000  // Fallback: 1% of 200k x 4

// 每条描述硬上限 250 字符
export const MAX_LISTING_DESC_CHARS = 250
```

当技能过多时自动截断描述。内置技能（bundled）永远保留完整描述，其余技能按剩余预算均匀分配：

```
// formatCommandsWithinBudget()（简化）
const bundledChars = ... // 内置技能始终完整
const remainingBudget = budget - bundledChars
const maxDescLen = Math.floor(availableForDescs / restCommands.length)

if (maxDescLen < MIN_DESC_LENGTH) {
  // 极端情况：非内置技能只显示名称return commands.map(cmd => bundledIndices.has(i)
    ? fullEntries[i].full
    : `- ${cmd.name}`
  ).join('\n')
}
```

### 10.从零实现--python简易版  skill loading

本段落通过python实现简易版本的skill loading

捕捉核心机制：

```
import os
import re
import yaml
from pathlib import Path

class SkillLoader:
    def __init__(self, skills_dirs: list[Path] = None):
        """多目录技能加载器，模拟真实的优先级解析"""
        self.skills_dirs = skills_dirs or [Path("skills")]
        self.skills: dict[str, dict] = {}
        self.conditional_skills: dict[str, dict] = {}
        self._scan()

    def _parse_frontmatter(self, content: str) -> tuple[dict, str]:
        """解析 YAML frontmatter"""if content.startswith('---'):
            end = content.find('---', 3)
            if end != -1:
                fm_text = content[3:end].strip()
                body = content[end + 3:].strip()
                try:
                    fm = yaml.safe_load(fm_text) or {}
                    return fm, body
                except yaml.YAMLError:
                    passreturn {}, content

    def _scan(self):
        """扫描所有技能目录，按优先级加载（先加载的优先）"""
        seen = set()
        for skills_dir in self.skills_dirs:
            if not skills_dir.exists():
                continuefor skill_dir in sorted(skills_dir.iterdir()):
                if not skill_dir.is_dir():
                    continue
                skill_md = skill_dir / "SKILL.md"if not skill_md.exists():
                    continue# 去重：已存在则跳过（模拟 realpath 去重）
                resolved = skill_md.resolve()
                if resolved in seen:
                    continue
                seen.add(resolved)

                content = skill_md.read_text()
                frontmatter, body = self._parse_frontmatter(content)

                name = frontmatter.get("name", skill_dir.name)
                desc = frontmatter.get("description", "")
                if not desc:
                    # fallback：取 markdown 第一行
                    lines = body.strip().splitlines()
                    desc = lines[0].lstrip("# ").strip() if lines else ""

                skill_info = {
                    "name": name,
                    "description": desc,
                    "when_to_use": frontmatter.get("when-to-use", ""),
                    "allowed_tools": frontmatter.get("allowed-tools", []),
                    "paths": frontmatter.get("paths"),
                    "context": frontmatter.get("context"),  # fork / inline"model": frontmatter.get("model"),
                    "path": skill_md,
                    "base_dir": str(skill_dir),
                    "body": body,
                }

                slug = skill_dir.name

                # 条件技能：有 paths 字段的延迟激活if skill_info["paths"]:
                    self.conditional_skills[slug] = skill_info
                else:
                    self.skills[slug] = skill_info

    def activate_for_paths(self, file_paths: list[str], cwd: str) -> list[str]:
        """当文件被操作时，激活匹配的条件技能（简化版 gitignore 匹配）"""import fnmatch
        activated = []
        to_remove = []
        for slug, skill in self.conditional_skills.items():
            patterns = skill["paths"]
            if isinstance(patterns, str):
                patterns = [patterns]
            for fp in file_paths:
                rel = os.path.relpath(fp, cwd)
                if any(fnmatch.fnmatch(rel, p) for p in patterns):
                    self.skills[slug] = skill
                    to_remove.append(slug)
                    activated.append(slug)
                    breakfor slug in to_remove:
            del self.conditional_skills[slug]
        return activated

    def list_summary(self, char_budget: int = 8000) -> str:
        """生成技能列表摘要，带预算控制"""if not self.skills:
            return "No skills available."

        lines = ["## Available Skills\n"]
        total_chars = 0for slug, info in self.skills.items():
            desc = info["description"]
            if info["when_to_use"]:
                desc = f"{desc} - {info['when_to_use']}"# 单条描述硬上限（模拟 MAX_LISTING_DESC_CHARS = 250）if len(desc) > 250:
                desc = desc[:249] + "..."
            entry = f"- **{slug}**: {desc}"if total_chars + len(entry) > char_budget:
                entry = f"- **{slug}**"  # 超预算只显示名称
            lines.append(entry)
            total_chars += len(entry)

        lines.append("\n使用 Skill 工具加载完整技能文档。")
        return "\n".join(lines)

    def load(self, skill_name: str) -> dict:
        """加载完整技能，返回内容和元数据"""if skill_name not in self.skills:
            available = ", ".join(self.skills.keys())
            raise ValueError(f"Skill '{skill_name}' not found. Available: {available}")

        skill = self.skills[skill_name]
        content = skill["body"]

        # 变量替换（模拟 ${CLAUDE_SKILL_DIR}）
        content = content.replace("${SKILL_DIR}", skill["base_dir"])

        return {
            "content": f"Base directory for this skill: {skill['base_dir']}\n\n{content}",
            "allowed_tools": skill["allowed_tools"],
            "model": skill["model"],
            "context": skill["context"],
        }

# 实例化：模拟真实的多目录优先级
skill_loader = SkillLoader([
    Path.home() / ".claude" / "managed" / "skills",  # 1. 策略级
    Path.home() / ".claude" / "skills",               # 2. 用户级
    Path(".claude") / "skills",                        # 3. 项目级
])
```

### 11.集成到 Agent

System prompt 注入技能列表：

```
SYSTEM = f"""你是一个 Coding Agent，可以执行工具完成编程任务。

{skill_loader.list_summary()}
"""
```

Skill 工具（区分 inline 和 fork 模式）：

```
TOOLS.append({
    "name": "Skill",
    "description": "Execute a skill within the main conversation. ""When users reference a slash command (e.g. /commit), use this tool.",
    "input_schema": {
        "type": "object",
        "properties": {
            "skill": {
                "type": "string",
                "description": "技能名称（目录名），如 'code-review', 'write-tests'"
            },
            "args": {
                "type": "string",
                "description": "可选参数"
            }
        },
        "required": ["skill"]
    }
})

def handle_skill(skill: str, args: str = "") -> dict:
    """处理技能调用，区分 inline 和 fork 模式"""
    result = skill_loader.load(skill)

    if result["context"] == "fork":
        # Fork 模式：启动子 Agent
        sub_result = run_sub_agent(
            prompt=result["content"],
            allowed_tools=result["allowed_tools"],
            model=result.get("model"),
        )
        return {"status": "forked", "result": sub_result}

    # Inline 模式：注入到当前会话return {
        "status": "inline",
        "content": result["content"],
        "allowed_tools": result["allowed_tools"],
        "model": result.get("model"),
    }

TOOL_HANDLERS["Skill"] = lambda **kw: handle_skill(kw["skill"], kw.get("args", ""))
```

---

### 12执行流程

![](/images/UP0ZwLC36iJAYAkNgc8cePzPn7c/img-9.png)

### 13.SKILL.md 示例

```
---name: Code Review
description: 专业代码审查技能，覆盖安全性、性能、可维护性
when-to-use: 当用户要求审查代码、做 PR review 或检查代码质量时
allowed-tools:
    - Read
    - Grep
    - Glob
    paths:
        - "src/**"
        - "!**/test/**"
---
## 审查维度

### 安全性
- [ ] SQL 注入：所有数据库操作使用参数化查询
- [ ] 输入验证：外部输入在边界处验证
- [ ] 敏感信息：密钥、密码不硬编码

### 性能
- [ ] N+1 查询：循环内不调用数据库
- [ ] 无用导入：删除未使用的 import

### 可读性
- [ ] 函数长度：超过 50 行考虑拆分
- [ ] 命名：变量名表达意图，不用单字母

## 输出格式

每个问题按以下格式报告：
**[严重度]** 文件:行号 -- 问题描述
建议：具体修改方案

## 辅助脚本
运行项目 lint：
!`cd ${CLAUDE_SKILL_DIR} && cat lint-rules.json`
```

### 14.架构要点总结

从源码中可以提炼出几个值得借鉴的设计决策：

1. 多源并行加载 + 顺序去重：`Promise.all` 并行读取所有目录，然后按优先级顺序合并、`realpath` 去重

2. 条件激活：`paths` frontmatter 让技能零成本注册，只在操作匹配文件时才进入上下文

3. 两种执行模式：inline（注入消息）vs fork（子 Agent），通过 frontmatter 一键切换

4. 预算控制：技能列表占固定比例的上下文窗口，自动截断描述防止溢出

5. 安全边界：MCP 技能禁止 Shell 执行；内置技能用 `O_NOFOLLOW | O_EXCL` 防路径遍历攻击；gitignored 目录不加载

### 15.设计哲学：三层可扩展性

设计指南将 Claude Code 的扩展机制总结为三个层次：

Skills 处于中间层，这个定位决定了它的设计选择：

- 比 MCP 更轻量（不需要启动服务器进程）

- 比 Plugins 更安全（只注入 Markdown 文本，不执行代码）

- 通过 frontmatter 元数据实现条件激活，兼顾灵活性和 token 效率

这三层遵循一个共同原则：显式优于隐式。技能通过 `paths` 字段显式声明适用范围，MCP 工具通过 schema 显式声明参数，Plugins 通过 API 显式注册能力。没有“自动发现”的魔法，一切可追溯。

## 6.Context Compact：三层压缩换无限会话

上下文压缩策略

读一个 1000 行的文件就吃掉约 4000 token；读 30 个文件、跑 20 条命令，轻松突破 100k token。不压缩，Agent 根本没法在大项目里干活。

Claude Code 的解决方案是一套三层压缩系统，激进程度递增，外加一个轻量级的 Session Memory 辅助机制。

### 1.源码实证：真实的三层架构

![](/images/UP0ZwLC36iJAYAkNgc8cePzPn7c/img-10.png)

### 2.Layer 1：Microcompact — 无 LLM 调用的静默清理

Microcompact 是最轻量的一层，不调用 LLM，直接在消息数组上做原地修改（mutation）。它有两条触发路径：

#### 路径 A：常规 Microcompact

每次 LLM 调用前执行，把旧的 tool\_result 替换为占位符。只处理特定工具类型：

```
// 源码：microCompact.ts:41-50
const COMPACTABLE_TOOLS = new Set<string>([
  FILE_READ_TOOL_NAME,
  ...SHELL_TOOL_NAMES,    // Bash, BashBackground 等GREP_TOOL_NAME,
  GLOB_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  FILE_EDIT_TOOL_NAME,
  FILE_WRITE_TOOL_NAME,
])
```

保留最近 N 个结果（由 `keepRecent` 控制，默认 5），早期结果被替换为 `[Old tool result content cleared]`。

#### 路径 B：时间触发 Microcompact

当用户离开超过 30-60 分钟再回来时，服务端的 prompt cache 几乎必然已过期。此时触发更激进的清理：

```
// 源码：timeBasedMCConfig.ts:30-34
const TIME_BASED_MC_CONFIG_DEFAULTS: TimeBasedMCConfig = {
  enabled: false,
  gapThresholdMinutes: 60,   // 服务端 1h cache TTL 过期
  keepRecent: 5,
}
```

#### 路径 C：缓存编辑（Cached Microcompact）

内部版本还有一条 `cache_edits` API 路径——不是直接修改消息，而是通过 API 的缓存编辑能力在服务端清除旧内容，保持 prompt cache 命中率。

#### 从零实现

核心思路很简单——把旧的工具输出替换为一行占位符：

```
KEEP_RECENT = 3   # 保留最近 3 个 tool_result
def micro_compact(messages: list) -> list:
    """把旧的 tool_result 替换为简短占位符"""# 收集所有 tool_result
    tool_results = []
    for i, msg in enumerate(messages):
        if msg["role"] == "user" and isinstance(msg.get("content"), list):
            for j, part in enumerate(msg["content"]):
                if isinstance(part, dict) and part.get("type") == "tool_result":
                    tool_results.append((i, j, part))

    if len(tool_results) <= KEEP_RECENT:
        return messages

    # 把早期的大结果替换为占位符
    for i, j, part in tool_results[:-KEEP_RECENT]:
        if len(str(part.get("content", ""))) > 100:
            # 从对应的 tool_use block 里找工具名
            tool_name = _find_tool_name(messages, part.get("tool_use_id", ""))
            part["content"] = f"[Previous: used {tool_name}]"return messages

def _find_tool_name(messages: list, tool_use_id: str) -> str:
    for msg in messages:
        if msg["role"] == "assistant":
            for block in (msg.get("content") or []):
                if hasattr(block, "id") and block.id == tool_use_id:
                    return block.name
    return "tool"
```

效果：大量工具输出被压缩为一行，模型仍然知道“做过这件事”，但不再占用大量上下文。

### 3.Layer 2：Full Compact — Fork Sonnet 生成结构化摘要

Full Compact 是真正的“重炮”——fork 一个 Sonnet 子进程，用专门的 summary prompt 把整段对话浓缩成结构化摘要。

#### 核心流程

Step 1：预处理

发送给摘要模型之前，先做两步清理：

```
// 源码：compact.ts:145-199 — 剥离图片和文档
export function stripImagesFromMessages(messages: Message[]): Message[] {
// image -> [image], document -> [document]
// 包括嵌套在 tool_result 里的媒体块
}

// 源码：compact.ts:211-223 — 剥离会被重新注入的 attachment
export function stripReinjectedAttachments(messages: Message[]): Message[] {
// 移除 skill_discovery / skill_listing 类型的 attachment
// 因为压缩后会重新注入
}
```

Step 2：Fork Sonnet 生成摘要

Prompt 要求模型输出两个 XML 块：

- `<analysis>` — 思维草稿（scratchpad），压缩后会被丢弃

- `<summary>` — 最终摘要，包含 9 个结构化部分

```
// 源码：prompt.ts — summary 的 9 个部分
1. Primary Request and Intent — 用户的明确请求
2. Key Technical Concepts — 技术概念和框架
3. Files and Code Sections — 涉及的文件和代码片段
4. Errors and fixes — 遇到的错误和修复方式
5. Problem Solving — 已解决的问题
6. All user messages — 所有非 tool_result 的用户消息
7. Pending Tasks — 待完成的任务
8. Current Work — 压缩前正在做的事
9. Optional Next Step — 下一步计划（含原文引用防止漂移）
```

Step 3：PTL 重试循环

如果 compact 本身的请求也超出了 prompt-too-long 限制，会进入重试循环：

```
// 源码：compact.ts:227-291const MAX_PTL_RETRIES = 3
export function truncateHeadForPTLRetry(
  messages: Message[],
  ptlResponse: AssistantMessage,
): Message[] | null {
  // 按 API-round 分组（groupMessagesByApiRound）
  // 从头部丢弃最老的组，直到腾出足够空间
  // 如果有 tokenGap 信息，精确丢弃；否则丢弃 20% 的组
  // 至少保留一个组用于生成摘要
}
```

Step 4：后置附件注入

压缩完成后，自动附加关键上下文，确保模型不会“失忆”：

```
// 源码：compact.ts:122-131
export const POST_COMPACT_MAX_FILES_TO_RESTORE = 5   // 最多恢复 5 个最近读取的文件
export const POST_COMPACT_TOKEN_BUDGET = 50_000       // 总预算 50K token
export const POST_COMPACT_MAX_TOKENS_PER_FILE = 5_000
export const POST_COMPACT_MAX_TOKENS_PER_SKILL = 5_000
export const POST_COMPACT_SKILLS_TOKEN_BUDGET = 25_000
```

附件包括：最近读取的文件内容、当前 plan、已激活的 skill、工具/agent 列表变化量。

#### Partial Compact

Full Compact 还支持两种部分压缩方向：

- `from` 方向：保留前缀（cache 友好），只压缩后半段对话

- `up_to` 方向：保留后缀（最近消息不动），只压缩前半段

#### 从零实现

```
import json, time
from pathlib import Path

TRANSCRIPT_DIR = Path(".transcripts")
TRANSCRIPT_DIR.mkdir(exist_ok=True)

def full_compact(messages: list) -> list:
    """Fork Sonnet 生成结构化摘要"""# 1. 保存完整记录
    path = TRANSCRIPT_DIR / f"transcript_{int(time.time())}.jsonl"
    with open(path, "w") as f:
        for msg in messages:
            f.write(json.dumps(msg, default=str) + "\n")
    print(f"[compact] Saved transcript to {path}")

    # 2. LLM 生成摘要
    response = client.messages.create(
        model=MODEL,
        messages=[{
            "role": "user",
            "content": (
                "以下是一段 Agent 的对话记录。"
                "请生成一份结构化摘要，包含：\n"
                "1. 用户请求  2. 技术概念  3. 文件和代码\n"
                "4. 错误和修复  5. 待完成任务  6. 当前工作\n\n"
                "先在 <analysis> 中梳理思路，再在 <summary> 中给出最终摘要。\n\n"
                + json.dumps(messages, default=str)[:80000]
            )
        }],
        max_tokens=2000,
    )
    summary = response.content[0].text

    # 3. 用摘要替换整个 messagesreturn [
        {"role": "user", "content": f"[对话摘要]\n\n{summary}"},
        {"role": "assistant", "content": "明白，我会在此基础上继续。"},
    ]
```

### 4.Layer 3：Auto Compact — 阈值触发 + 熔断器

Auto Compact 是调度层——决定何时触发压缩，以及选择哪种压缩方式。

#### 触发阈值

```
// 源码：autoCompact.ts:63-66export const AUTOCOMPACT_BUFFER_TOKENS = 13_000
export const WARNING_THRESHOLD_BUFFER_TOKENS = 20_000
export const ERROR_THRESHOLD_BUFFER_TOKENS = 20_000
export const MANUAL_COMPACT_BUFFER_TOKENS = 3_000
```

阈值计算：`context_window - max_output_tokens - AUTOCOMPACT_BUFFER_TOKENS`

例如 200K 窗口、20K 输出保留，autocompact 阈值 = 200K - 20K - 13K = 167K。

#### 熔断器

连续失败 3 次后停止重试，避免浪费 API 调用：

```
// 源码：autoCompact.ts:70const MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3// BQ 2026-03-10: 1,279 sessions had 50+ consecutive failures// wasting ~250K API calls/day globally
```

#### 压缩策略选择

Auto Compact 触发后，先尝试轻量级的 Session Memory 压缩，失败才回退到 Full Compact：

```
// 源码：autoCompact.ts:288-310// EXPERIMENT: Try session memory compaction firstconst sessionMemoryResult = await trySessionMemoryCompaction(
  messages,
  toolUseContext.agentId,
  recompactionInfo.autoCompactThreshold,
)
if (sessionMemoryResult) {
  setLastSummarizedMessageId(undefined)
  runPostCompactCleanup(querySource)
  return { wasCompacted: true, compactionResult: sessionMemoryResult }
}

// 失败则走 Full Compactconst compactionResult = await compactConversation(
  messages, toolUseContext, cacheSafeParams,
  true,      // suppressFollowUpQuestionsundefined, // no custom instructionstrue,      // isAutoCompact
)
```

#### 禁用条件

Auto Compact 在以下情况会被跳过：

- `DISABLE_COMPACT` 或 `DISABLE_AUTO_COMPACT` 环境变量

- 用户配置 `autoCompactEnabled = false`

- Context-Collapse 模式激活（Collapse 有自己的上下文管理）

- Reactive-Compact 模式激活（让 API 的 prompt-too-long 来触发）

- 子 Agent（session\_memory / compact / marble\_origami）

#### 从零实现

```
THRESHOLD = 50_000    # token 阈值
MAX_FAILURES = 3      # 熔断器

_consecutive_failures = 0def auto_compact_if_needed(messages: list) -> list:
    """阈值触发自动压缩，带熔断器"""global _consecutive_failures

    if _consecutive_failures >= MAX_FAILURES:
        return messages

    if estimate_tokens(messages) < THRESHOLD:
        return messages

    try:
        result = full_compact(messages)
        _consecutive_failures = 0return result
    except Exception:
```

### 5.Layer 3：Auto Compact — 阈值触发 + 熔断器

Auto Compact 是调度层——决定何时触发压缩，以及选择哪种压缩方式。

#### 触发阈值

```
// 源码：autoCompact.ts:63-66
export const AUTOCOMPACT_BUFFER_TOKENS = 13_000
export const WARNING_THRESHOLD_BUFFER_TOKENS = 20_000
export const ERROR_THRESHOLD_BUFFER_TOKENS = 20_000
export const MANUAL_COMPACT_BUFFER_TOKENS = 3_000
```

阈值计算：`context_window - max_output_tokens - AUTOCOMPACT_BUFFER_TOKENS`

例如 200K 窗口、20K 输出保留，autocompact 阈值 = 200K - 20K - 13K = 167K。

#### 熔断器

连续失败 3 次后停止重试，避免浪费 API 调用：

```
// 源码：autoCompact.ts:70
const MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3
// BQ 2026-03-10: 1,279 sessions had 50+ consecutive failures
// wasting ~250K API calls/day globally
```

#### 压缩策略选择

Auto Compact 触发后，先尝试轻量级的 Session Memory 压缩，失败才回退到 Full Compact：

```
// 源码：autoCompact.ts:288-310
// EXPERIMENT: Try session memory compaction first
const sessionMemoryResult = await trySessionMemoryCompaction(
  messages,
  toolUseContext.agentId,
  recompactionInfo.autoCompactThreshold,
)
if (sessionMemoryResult) {
  setLastSummarizedMessageId(undefined)
  runPostCompactCleanup(querySource)
  return { wasCompacted: true, compactionResult: sessionMemoryResult }
}

// 失败则走 Full Compact
const compactionResult = await compactConversation(
  messages, toolUseContext, cacheSafeParams,
  true,      // suppressFollowUpQuestions
  undefined, // no custom instructions
  true,      zz// isAutoCompact
)
```

#### 禁用条件

Auto Compact 在以下情况会被跳过：

- `DISABLE_COMPACT` 或 `DISABLE_AUTO_COMPACT` 环境变量

- 用户配置 `autoCompactEnabled = false`

- Context-Collapse 模式激活（Collapse 有自己的上下文管理）

- Reactive-Compact 模式激活（让 API 的 prompt-too-long 来触发）

- 子 Agent（session\_memory / compact / marble\_origami）

#### 从零实现

```
THRESHOLD = 50_000    # token 阈值
MAX_FAILURES = 3      # 熔断器

_consecutive_failures = 0
def auto_compact_if_needed(messages: list) -> list:
    """阈值触发自动压缩，带熔断器"""
    global _consecutive_failures

    if _consecutive_failures >= MAX_FAILURES:
        return messages

    if estimate_tokens(messages) < THRESHOLD:
        return messages

    try:
        result = full_compact(messages)
        _consecutive_failures = 0
        return result
    except Exception:
        _consecutive_failures += 1
        return messages
```

### 6.辅助机制：Session Memory

Session Memory 是一个更轻量级的会话记忆系统，独立于三层压缩之外。它维护一个 markdown 格式的笔记文件，由 post-sampling hook 在后台更新。

#### 触发条件

Session Memory 基于两个阈值的双重门控：

```
// 源码：sessionMemoryUtils.ts:31-36
export const DEFAULT_SESSION_MEMORY_CONFIG: SessionMemoryConfig = {
  minimumMessageTokensToInit: 10000,   // 首次触发：上下文达 10K token
  minimumTokensBetweenUpdate: 5000,    // 后续更新：增长 5K token
  toolCallsBetweenUpdates: 3,          // 且至少 3 次工具调用
}
```

必须同时满足 token 增长阈值 AND 工具调用阈值（或当前轮没有工具调用时只需 token 阈值）。

#### 笔记模板

```
# Session Title
# Current State     ← 压缩后恢复的关键
# Task specification
# Files and Functions
# Workflow# Errors & Corrections
# Codebase and System Documentation
# Learnings
# Key results
# Worklog
```

每个 section 上限约 2000 token，全文上限 12000 token。超限时模型被提示“MUST condense”。

#### 与压缩的关系

Session Memory 不替代 Full Compact，而是提供了一种更省钱的替代路径。Auto Compact 触发时会先尝试 `trySessionMemoryCompaction()`——如果 session memory 里已经有了足够的上下文，可以跳过昂贵的 Sonnet fork。

### 7.完整循环集成

#### 从零实现

```
# 手动压缩工具
TOOL_HANDLERS["compact"] = lambda **kw: _manual_compact()
_compact_requested = Falsedef _manual_compact():
    global _compact_requested
    _compact_requested = Truereturn "Compacting conversation..."
    def agent_loop(messages: list):
    while True:
        # Layer 1：静默微压缩（每轮）
        micro_compact(messages)

        # Layer 3：超出阈值自动压缩（内部调用 Layer 2）
        messages[:] = auto_compact_if_needed(messages)

        response = client.messages.create(
            model=MODEL, system=SYSTEM,
            messages=messages, tools=TOOLS, max_tokens=8000,
        )
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason != "tool_use":
            break

        results = []
        for block in response.content:
            if block.type == "tool_use":
                output = TOOL_HANDLERS.get(block.name, lambda **kw: "Unknown tool")(**block.input)
                results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": str(output)[:50000]
                })
        messages.append({"role": "user", "content": results})

        # 手动压缩标志global _compact_requested
        if _compact_requested:
            messages[:] = full_compact(messages)
            _compact_requested = False
```

### 8.源码中的关键设计决策

#### 为什么 Microcompact 不调用 LLM？

每轮都跑，必须零延迟。直接修改消息数组（mutation）或走 API 的 `cache_edits` 能力，不产生额外 API 调用。

#### 为什么 Full Compact 输出 `<analysis>` + `<summary>` 两个块？

`<analysis>` 是思维草稿（scratchpad），让模型先梳理完整上下文再写摘要。压缩后 `<analysis>` 被丢弃，只保留 `<summary>` 进入新上下文——既保证摘要质量，又不浪费 token。

#### 为什么要按 API-round 分组？

PTL 重试时需要从头部丢弃消息。按 API-round 分组（`groupMessagesByApiRound`）保证每个组是一次完整的 API 往返，不会拆散 tool\_use/tool\_result 配对。

#### 为什么 Auto Compact 要加熔断器？

源码注释直接给了答案：*“1,279 sessions had 50+ consecutive failures (up to 3,272), wasting \~250K API calls/day globally.”* 3 次连续失败后停止重试。

#### 压缩后为什么要注入附件？

摘要再好也会丢失细节。注入最近读取的 5 个文件（每个 5K token 上限）、当前 plan、已激活 skill、工具/agent 列表变化量，确保模型在压缩后仍能“接上”工作。

### 9.三层对比

三层各有侧重。Microcompact 是零成本的持续清理；Full Compact 是 Sonnet 驱动的大规模摘要；Auto Compact 是智能调度器，先尝试轻量路径再回退到重量级方案。Session Memory 独立运行，为压缩提供辅助上下文。

### 10.设计哲学：Context Engineering 的核心命题

设计指南将 Claude Code 的上下文管理提升到一个独立的工程学科——Context Engineering，区别于大众熟知的 Prompt Engineering：

Auto-Compact 揭示了一个深刻的设计原则：智能系统需要有选择地遗忘。人类的记忆也是这样工作的——我们不记得每一个细节，但我们记得重要的事情。三层压缩架构正是对“遗忘的艺术”的工程实现：

- Microcompact（持续遗忘）：每轮自动清理工具输出的细节，只保留操作摘要

- Full Compact（主动遗忘）：用 LLM 判断什么值得记住，什么可以丢弃

- Auto Compact（防御性遗忘）：熔断器确保系统在极端情况下也不会崩溃

设计指南特别强调了为失败设计原则在压缩系统中的体现：Reactive Compact 是 Auto Compact 的“保险丝”——即使自动压缩没有及时触发，API 返回 `prompt_too_long` 时也能自动恢复。这种多层防御的设计，让系统在面对不可预测的对话长度时始终保持稳定。

### 11.Post-Compact 清理

> 源码位置：`src/services/compact/postCompactCleanup.ts`

压缩完成后需要清理大量缓存状态：

- 重置 Microcompact 状态

- 清除 system prompt section 缓存

- 清除权限分类器审批缓存

- 清除 session messages 缓存

- 重置 Context-Collapse 状态（仅主线程）

- 清除 memory files 缓存（仅主线程）

- 不清除 skill 内容（需要跨多次压缩存活）

关键区分：子 Agent 与主线程共享进程级模块状态，所以子 Agent 压缩时不重置主线程的模块级状态（context-collapse、memory file cache），否则会污染主线程。

## 7.Task System：统一任务框架

TaskCreate/Update/Get/List 是面向用户的 V2 Tool 接口——模型通过它们创建和查询任务。

但接口背后，驱动一切的是一个 内部任务框架：统一的类型体系、不可变状态更新、磁盘输出流、轮询通知、自动驱逐。

这一节先用源码实证看清真实架构，再从零实现一个持久化 DAG。

### 1.源码实证：真实的任务框架

#### 6 种 TaskType

Claude Code 不是只有一种“任务”。它有 7 种 TaskType，每种有唯一的 ID 前缀：

```
// src/Task.tsexport type TaskType =
  | 'local_bash'          // 前缀 'b' — 本地 shell 命令
  | 'local_agent'         // 前缀 'a' — 本地 agent 子会话
  | 'remote_agent'        // 前缀 'r' — 远程 agent
  | 'in_process_teammate' // 前缀 't' — 进程内协作者
  | 'local_workflow'      // 前缀 'w' — 本地工作流脚本
  | 'monitor_mcp'         // 前缀 'm' — MCP 监控
  | 'dream'               // 前缀 'd' — 后台推测任务
```

ID 生成算法：前缀 + 8 位随机字符（36 进制，约 2.8 万亿组合）：

```
// src/Task.ts
export function generateTaskId(type: TaskType): string {
  const prefix = getTaskIdPrefix(type)
  const bytes = randomBytes(8)
  let id = prefix
  for (let i = 0; i < 8; i++) {
    id += TASK_ID_ALPHABET[bytes[i]! % TASK_ID_ALPHABET.length]
  }
  return id
}
// 示例：local_bash → "b3k7f9x2a"，local_agent → "ahj4m8n1p"
```

#### 统一的状态生命周期

所有任务共享一个 5 态生命周期：

```
// src/Task.tsexport type TaskStatus =
  | 'pending'    // 已创建，等待启动
  | 'running'    // 执行中
  | 'completed'  // 成功完成
  | 'failed'     // 失败
  | 'killed'     // 被用户或系统终止
```

![](/images/UP0ZwLC36iJAYAkNgc8cePzPn7c/img-11.png)

终态守卫——防止对已死任务做状态转换：

```
// src/Task.ts
export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'killed'
}
```

#### TaskStateBase：所有任务的公共骨架

```
// src/Task.ts
export type TaskStateBase = {
  id: string           // 带前缀的唯一 ID
  type: TaskType       // 任务类型
  status: TaskStatus   // 当前状态
  description: string  // 人类可读描述
  toolUseId?: string   // 关联的 tool_use IDs
  tartTime: number    // 创建时间戳
  endTime?: number     // 结束时间戳
  outputFile: string   // 磁盘输出文件路径
  outputOffset: number // 已读取的字节偏移量
  notified: boolean    // 父级是否已被通知
}

export function createTaskStateBase(
  id: string, type: TaskType,
  description: string, toolUseId?: string,
): TaskStateBase {
  return {
    id, type, status: 'pending', description, toolUseId,
    startTime: Date.now(),
    outputFile: getTaskOutputPath(id),
    outputOffset: 0,
    notified: false,
  }
}
```

每种具体任务在此基础上扩展自己的字段。类型联合体确保类型安全：

```
// src/tasks/types.ts
export type TaskState =
  | LocalShellTaskState
  | LocalAgentTaskState
  | RemoteAgentTaskState
  | InProcessTeammateTaskState
  | LocalWorkflowTaskState
  | MonitorMcpTaskState
  | DreamTaskState
```

#### framework.ts：任务引擎的四大核心函数

所有任务类型共用 `src/utils/task/framework.ts` 中的统一框架。

##### registerTask() — 注册任务到全局状态

```
// src/utils/task/framework.ts
export function registerTask(task: TaskState, setAppState: SetAppState): void {
  let isReplacement = falsesetAppState(prev => {
    const existing = prev.tasks[task.id]
    isReplacement = existing !== undefined
    // 恢复时保留 UI 状态（retain, startTime, messages）
    const merged = existing && 'retain' in existing
      ? { ...task, retain: existing.retain, startTime: existing.startTime,
          messages: existing.messages, diskLoaded: existing.diskLoaded,
          pendingMessages: existing.pendingMessages }
      : task
    return { ...prev, tasks: { ...prev.tasks, [task.id]: merged } }
  })

  // 替换（恢复）不是新启动，跳过避免重复发送
  if (isReplacement) returnenqueueSdkEvent({
    type: 'system', subtype: 'task_started',
    task_id: task.id, description: task.description,
    task_type: task.type, ...
  })
}
```

关键设计：

- 不可变更新：用 `setAppState(prev => ...)` 函数式更新，永远不直接修改

- 恢复感知：如果任务 ID 已存在（resume 场景），保留 UI 状态，不重复发 SDK 事件

- SDK 事件：首次注册时发射 `task_started` 事件，驱动外部集成

##### updateTaskState() — 类型安全的状态更新

```
export function updateTaskState<T extends TaskState>(
  taskId: string,
  setAppState: SetAppState,
  updater: (task: T) => T,
): void {
  setAppState(prev => {
    const task = prev.tasks?.[taskId] as T | undefinedif (!task) return prev
    const updated = updater(task)
    // 同引用 → 无变化 → 跳过 spread，避免不必要的 re-render
    if (updated === task) return prev
    return { ...prev, tasks: { ...prev.tasks, [taskId]: updated } }
  })
}
```

泛型 `<T extends TaskState>` 让每种任务实现在更新时拿到自己的具体类型，而不是宽泛的联合体。

##### evictTerminalTask() — 完成后驱逐释放内存

```
export function evictTerminalTask(
  taskId: string, setAppState: SetAppState,
): void {
  setAppState(prev => {
    const task = prev.tasks?.[taskId]
    if (!task) return prev
    if (!isTerminalTaskStatus(task.status)) return prev  // 非终态，不驱逐
    if (!task.notified) return prev  // 还没通知父级，不驱逐
    // 面板宽限期：local_agent 有 retain 字段，需要等 evictAfter
    if ('retain' in task && (task.evictAfter ?? Infinity) > Date.now()) {
      return prev
    }
    const { [taskId]: _, ...remainingTasks } = prev.tasks
    return { ...prev, tasks: remainingTasks }
  })
}
```

驱逐有三道守卫：终态 → 已通知 → 宽限期过期。

##### generateTaskAttachments() — 轮询输出增量

```
export async function generateTaskAttachments(state: AppState): Promise<{
  attachments: TaskAttachment[]
  updatedTaskOffsets: Record<string, number>
  evictedTaskIds: string[]
}> {
  for (const taskState of Object.values(tasks)) {
    if (taskState.notified && isTerminalTaskStatus(taskState.status)) {
      evictedTaskIds.push(taskState.id)  // 已消费的终态任务 → GCcontinue
    }
    if (taskState.status === 'running') {
      const delta = await getTaskOutputDelta(
        taskState.id, taskState.outputOffset)
      if (delta.content) {
        updatedTaskOffsets[taskState.id] = delta.newOffset
      }
    }
  }
  return { attachments, updatedTaskOffsets, evictedTaskIds }
}
```

关键常量：

```
export const POLL_INTERVAL_MS = 1000     // 轮询间隔
export const STOPPED_DISPLAY_MS = 3_000  // killed 后显示时长
export const PANEL_GRACE_MS = 30_000     // 面板宽限期（30 秒）
```

#### 任务注册表：tasks.ts

所有任务类型在 `src/tasks.ts` 注册，形成统一分发：

```
// src/tasks.ts
export function getAllTasks(): Task[] {
  const tasks: Task[] = [
    LocalShellTask,
    LocalAgentTask,
    RemoteAgentTask,
    DreamTask,
  ]
  if (LocalWorkflowTask) tasks.push(LocalWorkflowTask)
  if (MonitorMcpTask) tasks.push(MonitorMcpTask)
  return tasks
}

export function getTaskByType(type: TaskType): Task | undefined {
  return getAllTasks().find(t => t.type === type)
}
```

每个 `Task` 实现必须提供 `name`、`type`、`kill()` 方法。spawn 和 render 是各类型自行实现的，不走多态分发。

#### 架构全景图

![](/images/UP0ZwLC36iJAYAkNgc8cePzPn7c/img-12.png)

#### 磁盘输出流

任务不把输出存在内存里——它们写到磁盘文件，框架按偏移量增量读取：

```
~/.claude/task-output/
  b3k7f9x2a.output    ← local_bash 任务的完整 stdout/stderr
  ahj4m8n1p.output    ← local_agent 任务的输出
```

- `initTaskOutput(taskId)`：安全创建输出文件（`O_NOFOLLOW | O_EXCL` 防符号链接攻击）

- `getTaskOutputDelta(taskId, fromOffset)`：从偏移量读增量内容

- `evictTaskOutput(taskId)`：任务结束后清理磁盘文件

这解释了 `TaskStateBase` 里 `outputFile` 和 `outputOffset` 的用途——它们构成一个磁盘上的流式读取协议。

### 2.从零实现：持久化任务 DAG

理解了真实框架后，我们来实现一个教学版的任务图（DAG）——加入依赖关系和磁盘持久化，这是 s07–s12 的基础骨架。

#### 任务图的三个问题

1. 什么任务可以现在开始？（没有未完成的前置任务）

2. 什么任务在等待？（有未完成的前置任务）

3. 什么任务已经完成？

![](/images/UP0ZwLC36iJAYAkNgc8cePzPn7c/img-13.png)

#### 磁盘结构

每个任务是 `.tasks/` 目录下的一个 JSON 文件：

```
.tasks/
  task_001.json
  task_002.json
  task_003.json
```

```
{
"id": "task_002",
"title": "重构 auth.py",
"description": "提取 JWT 验证逻辑到独立函数",
"status": "ready","blockedBy": ["task_001"],
"blocks": ["task_004"],
"created_at": "2025-01-01T10:00:00",
"completed_at": null
}
```

`blockedBy`：这个任务需要等哪些任务先完成。 `blocks`：这个任务完成后，会解锁哪些任务。

#### TaskManager 实现

```
import json, uuid
from pathlib import Path
from datetime import datetime
from typing import Literal

TASKS_DIR = Path(".tasks")
TASKS_DIR.mkdir(exist_ok=True)

Status = Literal["pending", "ready", "in_progress", "completed", "failed"]

class TaskManager:
    def create(self, title: str, description: str = "",
               blocked_by: list[str] = None) -> str:
        task_id = f"task_{uuid.uuid4().hex[:6]}"
        status = "pending" if blocked_by else "ready"
        task = {
            "id": task_id,
            "title": title,
            "description": description,
            "status": status,
            "blockedBy": blocked_by or [],
            "blocks": [],
            "created_at": datetime.now().isoformat(),
            "completed_at": None,
        }
        # 把这个任务注册到前置任务的 blocks 列表
        for dep_id in (blocked_by or []):
            self._add_block(dep_id, task_id)
        self._save(task)
        return task_id

    def complete(self, task_id: str) -> str:
        task = self._load(task_id)
        if not task:
            return f"Task {task_id} not found"
        task["status"] = "completed"
        task["completed_at"] = datetime.now().isoformat()
        self._save(task)
        # 检查并解锁下游任务
        unlocked = self._unlock_downstream(task_id)
        msg = f"Completed: {task_id}"
        if unlocked:
            msg += f"\nUnlocked: {', '.join(unlocked)}"return msg

    def _unlock_downstream(self, completed_id: str) -> list[str]:
        """检查所有被 completed_id 阻塞的任务，看是否可以解锁"""
        unlocked = []
        for path in TASKS_DIR.glob("*.json"):
            task = json.loads(path.read_text())
            if completed_id in task.get("blockedBy", []):
                # 检查所有前置任务是否都已完成
                all_done = all(
                    self._get_status(dep) == "completed"for dep in task["blockedBy"]
                )
                if all_done:
                    task["status"] = "ready"
                    self._save(task)
                    unlocked.append(task["id"])
        return unlocked

    def list_ready(self) -> list[dict]:
        return [t for t in self._all() if t["status"] == "ready"]

    def list_all(self) -> str:
        tasks = self._all()
        if not tasks:
            return "No tasks."
        lines = []
        for t in tasks:
            icon = {"ready": "○", "in_progress": "◐", "completed": "●",
                    "pending": "⏸", "failed": "✗"}.get(t["status"], "?")
            dep = f" [blocked by: {', '.join(t['blockedBy'])}]" if t["blockedBy"] and t["status"] == "pending" else ""
            lines.append(f"{icon} {t['id']}: {t['title']}{dep}")
        return "\n".join(lines)

    def _save(self, task: dict):
        (TASKS_DIR / f"{task['id']}.json").write_text(json.dumps(task, indent=2))

    def _load(self, task_id: str) -> dict | None:
        path = TASKS_DIR / f"{task_id}.json"return json.loads(path.read_text()) if path.exists() else Nonedef _get_status(self, task_id: str) -> str:
        task = self._load(task_id)
        return task["status"] if task else "not_found"def _all(self) -> list[dict]:
        return [json.loads(p.read_text()) for p in sorted(TASKS_DIR.glob("*.json"))]

    def _add_block(self, task_id: str, blocked_task_id: str):
        task = self._load(task_id)
        if task and blocked_task_id not in task["blocks"]:
            task["blocks"].append(blocked_task_id)
            self._save(task)
```

#### 工具接口

```
task_manager = TaskManager()

def run_task_tool(action: str, **kwargs) -> str:
    if action == "create":
        return task_manager.create(
            title=kwargs["title"],
            description=kwargs.get("description", ""),
            blocked_by=kwargs.get("blocked_by", [])
        )
    elif action == "complete":
        return task_manager.complete(kwargs["task_id"])
    elif action == "list":
        return task_manager.list_all()
    elif action == "list_ready":
        ready = task_manager.list_ready()
        return "\n".join(f"- {t['id']}: {t['title']}" for t in ready) or "No ready tasks."
    return f"Unknown action: {action}"
```

#### DAG 执行流程

![](/images/UP0ZwLC36iJAYAkNgc8cePzPn7c/img-14.png)

### 3.真实框架 vs 从零实现

核心洞察：Claude Code 的任务没有 DAG 依赖——它让模型自行决定执行顺序。框架只负责注册、状态更新、输出流、驱逐。这是一种“模型即调度器”的设计哲学。

### 4.设计哲学：从同步助手到异步协作者

设计指南将任务系统视为 Agent 进化的关键转折点：

> 后台任务是 Agent 从“同步助手”进化为“异步协作者”的关键。

早期 AI 助手是完全同步的——用户问，AI 答，用户等待。任务系统打破了这个限制，让 Agent 能够：

1. 并行执行多个长时间任务

2. 不阻塞用户继续其他工作

3. 持久化进度，崩溃后可恢复

源码中“模型即调度器”的设计选择也值得深思：Claude Code 的任务系统没有 DAG 依赖，它让模型自行决定执行顺序。框架只负责注册、状态更新、输出流、驱逐。这体现了设计指南的第三原则——单一职责，组合完成复杂任务：框架管生命周期，模型管调度逻辑，各司其职。

另一个设计亮点是可观察性是一等公民。任务 ID 的类型前缀（`b` = bash, `a` = agent, `d` = dream）让运维人员一眼就能区分任务类型。输出持久化到磁盘文件 + 偏移量增量读取，既支持实时追踪又不占用内存。这些不是事后添加的功能，而是从设计之初就内置的。

### 5.为什么比 TodoManager 更好

## 8.Background Tasks：非阻塞工具执行

如果直接在 Agent 循环里同步等待，模型什么都干不了，用户体验糟糕，而且浪费时间。

这一节实现后台任务：启动慢命令，Agent 循环继续，完成时通知结果。

### 1.问题

```
# 同步执行：卡住整个循环，等待 3 分钟output = run_bash("npm install && npm run build")
# 3 分钟后才能继续...
```

Agent 被迫等待，什么都干不了。

### 2.源码实证：Claude Code 的 6 种后台任务

Claude Code 不只能后台跑 shell 命令。它的 `src/tasks/` 目录下有 6 种任务类型，覆盖了从 bash 到自动记忆的全部后台场景：

所有任务共享同一个注册和生命周期框架：`registerTask()` + `updateTaskState()` + `enqueuePendingNotification()`。

### 3.源码实证：LocalShellTask 的完整生命周期

`LocalShellTask` 是最核心的后台任务。它管理后台 shell 进程，追踪输出，发送完成通知。

#### 状态结构

源码 `guards.ts` 定义了任务状态：

```
// src/tasks/LocalShellTask/guards.ts
export type LocalShellTaskState = TaskStateBase & {
  type: 'local_bash'command: string
  result?: {
    code: number         // 进程退出码
    interrupted: boolean // 是否被中断
  }
  shellCommand: ShellCommand | null
  isBackgrounded: boolean   // false=前台运行, true=已放入后台
  agentId?: AgentId         // 哪个 agent 启动的，用于孤儿清理
  kind?: 'bash' | 'monitor' // UI 显示变体
}
```

关键点：`isBackgrounded` 区分前台和后台。一个命令可以先在前台运行，跑久了再切到后台。

#### 启动流程

```
// src/tasks/LocalShellTask/LocalShellTask.tsx (简化)
export async function spawnShellTask(input, context): Promise<TaskHandle> {
  const { command, description, shellCommand, toolUseId, agentId } = input
  const taskId = shellCommand.taskOutput.taskId
  
  // 1. 注册清理回调（进程退出时自动 kill）
  const unregisterCleanup = registerCleanup(async () => {
    killTask(taskId, setAppState)
  })

  // 2. 创建任务状态，注册到全局 tasks 表
  const taskState: LocalShellTaskState = {
    ...createTaskStateBase(taskId, 'local_bash', description, toolUseId),
    type: 'local_bash',
    status: 'running',
    command,
    shellCommand,
    isBackgrounded: true,
    agentId,
  }
  registerTask(taskState, setAppState)

  // 3. 切换到后台模式——TaskOutput 自动持续接收数据
  shellCommand.background(taskId)

  // 4. 启动 Stall Watchdog（检测交互式卡住）
  const cancelStallWatchdog = startStallWatchdog(taskId, description, ...)

  // 5. 等待结果，完成时更新状态并发送通知
  void shellCommand.result.then(async result => {
    cancelStallWatchdog()
    await flushAndCleanup(shellCommand)
    updateTaskState(taskId, setAppState, task => ({
      ...task,
      status: result.code === 0 ? 'completed' : 'failed',
      result: { code: result.code, interrupted: result.interrupted },
      shellCommand: null,
      endTime: Date.now(),
    }))
    enqueueShellNotification(taskId, description, status, result.code, ...)
    void evictTaskOutput(taskId)
  })

  return { taskId, cleanup: () => unregisterCleanup() }
}
```

#### Stall Watchdog：检测交互式阻塞

Claude Code 有个精妙的机制——当后台命令停止输出 45 秒，且输出尾部看起来像交互式提示符时，主动通知模型：

```
// 每 5 秒检查一次
const STALL_CHECK_INTERVAL_MS = 5_000const STALL_THRESHOLD_MS = 45_000
// 匹配的模式：(y/n)、Continue?、Press Enter 等

const PROMPT_PATTERNS = [
  /\(y\/n\)/i,
  /\(yes\/no\)/i,
  /Continue\?/i,
  /Press (any key|Enter)/i,
  /Overwrite\?/i,
]
```

watchdog 通过 `fs.stat()` 监控输出文件大小变化。文件大小不增长 + 尾部匹配 prompt 模式 = 发出通知，告诉模型 “这个命令可能卡在交互提示上，kill 掉重试吧”。

#### 通知格式

完成通知以 XML 格式注入到消息流：

```
<task-notification>
<task-id>bash_abc123</task-id>
<tool-use-id>toolu_xyz</tool-use-id>
<output-file>/tmp/.../tasks/bash_abc123.output</output-file>
<status>completed</status>
<summary>Background command "npm install" completed (exit code 0)</summary>
</task-notification>
```

通知通过 `enqueuePendingNotification()` 放入队列，在下一轮 LLM 调用前注入到对话中。

#### Kill 与孤儿清理

`killShellTasks.ts` 处理两种场景：

```
// 1. 手动 kill 单个任务
export function killTask(taskId, setAppState): void {
  updateTaskState(taskId, setAppState, task => {
    task.shellCommand?.kill()
    task.shellCommand?.cleanup()
    task.unregisterCleanup?.()
    return { ...task, status: 'killed', notified: true, shellCommand: null }
  })
  void evictTaskOutput(taskId)
}

// 2. Agent 退出时清理所有它启动的 shell 任务（防止僵尸进程）
export function killShellTasksForAgent(agentId, getAppState, setAppState): void {
  const tasks = getAppState().tasks ?? {}
  for (const [taskId, task] of Object.entries(tasks)) {
    if (isLocalShellTask(task) && task.agentId === agentId && task.status === 'running') {
      killTask(taskId, setAppState)
    }
  }
  // 清除该 agent 的待处理通知
  dequeueAllMatching(cmd => cmd.agentId === agentId)
}
```

`killShellTasksForAgent` 是关键——没有它，子 Agent 退出后启动的 `npm run dev` 会变成僵尸进程，跑到天荒地老。

### 4.源码实证：Ctrl+B 放入后台与前后台切换

Claude Code 支持一个命令从前台无缝切换到后台。流程分三步：

![](/images/UP0ZwLC36iJAYAkNgc8cePzPn7c/img-15.png)

`backgroundAll()` 在用户按 Ctrl+B 时，同时处理所有前台的 bash 任务和 agent 任务：

```
export function backgroundAll(getAppState, setAppState): void {
  // 后台化所有前台 bash 任务
  for (const taskId of foregroundBashTaskIds) {
    backgroundTask(taskId, getAppState, setAppState)
  }
  // 后台化所有前台 agent 任务
  for (const taskId of foregroundAgentTaskIds) {
    backgroundAgentTask(taskId, getAppState, setAppState)
  }
}
```

---

### 5.源码实证：DreamTask 自动记忆整合

`DreamTask` 是一种特殊的后台任务——不执行用户命令，而是自动整理对话记忆。它的状态结构很独特：

```
// src/tasks/DreamTask/DreamTask.ts
export type DreamTaskState = TaskStateBase & {
  type: 'dream'
  phase: 'starting' | 'updating'  // starting→reading sessions, updating→writing CLAUDE.md
  sessionsReviewing: number       // 正在复习多少个 session
  filesTouched: string[]          // 修改了哪些文件（不完全，仅工具调用可见的）
  turns: DreamTurn[]              // 最多保留 30 轮助手文本
  abortController?: AbortController
  priorMtime: number              // 用于 kill 时回滚 consolidation lock
}
```

DreamTask 的特殊之处：

1. 没有模型通知——完成后不发 `<task-notification>`，因为它是纯 UI 层面的展示

2. phase 检测简单——不解析 dream prompt 的 4 阶段结构，只看是否有 Edit/Write 调用来切换 phase

3. kill 时回滚 lock——用户中止 dream 后，回滚 consolidation lock 的 mtime，让下次 session 可以重试

```
export const DreamTask: Task = {
  name: 'DreamTask',
  type: 'dream',
  async kill(taskId, setAppState) {
    let priorMtime: number | undefined
    updateTaskState<DreamTaskState>(taskId, setAppState, task => {
      if (task.status !== 'running') return task
      task.abortController?.abort()
      priorMtime = task.priorMtimereturn { ...task, status: 'killed', notified: true }
    })
    // 回滚 lock，让下次 session 可以重新 dream
    if (priorMtime !== undefined) {
      await rollbackConsolidationLock(priorMtime)
    }
  },
}
```

---

### 6.源码实证：LocalMainSessionTask 主会话后台化

当用户按两次 Ctrl+B，当前对话本身会被放入后台。这是最“重量级”的后台任务——整个 query 循环在后台继续：

```
// src/tasks/LocalMainSessionTask.ts
export function registerMainSessionTask(
  description: string,
  setAppState: SetAppState,
  mainThreadAgentDefinition?: AgentDefinition,
  existingAbortController?: AbortController,
): { taskId: string; abortSignal: AbortSignal } {
  // ID 用 's' 前缀，区分于 agent 任务的 'a' 前缀
  const taskId = generateMainSessionTaskId()  // 例如 "s7k2m9x1"
  
  // 输出指向独立的 transcript 文件（不能写主 session 文件，否则 /clear 后会损坏）
  void initTaskOutputAsSymlink(
    taskId,
    getAgentTranscriptPath(asAgentId(taskId)),
  )

  const taskState: LocalMainSessionTaskState = {
    ...createTaskStateBase(taskId, 'local_agent', description),
    type: 'local_agent',
    agentType: 'main-session',  // 标识这是主会话，不是子 agent
    status: 'running',
    isBackgrounded: true,
  }
  registerTask(taskState, setAppState)

  return { taskId, abortSignal: abortController.signal }
}
```

`startBackgroundSession()` 则是完整的后台 query 运行器：它克隆当前消息列表，在后台 `for await` 一个新的 `query()` 调用，实时更新 progress（toolUseCount、tokenCount、recentActivities），并逐条写入独立的 sidechain transcript。

### 7.源码实证：输出流与面板驱逐

#### TaskOutput 磁盘流

所有后台任务的输出都通过 `TaskOutput` 写入磁盘文件。TaskOutput 支持两种模式：

- 文件直写模式（shell 任务）：stdout 直接写入文件 fd，不经过 JS

- 管道模式（hooks）：通过 `writeStdout()`/`writeStderr()` 缓冲后写入

读取端通过 `getTaskOutputDelta(taskId, fromOffset)` 增量读取，只从偏移量开始读，不加载整个文件。

#### PANEL_GRACE_MS 面板驱逐

```
// src/utils/task/framework.tsexport const PANEL_GRACE_MS = 30_000  // 30 秒
```

任务完成后，在状态栏 pill 和 Shift+Down 面板中保留 30 秒，然后驱逐。这给用户足够时间看到完成状态，又不会让面板堆满历史任务。

#### AgentProgress 追踪

`LocalAgentTask` 追踪子 Agent 的进度，用于 UI 展示：

```
export type AgentProgress = {
  toolUseCount: number         // 工具调用次数
  tokenCount: number           // token 消耗量
  lastActivity?: ToolActivity  // 最近一次工具调用
  recentActivities?: ToolActivity[]  // 最近 5 次活动
}
```

token 计数有个细节：API 的 `input_tokens` 是每轮累计的（包含所有历史 context），所以只取最新值；`output_tokens` 是每轮独立的，需要累加。

### 8.解决方案

理解了 Claude Code 的架构，我们来看核心设计模式：

![](/images/UP0ZwLC36iJAYAkNgc8cePzPn7c/img-16.png)

关键设计：主线程始终单线程，只有子进程 I/O 是并行的。

### 9.从零实现：BackgroundManager

```
import threading, subprocess, queue, time, uuid
from dataclasses import dataclass

@dataclassclass BackgroundJob:
    job_id: str
    command: str
    status: str = "running"   # running | completed | failed
    output: str = ""
    started_at: float = 0.0
    completed_at: float = 0.0class BackgroundManager:
    def __init__(self):
        self.jobs: dict[str, BackgroundJob] = {}
        self.notifications: queue.Queue = queue.Queue()

    def run(self, command: str) -> str:
        """启动后台命令，立即返回 job_id"""
        job_id = f"job_{uuid.uuid4().hex[:6]}"
        job = BackgroundJob(
            job_id=job_id,
            command=command,
            started_at=time.time()
        )
        self.jobs[job_id] = job

        # 守护线程执行子进程
        thread = threading.Thread(
            target=self._execute,
            args=(job,),
            daemon=True  # 主进程退出时自动清理
        )
        thread.start()
        return f"Started background job: {job_id}\nCommand: {command}"
        
    def _execute(self, job: BackgroundJob):
        try:
            result = subprocess.run(
                job.command, shell=True,
                capture_output=True, text=True, timeout=600
            )
            job.output = (result.stdout + result.stderr)[:50000]
            job.status = "completed" if result.returncode == 0 else "failed"
        except subprocess.TimeoutExpired:
            job.output = "Timeout after 600 seconds"
            job.status = "failed"
        except Exception as e:
            job.output = str(e)
            job.status = "failed"

        job.completed_at = time.time()
        # 完成时放入通知队列
        self.notifications.put({
            "job_id": job.job_id,
            "status": job.status,
            "output": job.output,
            "duration": f"{job.completed_at - job.started_at:.1f}s"
        })

    def check(self, job_id: str) -> str:
        """查询特定任务状态"""
        job = self.jobs.get(job_id)
        if not job:
            return f"Job {job_id} not found"
        elapsed = time.time() - job.started_at
        if job.status == "running":
            return f"Job {job_id}: still running ({elapsed:.1f}s elapsed)"
        return f"Job {job_id}: {job.status}\nOutput:\n{job.output}"
        
    def drain_notifications(self) -> list[dict]:
        """取出所有待处理的完成通知（每次 LLM 调用前调用）"""
        notifications = []
        while not self.notifications.empty():
            try:
                notifications.append(self.notifications.get_nowait())
            except queue.Empty:
                breakreturn notifications
```

### 10.从零实现：集成到 Agent 循环

```
bg_manager = BackgroundManager()

TOOL_HANDLERS["background_run"] = lambda **kw: bg_manager.run(kw["command"])
TOOL_HANDLERS["check"] = lambda **kw: bg_manager.check(kw["job_id"])

def agent_loop(messages: list):
    while True:
        # 每次 LLM 调用前：把后台任务完成通知注入消息
        notifications = bg_manager.drain_notifications()
        if notifications:
            notice_text = "\n".join(
                f"[Background job completed]\n"
                f"job_id: {n['job_id']}\n"
                f"status: {n['status']}\n"
                f"duration: {n['duration']}\n"
                f"output: {n['output'][:1000]}"
                for n in notifications
            )
            messages.append({"role": "user", "content": notice_text})

        response = client.messages.create(...)
        # ... 正常循环 ...
```

通知以普通 user 消息注入，模型可以看到后台任务的结果并继续推理。

### 11.从零实现：工具 Schema

```
{
    "name": "background_run",
    "description": "在后台运行慢命令，立即返回 job_id。适合 npm install、pytest、docker build 等耗时操作。",
    "input_schema": {
        "type": "object",
        "properties": {
            "command": {"type": "string", "description": "要在后台执行的 shell 命令"}
        },
        "required": ["command"]
    }
},
{
    "name": "check",
    "description": "查询后台任务状态",
    "input_schema": {
        "type": "object",
        "properties": {
            "job_id": {"type": "string", "description": "background_run 返回的 job_id"}
        },
        "required": ["job_id"]
    }
}
```
