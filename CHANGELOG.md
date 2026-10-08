# Changelog & Dataset Version History — EngramGraph Benchmark Suite

Latest release (v4.2.0) archived under DOI [`10.5281/zenodo.23250573`](https://doi.org/10.5281/zenodo.23250573) (Concept DOI: [`10.5281/zenodo.23246756`](https://doi.org/10.5281/zenodo.23246756)).

---

## [v4.2.0] — 2026-10-08 (Comparative Empirical Study & Practical Application Guide)
### Changed
- **Reframed Paper & Repository as an Objective Comparative Study:** Updated manuscript title to *"When Does Sub-Graph Paging Help? An Empirical Comparison of Full-Context, Top-K, Personalized PageRank, and Summary-Indexed Graph Memory for Multi-Agent Systems"*.
- **Added Research Questions (RQ1–RQ3) & Four Core Empirical Findings:** Explicitly documents where Full Context dominates ($\le 144$ nodes), why naive 2-sentence summary paging (`EngramGraph v1`) degrades at scale (`30.0%` at `800` nodes), how Entity-Anchor Footers + 1-Hop Bidirectional Bridge Closure + Anchor-Seeded Subgraph Projection (`EngramGraph v2`) recover `86.7%–88.3%` complete-chain recall (`95.6%–96.1%` node recall) at `77.2%–87.7%` lower active token cost, and the architectural trade-off between read-only Global PPR (`93.3%–98.3%`) and read/write partitioned sub-topic OCC leases (`EngramGraph v2`).
- **Added Table 4 (Practical Application Decision Matrix):** Maps four real-world workload regimes to their recommended retrieval architecture.
- **Zero-Dependency Base LaTeX (`PAPER.tex`):** Uses standard LaTeX2e + `graphicx` (`\resizebox{\textwidth}{!}`) so `PAPER.tex` compiles cleanly with 0 errors in any default Overleaf starter project.

---

## [v4.1.0] — 2026-10-08 (Genuine In-Process Execution & EngramGraph v2 Algorithmic Upgrade)
### Added
- **Genuine In-Process Benchmark Engine (`server/realBenchmarkRunner.ts`):** Removed all hardcoded benchmark tables and replaced them with live, deterministic TypeScript execution of Full Context, EngramGraph v1 (Naive Summary Routing), EngramGraph v2 (Anchor Footer + 1-Hop Bridge Closure + Subgraph Projection), Flat Top-$K=5$, Budget-Matched Top-$K$, and Budget-Matched HippoRAG-PPR across 300 multi-hop causal queries (`Live` 20 nodes to `Tier-XL` 800 nodes).
- **Ablation & Concurrency Engines:** Added live in-process ablation runner (Table 2) and multi-agent Optimistic Concurrency Control (OCC) simulation engine (Table 3).
