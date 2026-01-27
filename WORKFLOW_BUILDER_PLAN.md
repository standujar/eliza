# AI Workflow Builder — Architecture Plan for ElizaOS

> Research & proposal by Stan (@177801706963337216)
> Based on: Clawdbot deep-dive, ElizaOS runtime analysis, plugin-n8n (v2.0.0), team discussions (#cloud, #core-devs)

---

## Table of Contents

- [1. Context & Motivation](#1-context--motivation)
- [2. Clawdbot Research — Key Takeaways](#2-clawdbot-research--key-takeaways)
- [3. ElizaOS Runtime — How It Already Works](#3-elizaos-runtime--how-it-already-works)
- [4. The Problem We're Solving](#4-the-problem-were-solving)
- [5. Architecture — 3 Layers](#5-architecture--3-layers)
- [6. Layer 1: OAuth Gateway](#6-layer-1-oauth-gateway)
- [7. Layer 2: Workflow Engine](#7-layer-2-workflow-engine)
- [8. Layer 3: AI Workflow Generator](#8-layer-3-ai-workflow-generator)
- [9. Prefab Workflows](#9-prefab-workflows)
- [10. Email & Calendar — Full Flow Examples](#10-email--calendar--full-flow-examples)
- [11. Development Phases](#11-development-phases)
- [12. Summary](#12-summary)

---

## 1. Context & Motivation

### Team Objective

Integrate calendar, email, and OAuth into ElizaOS so that adding new services (Google, Microsoft, GitHub, etc.) is straightforward — especially with Claude, sandboxes, and multi-tenant per-user credentials.

### Key Team Insights

From **#cloud**:
> *"The biggest single feature of cloud that regular devs would use running agents is OAuth handling."*
> — Existing cloud infra can be kept specifically for OAuth while moving away from full cloud apps.

From **#core-devs**:
> *"95% of what people want is an AI workflow builder."*
> — Expose Actions and Providers as composable graph nodes. Offer prefab workflows for email, calendar, etc. Let AI generate custom workflows from natural language descriptions.

### Why a Workflow Builder?

Users don't want to write plugins for *"check my email every morning and send me a summary."* They want to describe what they need in plain English and have it work. The workflow builder bridges the gap between raw plugin development and end-user simplicity.

---

## 2. Clawdbot Research — Key Takeaways

### How Clawdbot Works

| Component | How It Works | ElizaOS Equivalent |
|-----------|-------------|-------------------|
| **Gateway** | Local WebSocket server (`ws://127.0.0.1:18789`) routing messages to Claude | Runtime (`runtime.ts`) |
| **Skills** | `SKILL.md` files that teach Claude how to use CLI tools | Plugins (Actions + Providers) |
| **CLI Tools** | Standalone CLIs (e.g., `gogcli` for Google Workspace) | Services + Actions |
| **Sessions** | Per-session Docker sandboxes with mounted tools | Service lifecycle + sandboxes |
| **Credentials** | Per-CLI OAuth via system keyring | `character.secrets` / Entity components |

### How Clawdbot Does Email

Clawdbot does **NOT** use MCP for email. It uses `gogcli` (Google Workspace CLI):

```
SKILL.md teaches Claude:
  "To search emails, run: gog gmail search --query 'is:unread'"
  "To send email, run: gog gmail send --to user@example.com --subject '...' --body '...'"
  "To read email, run: gog gmail get --id <messageId>"
```

- OAuth is handled by `gogcli` itself (keyring-based token storage)
- Claude executes shell commands in a sandboxed session
- Each tool (gog, browser, filesystem) is an independent CLI

### What We Can Learn

1. **Separation of concerns**: Auth is handled by the tool, not the AI framework
2. **Declarative skill files**: Simple text instructions > complex API wrappers
3. **Sandboxed execution**: Each session gets its own isolated environment
4. **Multi-tool sessions**: Multiple CLIs/services coexist in one sandbox

### What We Can Improve

1. **No workflow automation** — Clawdbot is purely reactive (user asks, Claude does)
2. **Single-user** — No multi-tenant credential management
3. **Local only** — No serverless/cloud deployment story
4. **No composability** — Skills can't chain together automatically

---

## 3. ElizaOS Runtime — How It Already Works

Understanding the existing runtime is critical because the workflow builder builds directly on top of it.

### The Core Loop

```
Message Received
    │
    ▼
composeState()
    │  Runs all Providers in parallel
    │  Each Provider returns { values, data, text }
    │  Results aggregated into State object
    │
    ▼
Prompt Template (Handlebars)
    │  State injected into template
    │  {{providers}} section filled with Provider text
    │
    ▼
LLM Generation
    │  Model produces response + action directives
    │
    ▼
processActions()
    │  Matching Actions execute their handlers
    │  Handlers can call Services, APIs, etc.
    │
    ▼
Response saved to Memory
```

### Key Components

**Providers** — Inject contextual information into the LLM prompt:
```typescript
interface Provider {
  name: string;           // e.g., "FACTS", "RECENT_MESSAGES"
  description: string;
  dynamic: boolean;       // Recalculated each turn
  position?: number;      // Sort order in prompt
  get: (runtime, message, state) => Promise<{ values, data, text }>;
}
```

**Actions** — Executable capabilities the agent can invoke:
```typescript
interface Action {
  name: string;           // e.g., "SEND_EMAIL", "CREATE_EVENT"
  description: string;
  validate: (runtime, message, state) => Promise<boolean>;
  handler: (runtime, message, state, options, callback) => Promise<void>;
}
```

**Services** — Long-lived components with start/stop lifecycle:
```typescript
interface Service {
  serviceType: string;
  start(runtime): Promise<void>;
  stop(runtime): Promise<void>;
}
// Accessed via: runtime.getService(ServiceType.TASK)
```

**TaskService** — Cron-like scheduler (already in codebase):
```typescript
class TaskService extends Service {
  private readonly TICK_INTERVAL = 1000; // Checks every 1 second
  // registerTaskWorker() — register a handler for a tag
  // createTask() — schedule with tags like ["queue", "repeat"]
  // Tasks have updateInterval for recurring execution
}
```

**Event System** — Pub/sub for runtime events:
```typescript
runtime.on("MESSAGE_RECEIVED", handler);
runtime.emit("MESSAGE_RECEIVED", data);
// Events: MESSAGE_RECEIVED, VOICE_MESSAGE_RECEIVED, REACTION_RECEIVED, etc.
```

**Entity Components** — Per-user data storage:
```typescript
// Each user (Entity) can have components attached
// Components are typed key-value stores
// Perfect for per-user OAuth metadata
```

### What Already Exists (and we reuse)

| Need | Existing System | Status |
|------|----------------|--------|
| Cron scheduling | `TaskService` | Ready |
| Event triggers | Event system (`runtime.on/emit`) | Ready |
| Executable steps | Actions | Ready |
| Context injection | Providers | Ready |
| Per-user data | Entity components | Ready |
| AI code generation | `plugin-n8n` | Ready (v2.0.0) |
| Credential storage | `character.secrets` (AES encrypted) | Needs extension |

---

## 4. The Problem We're Solving

### Current State
- No OAuth integration for third-party services (Gmail, Calendar, etc.)
- No way for each user (Entity) to connect their own accounts
- No workflow automation (if X then Y)
- No prefab integrations for common tasks (email, calendar)
- Users must write full plugins for simple automations

### Desired State
- Centralized OAuth Gateway handles all third-party auth
- Each user connects their own accounts (multi-tenant)
- Workflows chain Actions together with triggers, conditions, and transforms
- AI generates workflows from natural language descriptions
- Prefab workflows available out of the box for email, calendar, etc.

---

## 5. Architecture — 3 Layers

```
┌──────────────────────────────────────────────────────────────────┐
│                 Layer 3: AI Workflow Generator                    │
│                                                                  │
│   "Check my email every morning" ──► Workflow JSON               │
│   Extends plugin-n8n: Generate ──► Validate ──► Deploy           │
├──────────────────────────────────────────────────────────────────┤
│                 Layer 2: Workflow Engine                          │
│                                                                  │
│   WorkflowNode graph execution, branching, error handling        │
│   TaskService integration (cron) + Event system (triggers)       │
├──────────────────────────────────────────────────────────────────┤
│                 Layer 1: OAuth Gateway                            │
│                                                                  │
│   Per-Entity credential storage, token refresh, multi-tenant     │
│   Secrets Manager / encrypted DB, OAuth flows for all providers  │
└──────────────────────────────────────────────────────────────────┘
```

Each layer is independent and can be developed/deployed separately. Layer 2 depends on Layer 1 (for auth), Layer 3 depends on Layer 2 (for execution).

---

## 6. Layer 1: OAuth Gateway

### Problem

Each user (Entity) who talks to the agent needs their **own** OAuth credentials for their email, calendar, etc. We need a centralized system that:
- Initiates OAuth flows per user per service
- Stores tokens securely (per-Entity, not per-agent)
- Auto-refreshes expired tokens
- Supports multiple providers (Google, Microsoft, GitHub, etc.)

### Data Model

```typescript
// Stored in Entity components (metadata only)
interface OAuthCredentialMetadata {
  entityId: UUID;
  service: string;            // "google" | "microsoft" | "github"
  scopes: string[];           // ["gmail.readonly", "calendar.events"]
  email?: string;             // Connected account email
  accountName?: string;       // Display name
  expiresAt: number;          // Token expiry timestamp
  connectedAt: number;        // When user connected
  status: "active" | "expired" | "revoked";
}

// Stored in Secrets Manager / encrypted storage (sensitive)
interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  scope: string;
}
```

### OAuth Gateway Service

```typescript
interface IOAuthGatewayService {
  /**
   * Start OAuth flow for a user.
   * Returns a URL the user must visit to authorize.
   */
  initiateFlow(
    entityId: UUID,
    service: string,
    scopes: string[]
  ): Promise<{ authUrl: string; state: string }>;

  /**
   * Handle the OAuth callback after user authorizes.
   * Exchanges code for tokens, stores them securely.
   */
  handleCallback(
    code: string,
    state: string
  ): Promise<OAuthCredentialMetadata>;

  /**
   * Get a valid access token for a user+service.
   * Automatically refreshes if expired.
   */
  getToken(entityId: UUID, service: string): Promise<string>;

  /**
   * Check if a user has connected a specific service.
   */
  hasCredential(entityId: UUID, service: string): Promise<boolean>;

  /**
   * List all connected services for a user.
   */
  listConnections(entityId: UUID): Promise<OAuthCredentialMetadata[]>;

  /**
   * Revoke a user's access to a service.
   */
  revokeAccess(entityId: UUID, service: string): Promise<void>;
}
```

### OAuth Flow Sequence

```
User: "Connect my Gmail"
    │
    ▼
Agent calls OAuthGateway.initiateFlow(entityId, "google", ["gmail.readonly", "gmail.send"])
    │
    ▼
Gateway generates state token, builds Google OAuth URL
    │
    ▼
Agent sends auth URL to user (DM / chat)
    │
    ▼
User clicks link ──► Google consent screen ──► Authorizes
    │
    ▼
Google redirects to /oauth/callback?code=XXX&state=YYY
    │
    ▼
Gateway.handleCallback() exchanges code for tokens
    │
    ├──► Access + Refresh tokens → Secrets Manager
    ├──► Metadata (email, scopes, expiry) → Entity component
    │
    ▼
Agent confirms: "Gmail connected for user@gmail.com"
```

### Token Storage Strategy

| Data | Storage | Why |
|------|---------|-----|
| Access Token | Secrets Manager / encrypted DB | Sensitive, short-lived |
| Refresh Token | Secrets Manager / encrypted DB | Sensitive, long-lived |
| Token Metadata | Entity components | Quick lookup, non-sensitive |
| OAuth Client Config | Environment variables | Per-deployment |

### Supported Providers (Initial)

| Provider | Scopes | Use Cases |
|----------|--------|-----------|
| **Google** | Gmail, Calendar, Drive | Email, scheduling, file access |
| **Microsoft** | Outlook, Calendar, OneDrive | Email, scheduling, file access |
| **GitHub** | Repos, Issues, PRs | Dev workflow automation |

### Leveraging Existing Cloud Infra

The ElizaOS Cloud infrastructure already exists. Rather than building OAuth from scratch, we can repurpose the cloud layer specifically for OAuth:
- Cloud handles the OAuth redirect endpoints
- Cloud manages provider client credentials
- Cloud proxies token refresh requests
- Everything else (workflow execution, LLM calls) stays serverless/local

---

## 7. Layer 2: Workflow Engine

### Core Types

```typescript
/**
 * A single step in a workflow graph.
 */
interface WorkflowNode {
  id: string;
  type: "trigger" | "action" | "condition" | "transform" | "output";
  name: string;                      // Human-readable name
  plugin?: string;                   // Which plugin provides this action
  config: Record<string, any>;       // Node-specific configuration
  inputs: string[];                  // IDs of predecessor nodes
  outputs: string[];                 // IDs of successor nodes
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
  };
  timeout?: number;                  // Max execution time in ms
}

/**
 * A complete workflow definition.
 */
interface Workflow {
  id: UUID;
  name: string;
  description: string;
  entityId: UUID;                    // Owner (user who created it)
  agentId: UUID;                     // Agent that executes it
  nodes: WorkflowNode[];
  trigger: WorkflowTrigger;
  enabled: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
  lastExecutedAt?: number;
  executionCount: number;
  errorCount: number;
}

/**
 * What starts a workflow.
 */
type WorkflowTrigger =
  | { type: "cron"; schedule: string; interval?: number }   // Cron expression or interval
  | { type: "event"; eventName: string; filter?: any }      // ElizaOS event
  | { type: "webhook"; path: string; method?: string }      // HTTP endpoint
  | { type: "manual" }                                       // User-initiated
  | { type: "condition"; check: string; pollInterval: number }; // Polling condition

/**
 * Result of executing a single node.
 */
interface NodeExecutionResult {
  nodeId: string;
  status: "success" | "failure" | "skipped";
  output: any;
  duration: number;
  error?: string;
}

/**
 * Result of a full workflow execution.
 */
interface WorkflowExecutionResult {
  workflowId: UUID;
  executionId: UUID;
  status: "completed" | "failed" | "partial";
  nodeResults: NodeExecutionResult[];
  startedAt: number;
  completedAt: number;
  triggerData?: any;
}
```

### Node Types Explained

| Type | Purpose | Example |
|------|---------|---------|
| **trigger** | Starts the workflow | `cron: every 5 min`, `event: MESSAGE_RECEIVED` |
| **action** | Calls an ElizaOS Action or external API | `fetch-emails`, `send-email`, `create-calendar-event` |
| **condition** | Branches the graph based on a check | `if emails.length > 0`, `if email.isUrgent` |
| **transform** | Transforms data (LLM or code) | `summarize`, `translate`, `extract-names` |
| **output** | Sends result somewhere | `send-dm`, `post-to-channel`, `save-to-memory` |

### WorkflowService

```typescript
class WorkflowService extends Service {
  static serviceType = "WORKFLOW";

  private workflows: Map<UUID, Workflow> = new Map();
  private oauthGateway: IOAuthGatewayService;

  async start(runtime: IAgentRuntime): Promise<void> {
    this.oauthGateway = runtime.getService("OAUTH_GATEWAY");

    // Load all enabled workflows from database
    const workflows = await this.loadWorkflows();

    for (const workflow of workflows) {
      await this.registerWorkflow(workflow);
    }
  }

  /**
   * Register a workflow with the appropriate trigger system.
   */
  async registerWorkflow(workflow: Workflow): Promise<void> {
    this.workflows.set(workflow.id, workflow);

    switch (workflow.trigger.type) {
      case "cron":
        // Register with TaskService for recurring execution
        await this.runtime.createTask({
          name: `workflow:${workflow.id}`,
          description: workflow.description,
          tags: ["queue", "repeat", "workflow"],
          metadata: {
            workflowId: workflow.id,
            updateInterval: workflow.trigger.interval,
          },
        });
        break;

      case "event":
        // Register with Event system
        this.runtime.on(workflow.trigger.eventName, async (data) => {
          if (this.matchesFilter(data, workflow.trigger.filter)) {
            await this.executeWorkflow(workflow.id, data);
          }
        });
        break;

      case "webhook":
        // Register HTTP endpoint
        this.runtime.registerRoute({
          method: "POST",
          path: `/workflows/${workflow.id}/trigger`,
          handler: async (req, res) => {
            const result = await this.executeWorkflow(workflow.id, req.body);
            res.json(result);
          },
        });
        break;
    }
  }

  /**
   * Execute a workflow by traversing its node graph.
   */
  async executeWorkflow(
    workflowId: UUID,
    triggerData?: any
  ): Promise<WorkflowExecutionResult> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow || !workflow.enabled) return;

    const executionId = generateUUID();
    const context: Record<string, any> = { trigger: triggerData };
    const results: NodeExecutionResult[] = [];
    const startedAt = Date.now();

    // Topological sort ensures dependencies are resolved first
    const sortedNodes = this.topologicalSort(workflow.nodes);

    for (const node of sortedNodes) {
      // Skip if a predecessor condition was false
      if (this.shouldSkip(node, results)) {
        results.push({
          nodeId: node.id,
          status: "skipped",
          output: null,
          duration: 0,
        });
        continue;
      }

      const inputs = node.inputs.map((id) => context[id]);
      const start = Date.now();

      try {
        const output = await this.executeNode(node, inputs, workflow.entityId);
        context[node.id] = output;
        results.push({
          nodeId: node.id,
          status: "success",
          output,
          duration: Date.now() - start,
        });
      } catch (error) {
        results.push({
          nodeId: node.id,
          status: "failure",
          output: null,
          duration: Date.now() - start,
          error: error.message,
        });

        // Stop execution on failure (unless retry policy succeeds)
        if (!node.retryPolicy) break;
      }
    }

    return {
      workflowId,
      executionId,
      status: results.some((r) => r.status === "failure") ? "failed" : "completed",
      nodeResults: results,
      startedAt,
      completedAt: Date.now(),
      triggerData,
    };
  }

  /**
   * Execute a single node.
   */
  private async executeNode(
    node: WorkflowNode,
    inputs: any[],
    entityId: UUID
  ): Promise<any> {
    switch (node.type) {
      case "action": {
        // Get OAuth token if the action requires authentication
        let token: string | undefined;
        if (node.config.requiresAuth) {
          token = await this.oauthGateway.getToken(entityId, node.config.service);
        }
        return this.executeAction(node.name, {
          ...node.config,
          token,
          inputs,
        });
      }

      case "condition": {
        return this.evaluateCondition(node.config.expression, inputs);
      }

      case "transform": {
        const result = await this.runtime.useModel(ModelType.TEXT_SMALL, {
          prompt: `${node.config.instruction}\n\nInput:\n${JSON.stringify(inputs, null, 2)}`,
        });
        return result;
      }

      case "output": {
        return this.executeOutput(node, inputs, entityId);
      }

      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  /**
   * Topological sort of workflow nodes.
   */
  private topologicalSort(nodes: WorkflowNode[]): WorkflowNode[] {
    const sorted: WorkflowNode[] = [];
    const visited = new Set<string>();
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      const node = nodeMap.get(nodeId);
      if (!node) return;
      for (const inputId of node.inputs) {
        visit(inputId);
      }
      sorted.push(node);
    };

    for (const node of nodes) {
      visit(node.id);
    }

    return sorted;
  }
}
```

### Integration Points

**With TaskService** (cron workflows):
```
TaskService (tick every 1s)
    │
    ▼
Finds task with tags ["queue", "repeat", "workflow"]
    │
    ▼
Checks updateInterval — is it time to run?
    │
    ▼
Calls registered task worker
    │
    ▼
Worker calls WorkflowService.executeWorkflow(workflowId)
```

**With Event System** (event-triggered workflows):
```
runtime.emit("MESSAGE_RECEIVED", messageData)
    │
    ▼
WorkflowService listener fires
    │
    ▼
Checks filter (e.g., only messages containing "urgent")
    │
    ▼
WorkflowService.executeWorkflow(workflowId, messageData)
```

**With OAuth Gateway** (authenticated actions):
```
WorkflowNode { type: "action", config: { requiresAuth: true, service: "google" } }
    │
    ▼
WorkflowService.executeNode()
    │
    ▼
OAuthGateway.getToken(entityId, "google")
    │
    ├─ Token valid? → Return access token
    ├─ Token expired? → Refresh → Return new access token
    └─ No token? → Throw error → Workflow pauses, asks user to connect
```

---

## 8. Layer 3: AI Workflow Generator

### Concept

Extend `plugin-n8n`'s existing AI code generation pipeline to produce **Workflow JSON** instead of full TypeScript plugins.

### Current plugin-n8n Pipeline

```
Natural language description
    │
    ▼
generatePluginSpecification()
    │  Keyword detection → structured spec
    │
    ▼
Plugin Spec (PluginSpecification)
    │
    ▼
generatePluginCode() — Claude generates TypeScript
    │
    ▼
Build (bun build)
    │
    ▼
Lint (biome lint)
    │
    ▼
Test (bun test)
    │
    ▼
Validate (structural checks)
    │
    ▼
Iterate (max 5 times if errors)
    │
    ▼
Output: Working TypeScript plugin
```

### Extended Pipeline (for Workflows)

```
Natural language description
    │
    ▼
generateWorkflowSpecification()
    │  Detect intent: email, calendar, scheduling, etc.
    │  Identify required services and OAuth scopes
    │
    ▼
Workflow Spec
    │
    ▼
generateWorkflowJSON() — Claude generates Workflow definition
    │
    ▼
Schema Validation — All nodes have valid types and connections
    │
    ▼
Graph Validation — No cycles, all inputs/outputs resolve, trigger exists
    │
    ▼
Auth Validation — Required OAuth scopes available for the entity
    │
    ▼
Dry Run — Execute with mock data to check runtime errors
    │
    ▼
Iterate (max 3 times if validation fails)
    │
    ▼
Output: Validated Workflow JSON → Deploy to WorkflowService
```

### New Actions

```typescript
// Action: Create workflow from structured spec
const createWorkflowAction: Action = {
  name: "CREATE_WORKFLOW",
  description: "Create a workflow from a structured specification",
  validate: async (runtime, message) => { /* check permissions */ },
  handler: async (runtime, message, state, options, callback) => {
    const spec = extractWorkflowSpec(message);
    const workflowService = runtime.getService("WORKFLOW");
    const workflow = await workflowService.createWorkflow(spec);
    callback({ text: `Workflow "${workflow.name}" created and deployed.` });
  },
};

// Action: Create workflow from natural language
const createWorkflowFromDescriptionAction: Action = {
  name: "CREATE_WORKFLOW_FROM_DESCRIPTION",
  description: "Generate a workflow from a natural language description",
  validate: async (runtime, message) => { /* check permissions */ },
  handler: async (runtime, message, state, options, callback) => {
    const description = message.content.text;
    const generator = runtime.getService("WORKFLOW_GENERATOR");

    callback({ text: `Generating workflow from: "${description}"...` });

    const workflow = await generator.generateFromDescription(
      description,
      message.entityId
    );

    const workflowService = runtime.getService("WORKFLOW");
    await workflowService.registerWorkflow(workflow);

    callback({
      text: `Workflow "${workflow.name}" created and active.\n` +
            `Trigger: ${workflow.trigger.type}\n` +
            `Nodes: ${workflow.nodes.length}\n` +
            `Required auth: ${workflow.nodes.filter(n => n.config?.requiresAuth).map(n => n.config.service).join(", ") || "none"}`,
    });
  },
};
```

### New Providers

```typescript
// Provider: Inject active workflows into agent context
const activeWorkflowsProvider: Provider = {
  name: "ACTIVE_WORKFLOWS",
  description: "Lists the user's active workflows and their recent execution status",
  dynamic: true,
  get: async (runtime, message) => {
    const workflowService = runtime.getService("WORKFLOW");
    const workflows = await workflowService.getWorkflowsByEntity(message.entityId);

    const text = workflows.length > 0
      ? `Active workflows:\n${workflows.map(w =>
          `- ${w.name} (${w.trigger.type}) — last run: ${w.lastExecutedAt ? new Date(w.lastExecutedAt).toISOString() : "never"}, errors: ${w.errorCount}`
        ).join("\n")}`
      : "No active workflows.";

    return { values: { workflows }, data: { workflows }, text };
  },
};

// Provider: Email context for conversational email management
const emailContextProvider: Provider = {
  name: "EMAIL_CONTEXT",
  description: "Current email context — recently listed, opened, and replied emails",
  dynamic: true,
  get: async (runtime, message) => {
    const emailService = runtime.getService("EMAIL");
    const context = await emailService.getConversationContext(message.entityId, message.roomId);

    // Tracks which emails were shown, opened, replied to in this conversation
    return {
      values: { emailContext: context },
      data: { emailContext: context },
      text: context.summary,
    };
  },
};
```

### Example: AI-Generated Workflow

User says: *"Check my email every morning and summarize unread messages"*

AI generates:

```json
{
  "name": "morning-email-summary",
  "description": "Check email every morning at 8 AM and summarize unread messages",
  "nodes": [
    {
      "id": "trigger",
      "type": "trigger",
      "name": "every-morning",
      "config": { "schedule": "0 8 * * *" },
      "inputs": [],
      "outputs": ["fetch"]
    },
    {
      "id": "fetch",
      "type": "action",
      "name": "fetch-emails",
      "config": {
        "service": "google",
        "requiresAuth": true,
        "filter": "is:unread",
        "maxResults": 50
      },
      "inputs": ["trigger"],
      "outputs": ["check"]
    },
    {
      "id": "check",
      "type": "condition",
      "name": "has-unread",
      "config": { "expression": "inputs[0].length > 0" },
      "inputs": ["fetch"],
      "outputs": ["summarize"]
    },
    {
      "id": "summarize",
      "type": "transform",
      "name": "summarize-emails",
      "config": {
        "instruction": "Summarize these emails concisely, grouping by sender. Highlight any urgent or time-sensitive items."
      },
      "inputs": ["check"],
      "outputs": ["notify"]
    },
    {
      "id": "notify",
      "type": "output",
      "name": "send-dm",
      "config": { "channel": "dm" },
      "inputs": ["summarize"],
      "outputs": []
    }
  ],
  "trigger": { "type": "cron", "schedule": "0 8 * * *", "interval": 86400000 },
  "enabled": true
}
```

---

## 9. Prefab Workflows

Ready-to-use workflow templates that users can activate with a single command.

| Workflow | Trigger | Nodes | Description |
|----------|---------|-------|-------------|
| **check-email** | Cron (5 min) | Fetch → Filter → Store | Poll for new emails, store in agent memory |
| **send-email** | Manual | Compose → Send → Confirm | Draft and send email via Gmail/Outlook |
| **email-reply** | Manual | Fetch thread → Draft reply → Send | Reply to a specific email in context |
| **daily-email-summary** | Cron (24h) | Fetch → Filter → Summarize → DM | Morning digest of unread emails |
| **urgent-email-alert** | Cron (1 min) | Fetch → Check urgent → Alert | Immediate notification for urgent emails |
| **calendar-briefing** | Cron (24h) | Fetch events → Summarize → DM | Morning calendar overview with prep notes |
| **meeting-prep** | Event (30 min before) | Fetch event → Gather context → DM | Pre-meeting briefing with relevant docs |
| **auto-label-emails** | Cron (5 min) | Fetch → Classify → Apply labels | AI-powered email categorization |

### Template Format

Each prefab is a Workflow JSON file that can be:
1. Activated as-is with default settings
2. Customized (change schedule, filters, output channel)
3. Cloned and modified for custom variations
4. Used as reference for AI workflow generation

---

## 10. Email & Calendar — Full Flow Examples

### Flow 1: Reading Emails Conversationally

```
User: "Do I have any new emails?"
    │
    ▼
EMAIL_CONTEXT Provider checks conversation state
    │  No emails listed yet → triggers fetch
    │
    ▼
Agent calls fetch-emails Action
    │  OAuthGateway.getToken(entityId, "google")
    │  Gmail API → fetch unread emails
    │
    ▼
Agent responds with email list
    │  EMAIL_CONTEXT tracks: listed emails = [e1, e2, e3]
    │
    ▼
User: "Open the second one"
    │
    ▼
EMAIL_CONTEXT Provider knows email #2 = e2
    │
    ▼
Agent calls get-email Action (fetch full body of e2)
    │  EMAIL_CONTEXT tracks: opened email = e2
    │
    ▼
Agent displays email content
    │
    ▼
User: "Reply and say I'll be there at 3pm"
    │
    ▼
EMAIL_CONTEXT knows we're replying to e2
    │
    ▼
Agent calls reply-email Action
    │  To: e2.sender, Subject: Re: e2.subject
    │  Body: LLM-generated professional reply confirming 3pm
    │  OAuthGateway.getToken(entityId, "google")
    │  Gmail API → send reply
    │
    ▼
Agent confirms: "Reply sent to john@example.com"
    │  EMAIL_CONTEXT tracks: replied to e2
```

### Flow 2: Automated Daily Summary (Workflow)

```
08:00 AM — TaskService triggers workflow "daily-email-summary"
    │
    ▼
Node: fetch-emails
    │  OAuthGateway.getToken(entityId, "google")
    │  Gmail API → 23 unread emails
    │
    ▼
Node: has-unread (condition)
    │  23 > 0 → true → continue
    │
    ▼
Node: summarize-emails (transform)
    │  LLM: "You have 23 unread emails:
    │   - 5 from @work-team (2 urgent: Q4 report deadline, server outage)
    │   - 3 from @client (proposal feedback)
    │   - 8 newsletters (can be batched)
    │   - 7 notifications (GitHub, Jira)"
    │
    ▼
Node: send-dm (output)
    │  Sends summary to user via Discord DM / chat
    │
    ▼
Done. Next execution: tomorrow 08:00 AM
```

### Flow 3: Connecting OAuth (First Time Setup)

```
User: "Connect my Gmail"
    │
    ▼
Agent: "I'll set up Gmail access for you."
    │
    ▼
OAuthGateway.initiateFlow(entityId, "google", ["gmail.readonly", "gmail.send", "calendar.readonly"])
    │
    ▼
Agent: "Please click this link to authorize: https://accounts.google.com/o/oauth2/v2/auth?..."
    │
    ▼
User clicks → Google consent screen → Authorizes → Redirect to /oauth/callback
    │
    ▼
OAuthGateway.handleCallback(code, state)
    │  Exchange code → tokens
    │  Store tokens in Secrets Manager
    │  Store metadata in Entity component
    │
    ▼
Agent: "Gmail connected for stan@gmail.com. You can now ask me to read, send, or manage your emails."
```

---

## 11. Development Phases

### Phase 1 — OAuth Gateway

**Goal**: Secure, multi-tenant OAuth credential management.

**Deliverables**:
- `OAuthGatewayService` implementation
- OAuth flow for Google (Gmail + Calendar + Drive)
- OAuth flow for Microsoft (Outlook + Calendar)
- Per-Entity credential storage (Secrets Manager or encrypted DB)
- Token auto-refresh mechanism
- HTTP endpoints: `/oauth/connect/:service`, `/oauth/callback`, `/oauth/status`
- `CONNECT_SERVICE` Action (agent initiates OAuth flow)
- `CONNECTED_SERVICES` Provider (injects user's connected services into context)

**Dependencies**: None (can start immediately)

### Phase 2 — Workflow Engine

**Goal**: Composable, graph-based workflow execution.

**Deliverables**:
- `WorkflowNode`, `Workflow`, `WorkflowTrigger` type definitions
- `WorkflowService` with graph traversal and node execution
- TaskService integration for cron-triggered workflows
- Event system integration for event-triggered workflows
- Webhook trigger support
- Email Actions: `FETCH_EMAILS`, `GET_EMAIL`, `SEND_EMAIL`, `REPLY_EMAIL`
- Calendar Actions: `GET_CALENDAR_EVENTS`, `CREATE_CALENDAR_EVENT`
- `EMAIL_CONTEXT` Provider (conversational email state tracking)
- `ACTIVE_WORKFLOWS` Provider (workflow status in agent context)
- Workflow CRUD Actions: `CREATE_WORKFLOW`, `LIST_WORKFLOWS`, `ENABLE_WORKFLOW`, `DISABLE_WORKFLOW`
- Execution logging and error tracking

**Dependencies**: Phase 1 (OAuth Gateway for authenticated actions)

### Phase 3 — AI Workflow Generator

**Goal**: Natural language to deployed workflow.

**Deliverables**:
- Extend `plugin-n8n`'s `PluginCreationService` for workflow generation
- `generateWorkflowSpecification()` — intent detection and spec creation
- `generateWorkflowJSON()` — Claude generates workflow definition
- Validation pipeline: schema → graph → auth → dry run
- `CREATE_WORKFLOW_FROM_DESCRIPTION` Action
- Prefab workflow templates (email, calendar, notifications)
- Workflow template marketplace structure

**Dependencies**: Phase 2 (Workflow Engine for execution and validation)

### Phase 4 — Scale & Polish

**Goal**: Production readiness and ecosystem growth.

**Deliverables**:
- Visual workflow editor (React component in `packages/client`)
- Workflow versioning and rollback
- Execution monitoring dashboard (logs, error rates, success rates)
- Additional OAuth providers (GitHub, Slack, Notion, Linear, etc.)
- Community workflow marketplace (share, import, rate)
- Workflow analytics (most used nodes, common patterns)
- Rate limiting and quota management per entity
- Workflow debugging tools (step-through execution, breakpoints)

**Dependencies**: Phases 1-3 complete

---

## 12. Summary

### What Already Exists in ElizaOS

| Need | Existing System | Reusable? |
|------|----------------|-----------|
| Cron scheduling | TaskService | Yes, as-is |
| Event triggers | Event system | Yes, as-is |
| Executable steps | Actions | Yes, as-is |
| Context injection | Providers | Yes, as-is |
| Per-user data | Entity components | Yes, as-is |
| AI code generation | plugin-n8n | Yes, extend it |
| Credential encryption | character.secrets | Yes, extend for per-Entity |
| Cloud infra for auth | eliza-cloud | Yes, repurpose for OAuth |

### What We Need to Build

| Component | Effort | Priority |
|-----------|--------|----------|
| **OAuth Gateway Service** | Medium | P0 — Everything depends on this |
| **Workflow Engine** | Large | P0 — Core value proposition |
| **Email/Calendar Actions** | Medium | P1 — First real use case |
| **AI Workflow Generator** | Medium | P1 — Key differentiator |
| **Prefab Workflows** | Small | P2 — Quick wins for users |
| **Visual Editor** | Large | P3 — Nice to have |

### The Core Insight

ElizaOS already has **90% of the infrastructure** needed. The missing 10% is:

1. **OAuth Gateway** — Centralized credential management for third-party services
2. **Workflow Engine** — Graph-based node execution tying Actions together
3. **AI Workflow Generator** — Extend plugin-n8n to produce workflow definitions

This delivers what the team identified: *"95% of what people want is an AI workflow builder"* — built directly on top of the existing architecture, not a separate system.

---

*End of plan.*
