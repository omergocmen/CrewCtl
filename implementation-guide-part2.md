# Implementation Guide Part 2: Dashboard UI Completion

**Continued from Part 1**

---

## Priority 2: Visual Agent Dashboard (Continued)

### Step 1: Terminal UI Framework (Continued)

```typescript
      style: {
        border: { fg: 'yellow' }
      }
    });
    
    this.screen.append(this.statusBox);
    this.screen.append(this.historyBox);
    this.screen.append(this.logBox);
  }
  
  private setupKeyBindings() {
    // Quit on Escape, q, or Ctrl-C
    this.screen.key(['escape', 'q', 'C-c'], () => {
      return process.exit(0);
    });
    
    // Refresh on r
    this.screen.key(['r'], () => {
      this.refresh();
    });
  }
  
  updateStatus(agents: AgentStatus[]) {
    const activeCount = agents.filter(a => a.state === 'running').length;
    const totalRuns = agents.reduce((sum, a) => sum + a.runCount, 0);
    const totalCost = agents.reduce((sum, a) => sum + a.cost, 0);
    
    const statusText = 
      `Active Agents: ${activeCount} | ` +
      `Total Runs Today: ${totalRuns} | ` +
      `Cost: $${totalCost.toFixed(2)}`;
    
    this.statusBox.setContent(statusText);
    this.screen.render();
  }
  
  addRun(run: AgentRun) {
    const icon = run.status === 'success' ? '✓' : 
                 run.status === 'failed' ? '✗' : '○';
    const color = run.status === 'success' ? '{green-fg}' : 
                  run.status === 'failed' ? '{red-fg}' : '{yellow-fg}';
    
    const line = 
      `${color}${icon}{/} ${run.agent} | ` +
      `${run.duration} | ` +
      `$${run.cost.toFixed(2)} | ` +
      `${run.filesChanged} files`;
    
    this.historyBox.pushLine(line);
    this.screen.render();
  }
  
  log(message: string) {
    this.logBox.log(message);
    this.screen.render();
  }
}
```

### Step 2: Agent State Management

```typescript
// src/dashboard/agent-monitor.ts
interface AgentStatus {
  name: string;
  state: 'idle' | 'running' | 'queued' | 'failed';
  currentTask?: string;
  startTime?: Date;
  runCount: number;
  cost: number;
}

interface AgentRun {
  id: string;
  agent: string;
  task: string;
  status: 'running' | 'success' | 'failed';
  duration: string;
  cost: number;
  filesChanged: number;
  timestamp: Date;
}

class AgentMonitor {
  private agents = new Map<string, AgentStatus>();
  private runs: AgentRun[] = [];
  private ui: DashboardUI;
  
  constructor() {
    this.ui = new DashboardUI();
  }
  
  registerAgent(name: string) {
    this.agents.set(name, {
      name,
      state: 'idle',
      runCount: 0,
      cost: 0
    });
    this.updateDisplay();
  }
  
  startRun(agent: string, task: string): string {
    const runId = `${agent}-${Date.now()}`;
    const status = this.agents.get(agent);
    
    if (status) {
      status.state = 'running';
      status.currentTask = task;
      status.startTime = new Date();
    }
    
    this.runs.push({
      id: runId,
      agent,
      task,
      status: 'running',
      duration: '0s',
      cost: 0,
      filesChanged: 0,
      timestamp: new Date()
    });
    
    this.ui.log(`[${agent}] Started: ${task}`);
    this.updateDisplay();
    
    return runId;
  }
  
  completeRun(runId: string, result: {
    status: 'success' | 'failed';
    cost: number;
    filesChanged: number;
  }) {
    const run = this.runs.find(r => r.id === runId);
    if (!run) return;
    
    run.status = result.status;
    run.cost = result.cost;
    run.filesChanged = result.filesChanged;
    
    const duration = Date.now() - run.timestamp.getTime();
    run.duration = this.formatDuration(duration);
    
    const status = this.agents.get(run.agent);
    if (status) {
      status.state = 'idle';
      status.currentTask = undefined;
      status.runCount++;
      status.cost += result.cost;
    }
    
    this.ui.addRun(run);
    this.ui.log(
      `[${run.agent}] ${result.status === 'success' ? 'Completed' : 'Failed'}: ${run.task}`
    );
    this.updateDisplay();
  }
  
  private updateDisplay() {
    const agentStatuses = Array.from(this.agents.values());
    this.ui.updateStatus(agentStatuses);
  }
  
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
}
```

### Step 3: Integration with CrewCtl

```typescript
// src/crew.ts - Integration example
import { AgentMonitor } from './dashboard/agent-monitor';

class Crew {
  private monitor?: AgentMonitor;
  
  async run(task: string, options: { dashboard?: boolean } = {}) {
    if (options.dashboard) {
      this.monitor = new AgentMonitor();
      
      // Register all agents
      for (const agent of this.agents) {
        this.monitor.registerAgent(agent.name);
      }
    }
    
    // Execute tasks
    for (const agent of this.agents) {
      const runId = this.monitor?.startRun(agent.name, task);
      
      try {
        const result = await agent.execute(task);
        
        this.monitor?.completeRun(runId!, {
          status: 'success',
          cost: result.cost,
          filesChanged: result.filesChanged
        });
      } catch (error) {
        this.monitor?.completeRun(runId!, {
          status: 'failed',
          cost: 0,
          filesChanged: 0
        });
      }
    }
  }
}
```

### Usage

```bash
# Enable dashboard
crewctl run "Add authentication" --dashboard

# Or set as default
crewctl config set dashboard.enabled true
```

---

## Priority 3: Local LLM Support

### Why This Matters
- Privacy: No data sent to external APIs
- Cost: Free inference on own hardware
- Offline: Works without internet
- Speed: Can be faster with good GPU

### Architecture

```
LLM Provider Interface
├── OpenAI Provider
├── Anthropic Provider
├── Ollama Provider (local)
├── LM Studio Provider (local)
└── vLLM Provider (local)
```

### Implementation Plan

#### Step 1: Provider Interface

```typescript
// src/llm/provider.ts
interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost: number;
}

interface LLMProvider {
  name: string;
  generate(messages: LLMMessage[], options?: GenerateOptions): Promise<LLMResponse>;
  isAvailable(): Promise<boolean>;
}

interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  stopSequences?: string[];
}
```

#### Step 2: Ollama Provider

```typescript
// src/llm/providers/ollama.ts
class OllamaProvider implements LLMProvider {
  name = 'ollama';
  
  constructor(
    private baseUrl = 'http://localhost:11434',
    private model = 'deepseek-r1:8b'
  ) {}
  
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }
  
  async generate(messages: LLMMessage[], options: GenerateOptions = {}): Promise<LLMResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.7,
        stream: false,
        options: {
          num_predict: options.maxTokens,
          stop: options.stopSequences
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    return {
      content: data.message.content,
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
      },
      cost: 0 // Local models are free
    };
  }
}
```

