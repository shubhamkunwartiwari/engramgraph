import React, { useState, useEffect } from 'react';
import {
  EdgeRelationType,
  GraphMemoryState,
  MemoryNodeKind,
} from '../types/memory.ts';
import { X, Copy, Check, Database, RotateCcw } from 'lucide-react';

interface NewSubtopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  agents: GraphMemoryState['agents'];
  onCreateSubtopic: (data: {
    name: string;
    domain: string;
    summary: string;
    createdByAgentId: string;
    initialNodes: Array<{ title: string; content: string; kind: MemoryNodeKind }>;
  }) => Promise<void>;
}

export const NewSubtopicModal: React.FC<NewSubtopicModalProps> = ({
  isOpen,
  onClose,
  agents,
  onCreateSubtopic,
}) => {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('Edge & Caching');
  const [summary, setSummary] = useState('');
  const [createdByAgentId, setCreatedByAgentId] = useState(agents[0]?.id || 'agent_atlas');
  const [nodeTitle, setNodeTitle] = useState('');
  const [nodeContent, setNodeContent] = useState('');
  const [nodeKind, setNodeKind] = useState<MemoryNodeKind>(MemoryNodeKind.DECISION);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !summary.trim()) return;
    setSubmitting(true);
    try {
      await onCreateSubtopic({
        name: name.trim(),
        domain: domain.trim(),
        summary: summary.trim(),
        createdByAgentId,
        initialNodes:
          nodeTitle.trim() && nodeContent.trim()
            ? [{ title: nodeTitle.trim(), content: nodeContent.trim(), kind: nodeKind }]
            : [],
      });
      setName('');
      setSummary('');
      setNodeTitle('');
      setNodeContent('');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-lg border border-slate-700 bg-[#0F1522] text-slate-100">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h3 className="text-sm font-semibold text-white">
            Create New Sub-Topic Partition in Main Graph
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Sub-Topic Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Model Evaluation & Guardrails"
                className="w-full bg-[#0B0F17] border border-slate-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Domain Area
              </label>
              <input
                type="text"
                required
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="e.g., AI Quality & Telemetry"
                className="w-full bg-[#0B0F17] border border-slate-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Sub-Topic Executive Summary (Always visible in Agent Index)
            </label>
            <textarea
              rows={3}
              required
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Write a concise 2-sentence summary so agents know when to page in this sub-topic..."
              className="w-full bg-[#0B0F17] border border-slate-800 p-3 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Authoring Agent
            </label>
            <select
              value={createdByAgentId}
              onChange={(e) => setCreatedByAgentId(e.target.value)}
              className="w-full bg-[#0B0F17] border border-slate-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {a.role}
                </option>
              ))}
            </select>
          </div>

          <div className="border-t border-slate-800 pt-3 space-y-3">
            <div className="text-xs font-medium text-slate-300">
              Initial Memory Node Inside Sub-Topic (Optional)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={nodeTitle}
                onChange={(e) => setNodeTitle(e.target.value)}
                placeholder="Memory Node Title"
                className="sm:col-span-2 bg-[#0B0F17] border border-slate-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
              <select
                value={nodeKind}
                onChange={(e) => setNodeKind(e.target.value as MemoryNodeKind)}
                className="bg-[#0B0F17] border border-slate-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                {Object.values(MemoryNodeKind).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              rows={2}
              value={nodeContent}
              onChange={(e) => setNodeContent(e.target.value)}
              placeholder="Detailed fact, decision, or procedure stored inside this sub-topic..."
              className="w-full bg-[#0B0F17] border border-slate-800 p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {submitting ? 'Creating Partition…' : 'Create Sub-Topic'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface MutateSubtopicModalProps {
  isOpen: boolean;
  subtopicId: string | null;
  state: GraphMemoryState;
  selectedAgentId: string;
  onClose: () => void;
  onMutateSubtopic: (data: {
    agentId: string;
    subtopicId: string;
    newNodes: Array<{
      title: string;
      content: string;
      kind: MemoryNodeKind;
      connectToNodeId?: string;
      relationType?: EdgeRelationType;
      edgeRationale?: string;
    }>;
    updatedSummary: string;
    commitMessage: string;
  }) => Promise<void>;
}

export const MutateSubtopicModal: React.FC<MutateSubtopicModalProps> = ({
  isOpen,
  subtopicId,
  state,
  selectedAgentId,
  onClose,
  onMutateSubtopic,
}) => {
  const subtopic = state.subtopics.find((s) => s.id === subtopicId) || state.subtopics[0];
  const [agentId, setAgentId] = useState(selectedAgentId);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [kind, setKind] = useState<MemoryNodeKind>(MemoryNodeKind.DECISION);
  const [connectToNodeId, setConnectToNodeId] = useState<string>('');
  const [relationType, setRelationType] = useState<EdgeRelationType>(EdgeRelationType.DEPENDS_ON);
  const [edgeRationale, setEdgeRationale] = useState('');
  const [updatedSummary, setUpdatedSummary] = useState(subtopic?.summary || '');
  const [commitMessage, setCommitMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (subtopic) {
      setUpdatedSummary(subtopic.summary);
    }
    setAgentId(selectedAgentId);
  }, [subtopic, selectedAgentId]);

  if (!isOpen || !subtopic) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSubmitting(true);
    try {
      await onMutateSubtopic({
        agentId,
        subtopicId: subtopic.id,
        newNodes: [
          {
            title: title.trim(),
            content: content.trim(),
            kind,
            connectToNodeId: connectToNodeId || undefined,
            relationType,
            edgeRationale: edgeRationale.trim() || undefined,
          },
        ],
        updatedSummary: updatedSummary.trim(),
        commitMessage: commitMessage.trim() || `Added ${kind}: ${title.trim()}`,
      });
      setTitle('');
      setContent('');
      setEdgeRationale('');
      setCommitMessage('');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-xl border border-slate-700 bg-[#0F1522] text-slate-100">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Commit Graph Memory & Refresh Summary: {subtopic.name}
            </h3>
            <p className="text-xs text-slate-400">
              Sub-Topic ID: <span className="font-mono text-emerald-400">{subtopic.id}</span> · Current Revision: v{subtopic.version}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Committing Agent
              </label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="w-full bg-[#0B0F17] border border-slate-800 px-3 py-2 text-xs text-white"
              >
                {state.agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.role})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Memory Node Classification
              </label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as MemoryNodeKind)}
                className="w-full bg-[#0B0F17] border border-slate-800 px-3 py-2 text-xs text-white"
              >
                {Object.values(MemoryNodeKind).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              New Memory Node Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Enforce Circuit Breaker on Cross-Subtopic Traversals"
              className="w-full bg-[#0B0F17] border border-slate-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Detailed Node Content (Stored inside Sub-Topic)
            </label>
            <textarea
              rows={3}
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Specify the technical fact, architectural decision, incident episode, or constraint..."
              className="w-full bg-[#0B0F17] border border-slate-800 p-3 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Semantic Edge Linker (Intra- or Cross-SubTopic) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-800 pt-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Link to Existing Memory Node (Optional)
              </label>
              <select
                value={connectToNodeId}
                onChange={(e) => setConnectToNodeId(e.target.value)}
                className="w-full bg-[#0B0F17] border border-slate-800 px-3 py-2 text-xs text-white"
              >
                <option value="">— No edge link —</option>
                {state.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    [{n.subtopicId}] {n.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Edge Relationship Type
              </label>
              <select
                value={relationType}
                onChange={(e) => setRelationType(e.target.value as EdgeRelationType)}
                disabled={!connectToNodeId}
                className="w-full bg-[#0B0F17] border border-slate-800 px-3 py-2 text-xs text-white disabled:opacity-40"
              >
                {Object.values(EdgeRelationType).map((rel) => (
                  <option key={rel} value={rel}>
                    {rel}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3">
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Updated Sub-Topic Summary (v{subtopic.version + 1} — Visible to All Agents)
            </label>
            <textarea
              rows={3}
              required
              value={updatedSummary}
              onChange={(e) => setUpdatedSummary(e.target.value)}
              className="w-full bg-[#0B0F17] border border-slate-800 p-3 text-xs text-emerald-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {submitting ? 'Committing to Graph…' : `Commit & Bump to v${subtopic.version + 1}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface FalkorConfigDrawerProps {
  isOpen: boolean;
  state: GraphMemoryState;
  onClose: () => void;
  onConnectFalkor: (url: string, graphName: string) => Promise<void>;
  onResetGraph: () => Promise<void>;
}

export const FalkorConfigDrawer: React.FC<FalkorConfigDrawerProps> = ({
  isOpen,
  state,
  onClose,
  onConnectFalkor,
  onResetGraph,
}) => {
  const [url, setUrl] = useState(
    state.falkorEndpoint.startsWith('redis') ? state.falkorEndpoint : 'redis://localhost:6379'
  );
  const [graphName, setGraphName] = useState('engram_multi_agent_memory');
  const [cypherScript, setCypherScript] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/graph/export-cypher')
        .then((r) => r.json())
        .then((d) => {
          if (d.cypher) setCypherScript(d.cypher);
        })
        .catch(() => {});
    }
  }, [isOpen, state.nodes.length, state.subtopics.length]);

  if (!isOpen) return null;

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      await onConnectFalkor(url.trim(), graphName.trim());
      setStatusMsg(`Connected to ${url.trim()} and synced graph '${graphName.trim()}'.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not reach FalkorDB instance.');
    } finally {
      setConnecting(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(cypherScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-2xl border border-slate-700 bg-[#0F1522] text-slate-100">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">
              FalkorDB Storage Engine & Cypher Schema Export
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[82vh] overflow-y-auto">
          <form onSubmit={handleConnect} className="space-y-3 border-b border-slate-800 pb-5">
            <div className="text-xs text-slate-300 leading-relaxed">
              EngramGraph persists all graph mutations immediately via its built-in persistent Cypher engine and can simultaneously mirror every <code className="font-mono text-emerald-400">MATCH / MERGE / CREATE</code> query to a live FalkorDB Docker or FalkorDB Cloud instance.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  FalkorDB Endpoint URI
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="redis://localhost:6379"
                  className="w-full bg-[#0B0F17] border border-slate-800 px-3 py-2 font-mono text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Multigraph Namespace
                </label>
                <input
                  type="text"
                  value={graphName}
                  onChange={(e) => setGraphName(e.target.value)}
                  className="w-full bg-[#0B0F17] border border-slate-800 px-3 py-2 font-mono text-xs text-white"
                />
              </div>
            </div>

            {statusMsg && <p className="text-xs text-emerald-400">{statusMsg}</p>}
            {errorMsg && <p className="text-xs text-amber-400">{errorMsg}</p>}

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={onResetGraph}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 text-slate-300 hover:text-white transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Graph to Default Seed
              </button>

              <button
                type="submit"
                disabled={connecting}
                className="px-4 py-2 text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                {connecting ? 'Connecting…' : 'Connect & Sync Live FalkorDB'}
              </button>
            </div>
          </form>

          {/* Complete FalkorDB Cypher Dump */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">
                Complete FalkorDB Cypher Graph Script ({state.subtopics.length} Sub-Topics, {state.nodes.length} Nodes, {state.edges.length} Edges)
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-slate-800 text-slate-200 hover:bg-slate-700"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied Cypher' : 'Copy Cypher Script'}
              </button>
            </div>
            <pre className="bg-[#0B0F17] border border-slate-800 p-3.5 font-mono text-[11px] text-emerald-300 max-h-64 overflow-y-auto leading-relaxed">
              {cypherScript || '// Loading Cypher script...'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

interface IngestDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  agents: GraphMemoryState['agents'];
  onIngestDocument: (payload: {
    documentTitle: string;
    rawText: string;
    agentId: string;
  }) => Promise<void>;
}

const SAMPLE_CORPORATE_SPEC = `Payment Settlement & Ledger Architecture v2
All cross-border merchant payouts route through the ISO-20022 settlement bus with a strict 250ms idempotency lock in Redis/FalkorDB. Failed webhook deliveries retry with exponential backoff up to 5 times before moving to the dead-letter queue.

Compliance & PCI-DSS Vaulting Rules
Raw PAN and CVV data must never enter LLM context windows or application logs. All payment agents operate strictly on tokenized vault references (tok_live_*) governed by rotating KMS keys every 24 hours.

Dispute & Chargeback Automation Runbook
When a merchant dispute exceeds $2,500, the Chargeback Triage Agent checks out the Settlement Ledger sub-topic, verifies webhook delivery timestamps, and commits an evidence bundle node before escalating to FinOps.`;

export const IngestDocumentModal: React.FC<IngestDocumentModalProps> = ({
  isOpen,
  onClose,
  agents,
  onIngestDocument,
}) => {
  const [documentTitle, setDocumentTitle] = useState('Merchant Payments & PCI Architecture');
  const [rawText, setRawText] = useState(SAMPLE_CORPORATE_SPEC);
  const [agentId, setAgentId] = useState(agents[0]?.id || '');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (agents[0] && !agentId) {
      setAgentId(agents[0].id);
    }
  }, [agents, agentId]);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocumentTitle(file.name.replace(/\.[^.]+$/, ''));
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setRawText(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawText.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onIngestDocument({
        documentTitle: documentTitle.trim() || 'Ingested Specification',
        rawText: rawText.trim(),
        agentId: agentId || agents[0]?.id || '',
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-xl border border-slate-700 bg-[#0F1522] text-slate-100 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h3 className="text-sm font-semibold text-white">
            Ingest Docs / Repo Specs → Auto-Partition into Graph
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-xs text-slate-400 leading-relaxed">
            Paste raw PRDs, architecture specs, runbooks, or upload a <code className="font-mono text-emerald-300">.md / .txt</code> file. EngramGraph automatically splits the content into distinct Sub-Topics, atomic Memory Nodes, and a cross-topic traversal path.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Document / Spec Title
              </label>
              <input
                type="text"
                required
                value={documentTitle}
                onChange={(e) => setDocumentTitle(e.target.value)}
                placeholder="e.g., Payment Settlement Architecture"
                className="w-full bg-[#0B0F17] border border-slate-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Upload .md / .txt File (Optional)
              </label>
              <input
                type="file"
                accept=".md,.txt,.json,.csv"
                onChange={handleFileUpload}
                className="w-full bg-[#0B0F17] border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-300 file:mr-2 file:py-0.5 file:px-2 file:rounded file:border-0 file:text-xs file:bg-slate-800 file:text-emerald-300"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-300">
                Raw Document / Codebase Specification
              </label>
              <button
                type="button"
                onClick={() => {
                  setDocumentTitle('Merchant Payments & PCI Architecture');
                  setRawText(SAMPLE_CORPORATE_SPEC);
                }}
                className="text-[11px] text-emerald-400 hover:underline"
              >
                Load Sample FinTech Spec
              </button>
            </div>
            <textarea
              rows={7}
              required
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste your company documentation, system architecture, or codebase rules..."
              className="w-full bg-[#0B0F17] border border-slate-800 rounded p-3 text-xs text-white font-mono leading-relaxed focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="tactile-emerald px-4 py-2 rounded-md text-xs font-semibold disabled:opacity-50"
            >
              {submitting ? 'Partitioning into Sub-Topics…' : 'Auto-Partition & Commit to Graph'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface NewWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateWorkspace: (payload: {
    name: string;
    description: string;
    template: 'blank' | 'enterprise_sample';
  }) => Promise<void>;
}

export const NewWorkspaceModal: React.FC<NewWorkspaceModalProps> = ({
  isOpen,
  onClose,
  onCreateWorkspace,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [template, setTemplate] = useState<'blank' | 'enterprise_sample'>('blank');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onCreateWorkspace({
        name: name.trim(),
        description: description.trim(),
        template,
      });
      setName('');
      setDescription('');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-md border border-slate-700 bg-[#0F1522] text-slate-100 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h3 className="text-sm font-semibold text-white">
            Create New Corporate Graph Workspace
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Workspace / Project Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., FinOps Production Agents"
              className="w-full bg-[#0B0F17] border border-slate-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Workspace Purpose
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Shared memory graph for our billing and compliance agents"
              className="w-full bg-[#0B0F17] border border-slate-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">
              Starting Graph Template
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setTemplate('blank')}
                className={`p-3 rounded border text-left transition-colors ${
                  template === 'blank'
                    ? 'bg-[#162235] border-emerald-500/70 text-white'
                    : 'bg-[#0B0F17] border-slate-800 text-slate-400'
                }`}
              >
                <div className="text-xs font-semibold">Blank Workspace</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Start clean & ingest your own docs
                </div>
              </button>
              <button
                type="button"
                onClick={() => setTemplate('enterprise_sample')}
                className={`p-3 rounded border text-left transition-colors ${
                  template === 'enterprise_sample'
                    ? 'bg-[#162235] border-emerald-500/70 text-white'
                    : 'bg-[#0B0F17] border-slate-800 text-slate-400'
                }`}
              >
                <div className="text-xs font-semibold">Cloud Reference</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Pre-loaded 5 sub-topics & 4 agents
                </div>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="tactile-emerald px-4 py-2 rounded-md text-xs font-semibold disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

