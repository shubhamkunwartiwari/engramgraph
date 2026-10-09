import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GraphMemoryEngine } from './server/graphStore.ts';
import {
  runAgentMemoryTask,
  runCustomWorkflow,
  partitionDocumentIntoGraph,
} from './server/agentOrchestrator.ts';
import {
  EdgeRelationType,
  MemoryNodeKind,
  ModelProvider,
  IdeClientType,
} from './src/types/memory.ts';

export const app = express();
const engine = new GraphMemoryEngine();

app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, X-Engram-Client, Authorization'
  );
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

function registerApiRoutes() {
  // 1. Get complete graph & multi-agent memory state
  app.get('/api/graph/state', (_req, res) => {
    try {
      res.json(engine.getState());
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to read graph state' });
    }
  });

  // 2. Get the strict Agent-Scoped Context View (proves agent only holds summary index + explicitly checked-out sub-topics)
  app.get('/api/graph/agent-view/:agentId', (req, res) => {
    try {
      const view = engine.getAgentScopedGraphView(req.params.agentId);
      res.json(view);
    } catch (err: any) {
      res.status(404).json({ error: err.message || 'Agent not found' });
    }
  });

  // 3. Page-In (Checkout) a Sub-Topic into an Agent's active working context
  app.post('/api/graph/checkout', async (req, res) => {
    try {
      const { agentId, subtopicId, reason } = req.body;
      if (!agentId || !subtopicId) {
        res.status(400).json({ error: 'agentId and subtopicId are required' });
        return;
      }
      const result = await engine.checkoutSubtopic(
        String(agentId),
        String(subtopicId),
        String(reason || 'Manual context page-in request')
      );
      res.json({
        ...result,
        state: engine.getState(),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to checkout sub-topic' });
    }
  });

  // 4. Page-Out (Release / Evict) a Sub-Topic back into the FalkorDB graph
  app.post('/api/graph/release', async (req, res) => {
    try {
      const { agentId, subtopicId, reason } = req.body;
      if (!agentId || !subtopicId) {
        res.status(400).json({ error: 'agentId and subtopicId are required' });
        return;
      }
      const result = await engine.releaseSubtopic(
        String(agentId),
        String(subtopicId),
        String(reason || 'Agent finished reasoning; context sent back into FalkorDB')
      );
      res.json({
        ...result,
        state: engine.getState(),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to release sub-topic' });
    }
  });

  // 5. Release all active sub-topic leases across all agents (Garbage Collection Sweep)
  app.post('/api/graph/release-all', (_req, res) => {
    try {
      const steps = engine.releaseAllLeases();
      res.json({
        steps,
        state: engine.getState(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to release all leases' });
    }
  });

  // 6. Commit updates to a Sub-Topic (Add/Update MemoryNodes, Edges, and regenerate Sub-Topic Summary)
  app.post('/api/graph/mutate', async (req, res) => {
    try {
      const {
        agentId,
        subtopicId,
        newNodes,
        updatedNodes,
        updatedSummary,
        commitMessage,
      } = req.body;

      if (!agentId || !subtopicId) {
        res.status(400).json({ error: 'agentId and subtopicId are required' });
        return;
      }

      const result = await engine.mutateSubtopicGraph({
        agentId: String(agentId),
        subtopicId: String(subtopicId),
        newNodes: Array.isArray(newNodes)
          ? newNodes.map((n: any) => ({
              title: String(n.title || 'Untitled Memory'),
              content: String(n.content || ''),
              kind: (n.kind as MemoryNodeKind) || MemoryNodeKind.FACT,
              confidence: Number(n.confidence ?? 0.96),
              connectToNodeId: n.connectToNodeId ? String(n.connectToNodeId) : undefined,
              relationType: (n.relationType as EdgeRelationType) || EdgeRelationType.RELATES_TO,
              edgeRationale: n.edgeRationale ? String(n.edgeRationale) : undefined,
            }))
          : [],
        updatedNodes,
        updatedSummary: String(updatedSummary || ''),
        commitMessage: String(commitMessage || 'Manual graph memory commit'),
      });

      res.json({
        ...result,
        state: engine.getState(),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to mutate sub-topic graph' });
    }
  });

  // 7. Create a new distinct Sub-Topic branch in the Main Graph
  app.post('/api/graph/subtopic', async (req, res) => {
    try {
      const { name, domain, summary, color, createdByAgentId, initialNodes } = req.body;
      if (!name || !summary) {
        res.status(400).json({ error: 'Sub-topic name and summary are required' });
        return;
      }
      const result = await engine.createSubtopic({
        name: String(name),
        domain: String(domain || 'Specialized Context'),
        summary: String(summary),
        color: color ? String(color) : undefined,
        createdByAgentId: createdByAgentId ? String(createdByAgentId) : undefined,
        initialNodes: Array.isArray(initialNodes) ? initialNodes : [],
      });
      res.json({
        ...result,
        state: engine.getState(),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to create sub-topic' });
    }
  });

  // 8. Run Gemini Autonomous Agent or Multi-Agent Coordinated Memory Paging Task
  app.post('/api/agent/run', async (req, res) => {
    try {
      const { taskPrompt, agentIds, autoEvictOnFinish, simulateMidRunModelSwitch } = req.body;
      if (!taskPrompt || !Array.isArray(agentIds) || agentIds.length === 0) {
        res.status(400).json({ error: 'taskPrompt and at least one agentId are required' });
        return;
      }
      const runResult = await runAgentMemoryTask(engine, {
        taskPrompt: String(taskPrompt),
        agentIds: agentIds.map(String),
        autoEvictOnFinish: autoEvictOnFinish !== false,
        simulateMidRunModelSwitch:
          simulateMidRunModelSwitch && simulateMidRunModelSwitch.targetModelId
            ? { targetModelId: String(simulateMidRunModelSwitch.targetModelId) }
            : undefined,
      });
      res.json({
        run: runResult,
        state: engine.getState(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Agent memory execution failed' });
    }
  });

  // 8b. Hot-swap an agent's LLM model (Claude <-> ChatGPT <-> Gemini <-> Llama) with ZERO context loss
  app.post('/api/agent/switch-model', async (req, res) => {
    try {
      const { agentId, modelId } = req.body;
      if (!agentId || !modelId) {
        res.status(400).json({ error: 'agentId and modelId are required' });
        return;
      }
      const result = await engine.switchAgentModel(String(agentId), String(modelId));
      res.json({
        ...result,
        state: engine.getState(),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to switch agent model' });
    }
  });

  // 8c. Persist a new multi-hop traversal path in the graph so all models can access it
  app.post('/api/graph/path', async (req, res) => {
    try {
      const { title, description, nodeIds, agentId } = req.body;
      if (!title || !Array.isArray(nodeIds) || nodeIds.length < 2) {
        res.status(400).json({ error: 'Path title and at least 2 nodeIds are required' });
        return;
      }
      const savedPath = await engine.saveGraphPath({
        title: String(title),
        description: String(description || ''),
        nodeIds: nodeIds.map(String),
        agentId: String(agentId || 'agent_atlas'),
      });
      res.json({
        savedPath,
        state: engine.getState(),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to save graph path' });
    }
  });

  // 9. Connect to external FalkorDB instance (local Docker or FalkorDB Cloud)
  app.post('/api/falkordb/connect', async (req, res) => {
    try {
      const { url, graphName } = req.body;
      if (!url) {
        res.status(400).json({ error: 'FalkorDB connection URL is required (e.g. redis://localhost:6379)' });
        return;
      }
      const status = await engine.connectFalkorDB(String(url), graphName ? String(graphName) : undefined);
      res.json({
        ...status,
        state: engine.getState(),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to connect to FalkorDB' });
    }
  });

  // 10. Export complete FalkorDB Cypher Script
  app.get('/api/graph/export-cypher', (_req, res) => {
    try {
      res.json({ cypher: engine.generateExportCypherScript() });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to generate Cypher script' });
    }
  });

  // 11. Reset graph to clean seed state
  app.post('/api/graph/reset', (_req, res) => {
    try {
      const state = engine.resetToDefault();
      res.json({ state });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to reset graph' });
    }
  });

  // 12. Multi-Workspace Management (Create Blank / Switch / Import JSON)
  app.post('/api/workspaces/create', (req, res) => {
    try {
      const { name, description, template } = req.body;
      if (!name) {
        res.status(400).json({ error: 'Workspace name is required' });
        return;
      }
      const state = engine.createWorkspace({
        name: String(name),
        description: String(description || ''),
        template: template === 'enterprise_sample' ? 'enterprise_sample' : 'blank',
      });
      res.json({ state });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to create workspace' });
    }
  });

  app.post('/api/workspaces/switch', (req, res) => {
    try {
      const { workspaceId } = req.body;
      if (!workspaceId) {
        res.status(400).json({ error: 'workspaceId is required' });
        return;
      }
      const state = engine.switchWorkspace(String(workspaceId));
      res.json({ state });
    } catch (err: any) {
      res.status(404).json({ error: err.message || 'Workspace not found' });
    }
  });

  app.post('/api/workspaces/import', (req, res) => {
    try {
      const state = engine.importWorkspaceJson(req.body);
      res.json({ state });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to import workspace JSON' });
    }
  });

  // 13. AI Document / Codebase Auto-Partitioner into Graph Sub-Topics
  app.post('/api/graph/ingest-document', async (req, res) => {
    try {
      const { documentTitle, rawText, agentId } = req.body;
      if (!rawText || !String(rawText).trim()) {
        res.status(400).json({ error: 'Document text is required' });
        return;
      }
      const result = await partitionDocumentIntoGraph(engine, {
        documentTitle: String(documentTitle || 'Corporate Document'),
        rawText: String(rawText),
        agentId: agentId ? String(agentId) : undefined,
      });
      res.json({
        ...result,
        state: engine.getState(),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to ingest document into graph' });
    }
  });

  // 14. Custom Model Registry (Bring Your Own Models)
  app.post('/api/models', (req, res) => {
    try {
      const { id, label, provider, endpointRoute, contextBudgetTokens } = req.body;
      if (!id || !label) {
        res.status(400).json({ error: 'Model ID and Label are required' });
        return;
      }
      const model = engine.registerCustomModel({
        id: String(id),
        label: String(label),
        provider: (provider as ModelProvider) || 'Self-Hosted vLLM / Ollama',
        endpointRoute: endpointRoute ? String(endpointRoute) : undefined,
        contextBudgetTokens: Number(contextBudgetTokens) || 8192,
      });
      res.json({
        model,
        state: engine.getState(),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to register custom model' });
    }
  });

  // 15. Custom Corporate Agent Builder
  app.post('/api/agents', (req, res) => {
    try {
      const { name, role, specialty, modelId, accentColor } = req.body;
      if (!name || !role) {
        res.status(400).json({ error: 'Agent name and role are required' });
        return;
      }
      const agent = engine.createCustomAgent({
        name: String(name),
        role: String(role),
        specialty: String(specialty || ''),
        modelId: String(modelId || 'claude-3-7-sonnet'),
        accentColor: accentColor ? String(accentColor) : undefined,
      });
      res.json({
        agent,
        state: engine.getState(),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to create agent' });
    }
  });

  app.delete('/api/agents/:agentId', (req, res) => {
    try {
      engine.deleteAgent(req.params.agentId);
      res.json({ state: engine.getState() });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to delete agent' });
    }
  });

  // 16. Custom Multi-Stage Workflow Builder & Runner
  app.post('/api/workflows', (req, res) => {
    try {
      const { id, name, description, stages } = req.body;
      const workflow = engine.saveWorkflow({
        id: id ? String(id) : undefined,
        name: String(name || ''),
        description: String(description || ''),
        stages: Array.isArray(stages) ? stages : [],
      });
      res.json({
        workflow,
        state: engine.getState(),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to save workflow' });
    }
  });

  app.delete('/api/workflows/:workflowId', (req, res) => {
    try {
      engine.deleteWorkflow(req.params.workflowId);
      res.json({ state: engine.getState() });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to delete workflow' });
    }
  });

  app.post('/api/workflows/:workflowId/run', async (req, res) => {
    try {
      const run = await runCustomWorkflow(engine, req.params.workflowId);
      res.json({
        run,
        state: engine.getState(),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Workflow execution failed' });
    }
  });

  // 17. Developer v1 REST SDK API (For external Cursor, Claude MCP, LangGraph, Python & TypeScript clients)
  app.get('/api/v1/index', (req, res) => {
    try {
      const state = engine.getState();
      const agentId = String(req.query.agentId || state.agents[0]?.id || 'agent_atlas');
      res.json(engine.getAgentScopedGraphView(agentId));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/v1/checkout', async (req, res) => {
    try {
      const state = engine.getState();
      const agentId = String(req.body.agentId || state.agents[0]?.id);
      const subtopicId = String(req.body.subtopicId || state.subtopics[0]?.id);
      const reason = String(req.body.reason || 'External SDK checkout');
      const result = await engine.checkoutSubtopic(agentId, subtopicId, reason);
      res.json({ status: 'MOUNTED', subtopic: result.subtopic, nodes: result.nodes, edges: result.edges });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/v1/release', async (req, res) => {
    try {
      const state = engine.getState();
      const agentId = String(req.body.agentId || state.agents[0]?.id);
      const subtopicId = String(req.body.subtopicId || state.subtopics[0]?.id);
      const reason = String(req.body.reason || 'External SDK release');
      const result = await engine.releaseSubtopic(agentId, subtopicId, reason);
      res.json({ status: 'RELEASED', subtopicId: result.subtopic.id, activeTokensAfter: result.step.activeTokensAfter });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 18. Model Context Protocol (MCP) JSON-RPC 2.0 Server Endpoint
  // Connects Claude Code CLI, OpenAI Codex CLI, Cursor, VS Code Copilot, and Windsurf directly to this workspace
  app.post('/api/mcp', async (req, res) => {
    try {
      const rawClientHeader = String(
        req.headers['x-engram-client'] || req.body?.clientType || 'Claude Code CLI'
      );
      const clientType = (
        [
          'Claude Code CLI',
          'OpenAI Codex CLI',
          'Cursor IDE',
          'VS Code Copilot',
          'Windsurf IDE',
          'Custom MCP Client',
        ].includes(rawClientHeader)
          ? rawClientHeader
          : 'Claude Code CLI'
      ) as IdeClientType;

      const rpcResponse = await engine.handleMcpJsonRpc(req.body || { method: 'tools/list' }, clientType);
      res.json({
        ...rpcResponse,
        _stateSnapshot: engine.getState(),
      });
    } catch (err: any) {
      res.status(400).json({
        jsonrpc: '2.0',
        id: req.body?.id ?? null,
        error: { code: -32603, message: err.message || 'MCP execution error' },
      });
    }
  });

  // 19. Downloadable Zero-Dependency Node.js MCP Stdio Bridge Script for Claude Code & Codex CLI
  app.get('/api/ide/engram-mcp-bridge.mjs', (req, res) => {
    const origin =
      String(req.query.origin || '') ||
      process.env.APP_URL ||
      `${req.protocol}://${req.get('host')}`;
    const agentId = req.query.agentId ? String(req.query.agentId) : undefined;
    const script = engine.generateStandaloneMcpBridgeScript(origin, agentId);
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="engram-mcp-bridge.mjs"');
    res.send(script);
  });

  // 20. Register / Connect an IDE Workspace Session (Claude Code, OpenAI Codex, Cursor, VS Code, Windsurf)
  app.post('/api/ide/connect', (req, res) => {
    try {
      const { clientType, agentId, repoBranch, toolCalled } = req.body;
      const session = engine.registerOrTouchIdeSession({
        clientType: (clientType as IdeClientType) || 'Claude Code CLI',
        agentId: agentId ? String(agentId) : undefined,
        repoBranch: repoBranch ? String(repoBranch) : 'main',
        toolCalled: toolCalled ? String(toolCalled) : 'engram_get_index',
      });
      res.json({
        session,
        state: engine.getState(),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to register IDE session' });
    }
  });

  // 28. Academic Research Benchmark Suite ($0 Empirical Evaluation)
  app.get('/api/benchmark', (_req, res) => {
    try {
      res.json(engine.runAcademicBenchmarkSuite());
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Benchmark failed' });
    }
  });

  app.post('/api/benchmark/run', (_req, res) => {
    try {
      const results = engine.runAcademicBenchmarkSuite();
      res.json({
        results,
        state: engine.getState(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Benchmark execution failed' });
    }
  });
}

registerApiRoutes();

async function bootStandaloneServer() {
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EngramGraph Server listening on http://0.0.0.0:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  bootStandaloneServer();
}

export default app;
