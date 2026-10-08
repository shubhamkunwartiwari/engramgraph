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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-3xl theme-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-500/15 px-6 py-4">
          <h3 className="text-sm font-bold">New Sub-Topic Bubble</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full theme-text-secondary hover:opacity-75"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium theme-text-secondary mb-1">
                Sub-Topic Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Model Evaluation"
                className="w-full rounded-2xl theme-elevated px-3.5 py-2 text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium theme-text-secondary mb-1">
                Domain Area
              </label>
              <input
                type="text"
                required
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="e.g., AI Quality"
                className="w-full rounded-2xl theme-elevated px-3.5 py-2 text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium theme-text-secondary mb-1">
              2-Sentence Summary (Always in Agent Index)
            </label>
            <textarea
              rows={3}
              required
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Write a short summary so agents know when to pull this sub-topic..."
              className="w-full rounded-2xl theme-elevated p-3.5 text-xs focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="border-t border-slate-500/15 pt-3 space-y-3">
            <div className="text-xs font-medium theme-text-secondary">
              Initial Memory Node (Optional)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={nodeTitle}
                onChange={(e) => setNodeTitle(e.target.value)}
                placeholder="Memory Title"
                className="sm:col-span-2 rounded-2xl theme-elevated px-3.5 py-2 text-xs focus:outline-none"
              />
              <select
                value={nodeKind}
                onChange={(e) => setNodeKind(e.target.value as MemoryNodeKind)}
                className="rounded-2xl theme-elevated px-3 py-2 text-xs focus:outline-none"
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
              placeholder="Detailed fact, decision, or procedure..."
              className="w-full rounded-2xl theme-elevated p-3 text-xs focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="bubble-btn px-4 py-2 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bubble-emerald px-5 py-2 text-xs font-semibold disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create Sub-Topic'}
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
  const [relationType, setRelationType] = useState<EdgeRelationType>(
    EdgeRelationType.DEPENDS_ON
  );
  const [updatedSummary, setUpdatedSummary] = useState(subtopic?.summary || '');
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
            relationType: connectToNodeId ? relationType : undefined,
          },
        ],
        updatedSummary: updatedSummary.trim(),
        commitMessage: `Added ${kind} node "${title.trim()}"`,
      });
      setTitle('');
      setContent('');
      setConnectToNodeId('');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-3xl theme-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-500/15 px-6 py-4">
          <h3 className="text-sm font-bold">Add Memory to {subtopic.name}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full theme-text-secondary hover:opacity-75"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Memory Title"
              className="sm:col-span-2 rounded-2xl theme-elevated px-3.5 py-2 text-xs focus:outline-none"
            />
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as MemoryNodeKind)}
              className="rounded-2xl theme-elevated px-3 py-2 text-xs focus:outline-none"
            >
              {Object.values(MemoryNodeKind).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>

          <textarea
            rows={3}
            required
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Detailed finding, rule, or decision to store inside this sub-topic..."
            className="w-full rounded-2xl theme-elevated p-3.5 text-xs focus:outline-none"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium theme-text-secondary mb-1">
                Link to Existing Node (Optional)
              </label>
              <select
                value={connectToNodeId}
                onChange={(e) => setConnectToNodeId(e.target.value)}
                className="w-full rounded-2xl theme-elevated px-3 py-2 text-xs focus:outline-none"
              >
                <option value="">— No link —</option>
                {state.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium theme-text-secondary mb-1">
                Relationship Type
              </label>
              <select
                value={relationType}
                onChange={(e) => setRelationType(e.target.value as EdgeRelationType)}
                disabled={!connectToNodeId}
                className="w-full rounded-2xl theme-elevated px-3 py-2 text-xs disabled:opacity-50"
              >
                {Object.values(EdgeRelationType).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium theme-text-secondary mb-1">
              Updated Sub-Topic Summary (v{subtopic.version + 1})
            </label>
            <textarea
              rows={2}
              required
              value={updatedSummary}
              onChange={(e) => setUpdatedSummary(e.target.value)}
              className="w-full rounded-2xl theme-elevated p-3 text-xs focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="bubble-btn px-4 py-2 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bubble-emerald px-5 py-2 text-xs font-semibold disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save to Graph'}
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
    state.falkorConnected ? state.falkorEndpoint : 'redis://localhost:6379'
  );
  const [graphName, setGraphName] = useState('engram_multi_agent_memory');
  const [cypherScript, setCypherScript] = useState('');
  const [copied, setCopied] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/graph/export-cypher')
        .then((r) => r.json())
        .then((d) => {
          if (d.cypher) setCypherScript(d.cypher);
        })
        .catch(() => {});
    }
  }, [isOpen, state]);

  if (!isOpen) return null;

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    setStatusMsg(null);
    try {
      await onConnectFalkor(url.trim(), graphName.trim());
      setStatusMsg('Connected and synced graph to FalkorDB!');
    } catch (err: any) {
      setStatusMsg(err?.message || 'Using built-in persistent Cypher engine');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl rounded-3xl theme-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-500/15 px-6 py-4">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-bold">FalkorDB Connection & Cypher Export</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full theme-text-secondary hover:opacity-75"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          <form onSubmit={handleConnect} className="space-y-3 border-b border-slate-500/15 pb-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium theme-text-secondary mb-1">
                  FalkorDB Endpoint URI
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="redis://localhost:6379"
                  className="w-full rounded-2xl theme-elevated px-3.5 py-2 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium theme-text-secondary mb-1">
                  Graph Namespace
                </label>
                <input
                  type="text"
                  value={graphName}
                  onChange={(e) => setGraphName(e.target.value)}
                  className="w-full rounded-2xl theme-elevated px-3.5 py-2 font-mono text-xs"
                />
              </div>
            </div>

            {statusMsg && <p className="text-xs text-emerald-500">{statusMsg}</p>}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={onResetGraph}
                className="bubble-btn inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Default Graph
              </button>

              <button
                type="submit"
                disabled={connecting}
                className="bubble-emerald px-5 py-2 text-xs font-semibold disabled:opacity-50"
              >
                {connecting ? 'Connecting…' : 'Sync FalkorDB'}
              </button>
            </div>
          </form>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">FalkorDB Cypher Script</span>
              <button
                type="button"
                onClick={handleCopy}
                className="bubble-btn inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy Cypher'}
              </button>
            </div>
            <pre className="rounded-2xl theme-elevated p-4 font-mono text-[11px] max-h-56 overflow-y-auto leading-relaxed">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl rounded-3xl theme-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-500/15 px-6 py-4">
          <h3 className="text-sm font-bold">
            Ingest Docs → Auto-Split into Graph Bubbles
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full theme-text-secondary hover:opacity-75"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium theme-text-secondary mb-1">
                Document Title
              </label>
              <input
                type="text"
                required
                value={documentTitle}
                onChange={(e) => setDocumentTitle(e.target.value)}
                className="w-full rounded-2xl theme-elevated px-3.5 py-2 text-xs focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium theme-text-secondary mb-1">
                Upload .md / .txt File (Optional)
              </label>
              <input
                type="file"
                accept=".md,.txt,.json,.csv"
                onChange={handleFileUpload}
                className="w-full rounded-2xl theme-elevated px-3 py-1.5 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium theme-text-secondary mb-1">
              Raw Document or Repo Notes
            </label>
            <textarea
              rows={6}
              required
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="w-full rounded-2xl theme-elevated p-3.5 text-xs font-mono leading-relaxed focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="bubble-btn px-4 py-2 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bubble-emerald px-5 py-2 text-xs font-semibold disabled:opacity-50"
            >
              {submitting ? 'Splitting into Sub-Topics…' : 'Auto-Split into Graph'}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-3xl theme-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-500/15 px-6 py-4">
          <h3 className="text-sm font-bold">New Project Workspace</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full theme-text-secondary hover:opacity-75"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium theme-text-secondary mb-1">
              Workspace Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., FinOps Production Graph"
              className="w-full rounded-2xl theme-elevated px-3.5 py-2 text-xs focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium theme-text-secondary mb-1">
              Short Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Shared memory graph for billing agents"
              className="w-full rounded-2xl theme-elevated px-3.5 py-2 text-xs focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setTemplate('blank')}
              className={`p-3.5 rounded-2xl border text-left transition-all ${
                template === 'blank'
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : 'theme-elevated'
              }`}
            >
              <div className="text-xs font-bold">Blank Graph</div>
              <div className="text-[11px] theme-text-secondary mt-0.5">
                Start fresh & ingest docs
              </div>
            </button>
            <button
              type="button"
              onClick={() => setTemplate('enterprise_sample')}
              className={`p-3.5 rounded-2xl border text-left transition-all ${
                template === 'enterprise_sample'
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : 'theme-elevated'
              }`}
            >
              <div className="text-xs font-bold">Sample Graph</div>
              <div className="text-[11px] theme-text-secondary mt-0.5">
                Pre-loaded 5 sub-topics
              </div>
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="bubble-btn px-4 py-2 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bubble-emerald px-5 py-2 text-xs font-semibold disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
