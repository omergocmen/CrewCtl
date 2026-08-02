# Implementation Guide: Priority Features for CrewCtl

**Date:** July 21, 2026  
**Purpose:** Actionable development guide for competitive features

---

## Overview

This guide provides implementation details for the top 5 priority features identified in the competitive analysis. Each feature includes architecture, API design, and code examples.

---

## Priority 1: Repository Mapping & Code Understanding

### Why This Matters
- Aider and Cursor both have this
- Essential for agents to work with existing codebases
- Enables context-aware code generation
- Dramatically improves agent accuracy

### Architecture

```
Repository Mapper
├── File Scanner (detect project structure)
├── Dependency Analyzer (parse imports/requires)
├── Semantic Indexer (build searchable index)
└── Context Provider (supply relevant files to agents)
```

### Implementation Plan

#### Step 1: File Scanner
```typescript
// src/repo-mapper/scanner.ts
interface ProjectStructure {
  rootDir: string;
  language: string;
  framework?: string;
  entryPoints: string[];
  testFiles: string[];
  configFiles: string[];
}

class FileScanner {
  async scan(rootDir: string): Promise<ProjectStructure> {
    // Detect language from files
    const language = await this.detectLanguage(rootDir);
    
    // Find framework (React, Django, etc.)
    const framework = await this.detectFramework(rootDir);
    
    // Identify key files
    const entryPoints = await this.findEntryPoints(rootDir);
    const testFiles = await this.findTestFiles(rootDir);
    const configFiles = await this.findConfigFiles(rootDir);
    
    return {
      rootDir,
      language,
      framework,
      entryPoints,
      testFiles,
      configFiles
    };
  }
  
  private async detectLanguage(rootDir: string): Promise<string> {
    const files = await glob('**/*', { cwd: rootDir });
    const extensions = files.map(f => path.extname(f));
    
    // Count by extension
    const counts = extensions.reduce((acc, ext) => {
      acc[ext] = (acc[ext] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Map to language
    const langMap: Record<string, string> = {
      '.ts': 'typescript',
      '.js': 'javascript',
      '.py': 'python',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java'
    };
    
    const dominant = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])[0][0];
    
    return langMap[dominant] || 'unknown';
  }
}
```

#### Step 2: Dependency Analyzer
```typescript
// src/repo-mapper/dependency-analyzer.ts
interface DependencyGraph {
  nodes: Map<string, FileNode>;
  edges: Array<{ from: string; to: string }>;
}

interface FileNode {
  path: string;
  imports: string[];
  exports: string[];
  functions: string[];
  classes: string[];
}

class DependencyAnalyzer {
  async analyze(files: string[]): Promise<DependencyGraph> {
    const nodes = new Map<string, FileNode>();
    const edges: Array<{ from: string; to: string }> = [];
    
    for (const file of files) {
      const node = await this.parseFile(file);
      nodes.set(file, node);
      
      // Create edges from imports
      for (const imp of node.imports) {
        edges.push({ from: file, to: imp });
      }
    }
    
    return { nodes, edges };
  }
  
  private async parseFile(filePath: string): Promise<FileNode> {
    const content = await fs.readFile(filePath, 'utf-8');
    const language = this.detectLanguage(filePath);
    
    // Use tree-sitter for parsing
    const parser = this.getParser(language);
    const tree = parser.parse(content);
    
    return {
      path: filePath,
      imports: this.extractImports(tree),
      exports: this.extractExports(tree),
      functions: this.extractFunctions(tree),
      classes: this.extractClasses(tree)
    };
  }
}
```

#### Step 3: Semantic Indexer
```typescript
// src/repo-mapper/semantic-indexer.ts
interface SemanticIndex {
  files: Map<string, FileEmbedding>;
  search(query: string, limit?: number): Promise<SearchResult[]>;
}

interface FileEmbedding {
  path: string;
  content: string;
  embedding: number[];
  symbols: Symbol[];
}

interface Symbol {
  name: string;
  type: 'function' | 'class' | 'variable';
  line: number;
  docstring?: string;
}

class SemanticIndexer {
  private embeddings = new Map<string, FileEmbedding>();
  
  async buildIndex(files: string[]): Promise<void> {
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      const symbols = await this.extractSymbols(file);
      
      // Generate embedding using local model or API
      const embedding = await this.generateEmbedding(content);
      
      this.embeddings.set(file, {
        path: file,
        content,
        embedding,
        symbols
      });
    }
  }
  
  async search(query: string, limit = 5): Promise<SearchResult[]> {
    const queryEmbedding = await this.generateEmbedding(query);
    
    // Calculate cosine similarity
    const results = Array.from(this.embeddings.values())
      .map(file => ({
        file: file.path,
        score: this.cosineSimilarity(queryEmbedding, file.embedding),
        symbols: file.symbols
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    
    return results;
  }
}
```

### Usage Example
```typescript
// Agent uses repo mapper
const mapper = new RepositoryMapper();
await mapper.initialize('./project-root');

// Agent task: "Add authentication"
const context = await mapper.getRelevantContext(
  "authentication user login password"
);

// Returns: ['src/auth/login.ts', 'src/models/user.ts', 'src/middleware/auth.ts']
const agent = new Agent({
  name: 'Developer',
  context: context.files
});
```

---

## Priority 2: Visual Agent Dashboard

### Why This Matters
- Cursor's dashboard is a killer feature
- Users need visibility without reading logs
- Shows status, costs, metrics at a glance
- Makes debugging much easier

### Architecture

```
Dashboard
├── Status Monitor (real-time agent state)
├── Execution Viewer (run history)
├── Cost Tracker (token usage, API costs)
└── Output Previewer (file changes)
```

### Implementation Plan

#### Step 1: Terminal UI Framework
```typescript
// src/dashboard/terminal-ui.ts
import blessed from 'blessed';

class DashboardUI {
  private screen: blessed.Widgets.Screen;
  private statusBox: blessed.Widgets.BoxElement;
  private historyBox: blessed.Widgets.BoxElement;
  private logBox: blessed.Widgets.BoxElement;
  
  constructor() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'CrewCtl Dashboard'
    });
    
    this.initializeLayout();
    this.setupKeyBindings();
  }
  
  private initializeLayout() {
    // Top status bar
    this.statusBox = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' }
      }
    });
    
    // Middle: execution history
    this.historyBox = blessed.box({
      top: 3,
      left: 0,
      width: '100%',
      height: '50%-3',
      border: { type: 'line' },
      label: ' Recent Runs ',
      scrollable: true,
      style: {
        border: { fg: 'green' }
      }
    });
    
    // Bottom: live logs
    this.logBox = blessed.log({
      top: '50%',
      left: 0,
      width: '100%',
      height: '50%',
      border: { type: 'line' },
      label: ' Live Logs ',
      scrollable: true,
```

