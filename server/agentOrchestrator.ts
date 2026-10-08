import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import { GraphMemoryEngine } from './graphStore.ts';
import {
  AgentRunResult,
  EdgeRelationType,
  MemoryNodeKind,
  PagingTraceStep,
} from '../src/types/memory.ts';

function getGenAIClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const checkoutSubtopicDecl: FunctionDeclaration = {
  name: 'checkout_subtopic',
  description:
    'Pages in (mounts) the full MemoryNodes and semantic edges inside a specific SubTopic from the main FalkorDB graph into your active working context. Call this ONLY for sub-topics whose summary indicates relevance to your task.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      subtopicId: {
        type: Type.STRING,
        description: 'The exact ID of the SubTopic to load (e.g., sub_arch, sub_sec, sub_storage, sub_sre, sub_product).',
      },
      reason: {
        type: Type.STRING,
        description: 'Why you need to inspect the full nodes inside this sub-topic.',
      },
    },
    required: ['subtopicId', 'reason'],
  },
};

const updateSubtopicGraphDecl: FunctionDeclaration = {
  name: 'update_subtopic_graph',
  description:
    'Commits new MemoryNodes, semantic edges, and an updated executive summary back into a checked-out SubTopic in the main FalkorDB graph.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      subtopicId: {
        type: Type.STRING,
        description: 'The ID of the SubTopic being updated.',
      },
      newNodes: {
        type: Type.ARRAY,
        description: 'New memory nodes (Facts, Decisions, Episodes, Procedures, Constraints) to persist inside this sub-topic.',
        items: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: 'Concise title for the memory node.',
            },
            content: {
              type: Type.STRING,
              description: 'Detailed technical memory, decision, or finding.',
            },
            kind: {
              type: Type.STRING,
              description: 'One of: Fact, Decision, Episode, Procedure, Constraint',
            },
            connectToNodeId: {
              type: Type.STRING,
              description: 'Optional existing MemoryNode ID (in this or another sub-topic) to link this node to.',
            },
            relationType: {
              type: Type.STRING,
              description: 'Optional relationship type: DEPENDS_ON, CAUSED_BY, SUPERSEDES, MITIGATES, GOVERNED_BY, RELATES_TO',
            },
            edgeRationale: {
              type: Type.STRING,
              description: 'Why these two memory nodes are connected.',
            },
          },
          required: ['title', 'content', 'kind'],
        },
      },
      updatedSummary: {
        type: Type.STRING,
        description:
          'Updated 2-sentence executive summary of the SubTopic incorporating the newly added knowledge so future agents and models know what is inside without loading the full sub-topic.',
      },
      commitMessage: {
        type: Type.STRING,
        description: 'Short commit summary explaining what changed in the graph.',
      },
    },
    required: ['subtopicId', 'newNodes', 'updatedSummary', 'commitMessage'],
  },
};

const createSubtopicDecl: FunctionDeclaration = {
  name: 'create_subtopic',
  description:
    'Creates a brand new distinct SubTopic branch on the Main Graph when the task introduces a new domain of context that does not fit existing sub-topics.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: {
        type: Type.STRING,
        description: 'Name of the new sub-topic cluster.',
      },
      domain: {
        type: Type.STRING,
        description: 'Domain category (e.g., FinOps & Billing, ML Evaluation, Edge Caching).',
      },
      summary: {
        type: Type.STRING,
        description: 'Concise 2-sentence executive summary of this new sub-topic.',
      },
      initialNodes: {
        type: Type.ARRAY,
        description: 'Initial memory nodes to populate inside this new sub-topic.',
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            content: { type: Type.STRING },
            kind: { type: Type.STRING },
          },
          required: ['title', 'content', 'kind'],
        },
      },
    },
    required: ['name', 'domain', 'summary', 'initialNodes'],
  },
};

const releaseSubtopicDecl: FunctionDeclaration = {
  name: 'release_subtopic',
  description:
    'Evicts (pages out) a currently mounted SubTopic from your active working context back into the FalkorDB graph once you have finished reading and updating it.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      subtopicId: {
        type: Type.STRING,
        description: 'The ID of the SubTopic to send back into the graph.',
      },
      releaseReason: {
        type: Type.STRING,
        description: 'Brief note confirming why you no longer need this sub-topic loaded in working memory.',
      },
    },
    required: ['subtopicId', 'releaseReason'],
  },
};

export async function runAgentMemoryTask(
  engine: GraphMemoryEngine,
  options: {
    taskPrompt: string;
    agentIds: string[];
    autoEvictOnFinish: boolean;
    simulateMidRunModelSwitch?: {
      targetModelId: string;
    };
  }
): Promise<AgentRunResult> {
  const startedAt = new Date().toISOString();
  const runSteps: PagingTraceStep[] = [];
  const state = engine.getState();

  const validAgents = options.agentIds
    .map((id) => state.agents.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  if (validAgents.length === 0) {
    throw new Error('At least one valid agent must be selected.');
  }

  let peakActiveTokens = 0;
  const totalGraphTokens = state.subtopics.reduce((acc, s) => acc + s.fullTokenCount, 0);
  const agentSyntheses: string[] = [];
  const modelsUsedSet = new Set<string>();

  for (let i = 0; i < validAgents.length; i++) {
    const agent = validAgents[i];
    agent.currentTask = options.taskPrompt;
    modelsUsedSet.add(agent.activeModelLabel);

    // 1. Agent begins by scanning the RootGraph handle + Sub-Topic Summaries + Shared Paths
    const scanStep = engine.recordIndexScan(
      agent.id,
      `Task assigned on [${agent.activeModelLabel}]: "${options.taskPrompt}". Reading model-agnostic Sub-Topic Summary Directory & ${state.savedPaths.length} shared traversal paths.`
    );
    runSteps.push(scanStep);
    peakActiveTokens = Math.max(peakActiveTokens, scanStep.activeTokensAfter);

    const scopedView = engine.getAgentScopedGraphView(agent.id);
    const directoryText = scopedView.subtopicDirectory
      .map(
        (s) =>
          `- SubTopic ID: "${s.id}" | Name: "${s.name}" | Domain: "${s.domain}" | Version: v${s.version} (Last updated by ${s.lastUpdatedByModel || s.lastUpdatedBy}) | Status: ${s.statusInAgentMemory}\n  Summary (${s.summaryTokenCount} tokens; full=${s.fullTokenCount} tokens): ${s.summary}`
      )
      .join('\n');

    const pathsText = scopedView.savedPaths
      .map(
        (p) =>
          `- Path [${p.id}] "${p.title}" (Authored via ${p.authoredByModel}): SubTopics=[${p.subtopicIds.join(' -> ')}] | Nodes=[${p.nodeIds.join(' -> ')}]\n  Summary: ${p.description}`
      )
      .join('\n');

    const alreadyMountedText =
      scopedView.mountedSubtopics.length > 0
        ? `\n\nALREADY MOUNTED SUB-TOPICS INHERITED FROM GRAPH LEASE:\n${JSON.stringify(
            scopedView.mountedSubtopics,
            null,
            2
          )}`
        : '';

    const priorHandoffContext =
      agentSyntheses.length > 0
        ? `\n\nPREVIOUS AGENT / MODEL HANDOFF NOTES IN THIS WORKFLOW:\n${agentSyntheses.join('\n\n')}`
        : '';

    const systemInstruction = `You are ${agent.name} (${agent.role}), currently executing via model [${agent.activeModelLabel}] on the EngramGraph Model-Agnostic Multi-Agent Memory Engine backed by FalkorDB.
Your specialty: ${agent.specialty}.

CRITICAL MODEL-AGNOSTIC MEMORY RULES:
1. Context and multi-hop paths live in FalkorDB, NOT inside any single LLM's thread memory. Even when models are switched between Claude, ChatGPT, and Gemini, you have complete access to the Sub-Topic Summary Index, any inherited mounted sub-topics, and all Saved Graph Paths.
2. You DO NOT hold all sub-topics in working memory at once. Based on the Sub-Topic summaries and Saved Paths below, call \`checkout_subtopic\` for the 1 or 2 most relevant sub-topics to page in their full MemoryNodes and edges.
3. After inspecting the loaded MemoryNodes, call \`update_subtopic_graph\` (or \`create_subtopic\`) to persist your new technical decisions/facts/procedures and update the Sub-Topic's summary.
4. Once you have updated the graph and no longer need the full sub-topic loaded in your working memory, call \`release_subtopic\` to send the context back into the graph.
5. Provide a concise technical summary explaining what sub-topics and paths you traversed, how you updated the graph, and how the state remains accessible to any model (Claude, ChatGPT, Gemini) that runs next.`;

    const userPrompt = `CURRENT ROOT GRAPH SUB-TOPIC SUMMARY INDEX:
${directoryText}

PERSISTENT MULTI-HOP TRAVERSAL PATHS IN GRAPH (Accessible across all models):
${pathsText}${alreadyMountedText}${priorHandoffContext}

USER TASK FOR ${agent.name.toUpperCase()} (Active Model: ${agent.activeModelLabel}):
${options.taskPrompt}`;

    let agentFinalText = '';
    let didMidRunSwitch = false;

    try {
      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
        throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');
      }

      const ai = getGenAIClient();
      const contents: any[] = [{ role: 'user', parts: [{ text: userPrompt }] }];

      for (let turn = 0; turn < 5; turn++) {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents,
          config: {
            systemInstruction,
            tools: [
              {
                functionDeclarations: [
                  checkoutSubtopicDecl,
                  updateSubtopicGraphDecl,
                  createSubtopicDecl,
                  releaseSubtopicDecl,
                ],
              },
            ],
          },
        });

        const candidateContent = response.candidates?.[0]?.content;
        if (candidateContent) {
          contents.push(candidateContent);
        }

        const functionCalls = response.functionCalls;
        if (!functionCalls || functionCalls.length === 0) {
          agentFinalText = response.text || '';
          break;
        }

        const functionResponseParts: any[] = [];

        for (const call of functionCalls) {
          const args = (call.args || {}) as Record<string, any>;

          if (call.name === 'checkout_subtopic') {
            const targetSubId =
              String(args.subtopicId || '') ||
              engine.getState().subtopics[0]?.id;
            const reason = String(args.reason || `Inspecting full context for ${options.taskPrompt}`);

            try {
              const res = await engine.checkoutSubtopic(agent.id, targetSubId, reason);
              runSteps.push(res.step);
              peakActiveTokens = Math.max(peakActiveTokens, res.step.activeTokensAfter);

              // If user requested a mid-run model hot-swap (e.g., Claude -> ChatGPT right after checking out context!)
              if (options.simulateMidRunModelSwitch && !didMidRunSwitch && i === 0) {
                didMidRunSwitch = true;
                const swapRes = await engine.switchAgentModel(
                  agent.id,
                  options.simulateMidRunModelSwitch.targetModelId
                );
                runSteps.push(swapRes.step);
                modelsUsedSet.add(swapRes.newModel);
              }

              functionResponseParts.push({
                functionResponse: {
                  name: call.name,
                  id: call.id,
                  response: {
                    status: 'PAGED_IN_SUCCESS',
                    activeModelAfterCheckout: agent.activeModelLabel,
                    subtopic: {
                      id: res.subtopic.id,
                      name: res.subtopic.name,
                      summary: res.subtopic.summary,
                      version: res.subtopic.version,
                    },
                    memoryNodes: res.nodes,
                    edges: res.edges,
                    crossSubtopicLinks: res.crossTopicHints.map((h) => ({
                      relation: h.edge.relation,
                      rationale: h.edge.rationale,
                      connectedNodeId: h.externalNode.id,
                      connectedNodeTitle: h.externalNode.title,
                      inSubtopicId: h.externalSubtopic.id,
                      inSubtopicName: h.externalSubtopic.name,
                    })),
                  },
                },
              });
            } catch (err: any) {
              functionResponseParts.push({
                functionResponse: {
                  name: call.name,
                  id: call.id,
                  response: { error: err.message },
                },
              });
            }
          } else if (call.name === 'update_subtopic_graph') {
            const targetSubId =
              String(args.subtopicId || '') ||
              agent.mountedSubtopicIds[0] ||
              engine.getState().subtopics[0]?.id;

            const rawNodes = Array.isArray(args.newNodes) ? args.newNodes : [];
            const mappedNodes = rawNodes.map((n: any) => ({
              title: String(n.title || 'Agent Memory Update'),
              content: String(n.content || ''),
              kind: (Object.values(MemoryNodeKind).includes(n.kind)
                ? n.kind
                : MemoryNodeKind.DECISION) as MemoryNodeKind,
              connectToNodeId: n.connectToNodeId ? String(n.connectToNodeId) : undefined,
              relationType: (Object.values(EdgeRelationType).includes(n.relationType)
                ? n.relationType
                : EdgeRelationType.RELATES_TO) as EdgeRelationType,
              edgeRationale: n.edgeRationale ? String(n.edgeRationale) : undefined,
            }));

            try {
              const res = await engine.mutateSubtopicGraph({
                agentId: agent.id,
                subtopicId: targetSubId,
                newNodes: mappedNodes,
                updatedSummary: String(args.updatedSummary || ''),
                commitMessage: String(args.commitMessage || `Updated by ${agent.name} (${agent.activeModelLabel})`),
              });
              runSteps.push(res.step);
              peakActiveTokens = Math.max(peakActiveTokens, res.step.activeTokensAfter);

              functionResponseParts.push({
                functionResponse: {
                  name: call.name,
                  id: call.id,
                  response: {
                    status: 'COMMITTED_TO_FALKORDB',
                    subtopicId: res.subtopic.id,
                    newVersion: res.subtopic.version,
                    authoredByModel: agent.activeModelLabel,
                    updatedSummary: res.subtopic.summary,
                    createdNodeIds: res.createdNodes.map((n) => n.id),
                  },
                },
              });
            } catch (err: any) {
              functionResponseParts.push({
                functionResponse: {
                  name: call.name,
                  id: call.id,
                  response: { error: err.message },
                },
              });
            }
          } else if (call.name === 'create_subtopic') {
            const rawNodes = Array.isArray(args.initialNodes) ? args.initialNodes : [];
            try {
              const res = await engine.createSubtopic({
                name: String(args.name || 'New Context Cluster'),
                domain: String(args.domain || 'Specialized Context'),
                summary: String(args.summary || ''),
                createdByAgentId: agent.id,
                initialNodes: rawNodes.map((n: any) => ({
                  title: String(n.title || 'Initial Node'),
                  content: String(n.content || ''),
                  kind: (Object.values(MemoryNodeKind).includes(n.kind)
                    ? n.kind
                    : MemoryNodeKind.FACT) as MemoryNodeKind,
                })),
              });
              runSteps.push(res.step);
              peakActiveTokens = Math.max(peakActiveTokens, res.step.activeTokensAfter);

              functionResponseParts.push({
                functionResponse: {
                  name: call.name,
                  id: call.id,
                  response: {
                    status: 'SUBTOPIC_CREATED',
                    subtopicId: res.subtopic.id,
                    name: res.subtopic.name,
                  },
                },
              });
            } catch (err: any) {
              functionResponseParts.push({
                functionResponse: {
                  name: call.name,
                  id: call.id,
                  response: { error: err.message },
                },
              });
            }
          } else if (call.name === 'release_subtopic') {
            const targetSubId = String(args.subtopicId || '');
            const releaseReason = String(
              args.releaseReason || 'Completed reasoning; evicting context back to FalkorDB.'
            );
            try {
              const res = await engine.releaseSubtopic(agent.id, targetSubId, releaseReason);
              runSteps.push(res.step);
              functionResponseParts.push({
                functionResponse: {
                  name: call.name,
                  id: call.id,
                  response: {
                    status: 'RELEASED_TO_GRAPH',
                    subtopicId: res.subtopic.id,
                    activeTokensRemaining: res.step.activeTokensAfter,
                  },
                },
              });
            } catch (err: any) {
              functionResponseParts.push({
                functionResponse: {
                  name: call.name,
                  id: call.id,
                  response: { error: err.message },
                },
              });
            }
          }
        }

        if (functionResponseParts.length > 0) {
          contents.push({ role: 'user', parts: functionResponseParts });
        }
      }
    } catch (err: any) {
      // Deterministic Graph Paging execution if Gemini API key is missing or rate-limited
      const allSubs = engine.getState().subtopics;
      const promptLower = options.taskPrompt.toLowerCase();
      const matchedSub =
        allSubs.find(
          (s) =>
            promptLower.includes(s.name.toLowerCase().split(' ')[0]) ||
            promptLower.includes(s.domain.toLowerCase().split(' ')[0]) ||
            (promptLower.includes('sec') && s.id === 'sub_sec') ||
            (promptLower.includes('inc') && s.id === 'sub_sre') ||
            (promptLower.includes('latenc') && s.id === 'sub_sre') ||
            (promptLower.includes('cost') && s.id === 'sub_product')
        ) || allSubs[i % allSubs.length];

      const checkoutRes = await engine.checkoutSubtopic(
        agent.id,
        matchedSub.id,
        `Summary match for "${options.taskPrompt}" in [${matchedSub.name}]`
      );
      runSteps.push(checkoutRes.step);
      peakActiveTokens = Math.max(peakActiveTokens, checkoutRes.step.activeTokensAfter);

      if (options.simulateMidRunModelSwitch && !didMidRunSwitch && i === 0) {
        didMidRunSwitch = true;
        const swapRes = await engine.switchAgentModel(
          agent.id,
          options.simulateMidRunModelSwitch.targetModelId
        );
        runSteps.push(swapRes.step);
        modelsUsedSet.add(swapRes.newModel);
      }

      const firstExistingNode = checkoutRes.nodes[0];
      const commitRes = await engine.mutateSubtopicGraph({
        agentId: agent.id,
        subtopicId: matchedSub.id,
        newNodes: [
          {
            title: `${agent.name} (${agent.activeModelLabel}): ${options.taskPrompt.slice(0, 42)}`,
            content: `Evaluated ${checkoutRes.nodes.length} nodes in ${matchedSub.name} via ${agent.activeModelLabel}. Enforced persistent graph constraint for: "${options.taskPrompt}".`,
            kind: MemoryNodeKind.DECISION,
            connectToNodeId: firstExistingNode?.id,
            relationType: EdgeRelationType.DEPENDS_ON,
            edgeRationale: `Derived from ${firstExistingNode?.title || matchedSub.name} during ${agent.name} (${agent.activeModelLabel}) paging cycle.`,
          },
        ],
        updatedSummary: `${matchedSub.summary.split('.')[0]}. Updated by ${agent.name} (${agent.activeModelLabel}, v${matchedSub.version + 1}) governing: ${options.taskPrompt.slice(0, 60)}.`,
        commitMessage: `${agent.name} (${agent.activeModelLabel}) committed Decision node & refreshed Sub-Topic summary`,
      });
      runSteps.push(commitRes.step);
      peakActiveTokens = Math.max(peakActiveTokens, commitRes.step.activeTokensAfter);

      if (options.autoEvictOnFinish) {
        const relRes = await engine.releaseSubtopic(
          agent.id,
          matchedSub.id,
          `Task complete; ${agent.name} (${agent.activeModelLabel}) evicted full nodes back into FalkorDB.`
        );
        runSteps.push(relRes.step);
      }

      agentFinalText = `**${agent.name}** (running on **${agent.activeModelLabel}**) scanned the 5 Sub-Topic summaries and ${state.savedPaths.length} shared paths, paged in **${matchedSub.name}** (\`${matchedSub.id}\`), linked a new Decision node to \`${firstExistingNode?.id || 'root'}\`, updated the sub-topic summary to **v${commitRes.subtopic.version}**, and ${options.autoEvictOnFinish ? 'evicted the full sub-topic back into FalkorDB so any subsequent model (Claude, ChatGPT, Gemini) can access it immediately' : 'kept the sub-topic mounted in graph lease storage'}.`;
    }

    if (options.autoEvictOnFinish) {
      const currentAgentState = engine.getState().agents.find((a) => a.id === agent.id);
      if (currentAgentState && currentAgentState.mountedSubtopicIds.length > 0) {
        const stillMounted = [...currentAgentState.mountedSubtopicIds];
        for (const subId of stillMounted) {
          const relRes = await engine.releaseSubtopic(
            agent.id,
            subId,
            `Auto-releasing [${subId}] back into FalkorDB at end of ${agent.name}'s turn.`
          );
          runSteps.push(relRes.step);
        }
      }
    }

    agentSyntheses.push(`### ${agent.name} (${agent.role} — Model: ${agent.activeModelLabel})\n${agentFinalText.trim()}`);
  }

  const completedAt = new Date().toISOString();
  const fullGraphTokensAvoided = Math.max(0, totalGraphTokens - peakActiveTokens);

  const result: AgentRunResult = {
    runId: `run_${Date.now()}`,
    taskPrompt: options.taskPrompt,
    mode: validAgents.length > 1 ? 'multi_agent_handoff' : 'single_agent',
    involvedAgentIds: validAgents.map((a) => a.id),
    modelsUsed: Array.from(modelsUsedSet),
    finalSynthesis: agentSyntheses.join('\n\n---\n\n'),
    steps: runSteps,
    startedAt,
    completedAt,
    peakActiveTokens,
    fullGraphTokensAvoided,
  };

  engine.recordRunResult(result);
  return result;
}

/**
 * Executes a saved multi-stage CustomWorkflow pipeline across agents and models sequentially.
 */
export async function runCustomWorkflow(
  engine: GraphMemoryEngine,
  workflowId: string
): Promise<AgentRunResult> {
  const state = engine.getState();
  const wf = state.workflows.find((w) => w.id === workflowId);
  if (!wf) {
    throw new Error(`Workflow "${workflowId}" not found.`);
  }

  const startedAt = new Date().toISOString();
  const combinedSteps: PagingTraceStep[] = [];
  const involvedAgentIds: string[] = [];
  const modelsUsedSet = new Set<string>();
  const stageSummaries: string[] = [];
  let peakActiveTokens = 0;

  for (let idx = 0; idx < wf.stages.length; idx++) {
    const stage = wf.stages[idx];
    const agent = engine.getState().agents.find((a) => a.id === stage.agentId) || engine.getState().agents[0];
    if (!agent) continue;

    if (!involvedAgentIds.includes(agent.id)) {
      involvedAgentIds.push(agent.id);
    }

    // If stage specifies a model override different from current agent model, hot-swap first!
    if (stage.modelOverrideId && stage.modelOverrideId !== agent.activeModelId) {
      const swapRes = await engine.switchAgentModel(agent.id, stage.modelOverrideId);
      combinedSteps.push(swapRes.step);
      modelsUsedSet.add(swapRes.newModel);
    } else {
      modelsUsedSet.add(agent.activeModelLabel);
    }

    const stageRun = await runAgentMemoryTask(engine, {
      taskPrompt: `[Workflow "${wf.name}" — Stage ${idx + 1}/${wf.stages.length}]: ${stage.instruction}`,
      agentIds: [agent.id],
      autoEvictOnFinish: stage.autoReleaseAfterStage,
    });

    combinedSteps.push(...stageRun.steps);
    peakActiveTokens = Math.max(peakActiveTokens, stageRun.peakActiveTokens);
    for (const m of stageRun.modelsUsed) {
      modelsUsedSet.add(m);
    }
    stageSummaries.push(`**Stage ${idx + 1} (${agent.name} · ${agent.activeModelLabel})**\n${stageRun.finalSynthesis}`);
  }

  wf.lastRunAt = new Date().toISOString();
  const totalGraphTokens = engine
    .getState()
    .subtopics.reduce((acc, s) => acc + s.fullTokenCount, 0);

  return {
    runId: `wf_run_${Date.now()}`,
    taskPrompt: `Workflow: ${wf.name}`,
    mode: 'multi_agent_handoff',
    involvedAgentIds,
    modelsUsed: Array.from(modelsUsedSet),
    finalSynthesis: stageSummaries.join('\n\n'),
    steps: combinedSteps,
    startedAt,
    completedAt: new Date().toISOString(),
    peakActiveTokens,
    fullGraphTokensAvoided: Math.max(0, totalGraphTokens - peakActiveTokens),
  };
}

/**
 * AI Document / Repo Auto-Partitioner:
 * Takes raw corporate documentation, PRDs, runbooks, or codebase specs and splits them into
 * distinct Graph Sub-Topics, atomic MemoryNodes, and Cross-Topic Paths.
 */
export async function partitionDocumentIntoGraph(
  engine: GraphMemoryEngine,
  params: {
    documentTitle: string;
    rawText: string;
    agentId?: string;
  }
) {
  const title = params.documentTitle.trim() || 'Corporate Specification';
  const text = params.rawText.trim();
  if (!text) {
    throw new Error('Document content cannot be empty.');
  }

  let extractedSubtopics: Array<{
    name: string;
    domain: string;
    summary: string;
    nodes: Array<{
      title: string;
      content: string;
      kind: MemoryNodeKind;
    }>;
  }> = [];

  try {
    const ai = getGenAIClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Partition the following corporate/developer document titled "${title}" into 2 to 4 distinct, non-overlapping graph Sub-Topics for a multi-agent memory graph.
For each Sub-Topic, provide:
- name: Concise sub-topic name
- domain: Functional domain (e.g. Architecture, Security, Data Pipeline, Product SLA, API Contracts)
- summary: 2-sentence executive summary that lets an AI agent know what is inside without loading the full sub-topic
- nodes: 2 to 4 atomic MemoryNodes (kind must be one of: Fact, Decision, Episode, Procedure, Constraint)

Document Text:
${text.slice(0, 12000)}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subtopics: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  domain: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  nodes: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        content: { type: Type.STRING },
                        kind: { type: Type.STRING },
                      },
                      required: ['title', 'content', 'kind'],
                    },
                  },
                },
                required: ['name', 'domain', 'summary', 'nodes'],
              },
            },
          },
          required: ['subtopics'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    if (Array.isArray(parsed.subtopics) && parsed.subtopics.length > 0) {
      extractedSubtopics = parsed.subtopics.map((st: any) => ({
        name: String(st.name || 'Extracted Sub-Topic'),
        domain: String(st.domain || 'Corporate Knowledge'),
        summary: String(st.summary || ''),
        nodes: Array.isArray(st.nodes)
          ? st.nodes.map((n: any) => ({
              title: String(n.title || 'Extracted Fact'),
              content: String(n.content || ''),
              kind: Object.values(MemoryNodeKind).includes(n.kind as MemoryNodeKind)
                ? (n.kind as MemoryNodeKind)
                : MemoryNodeKind.FACT,
            }))
          : [],
      }));
    }
  } catch {
    // Deterministic structural paragraph partitioner fallback
    const paragraphs = text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 20);

    const chunkCount = Math.min(3, Math.max(1, Math.ceil(paragraphs.length / 2)));
    for (let i = 0; i < chunkCount; i++) {
      const slice = paragraphs.slice(i * 2, i * 2 + 2);
      const header = slice[0]?.split(/[.:;\n]/)[0]?.slice(0, 38) || `Section ${i + 1}`;
      extractedSubtopics.push({
        name: `${title}: ${header}`,
        domain: i === 0 ? 'Core Architecture' : i === 1 ? 'Operational Policy' : 'Implementation',
        summary:
          slice.join(' ').slice(0, 210) +
          (slice.join(' ').length > 210 ? '...' : ''),
        nodes: slice.map((para, pIdx) => ({
          title: `${header} — Point ${pIdx + 1}`,
          content: para,
          kind: pIdx === 0 ? MemoryNodeKind.DECISION : MemoryNodeKind.FACT,
        })),
      });
    }
  }

  return engine.ingestPartitionedKnowledge({
    agentId: params.agentId,
    documentTitle: title,
    subtopics: extractedSubtopics,
  });
}

