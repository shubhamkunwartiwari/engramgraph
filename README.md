# EngramGraph: Comparative Evaluation of Full-Context, Top-K, Personalized PageRank, and Summary-Indexed Sub-Graph Paging

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23250573.svg)](https://doi.org/10.5281/zenodo.23250573)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-4.2.0-indigo.svg)](./CHANGELOG.md)

**Paper Title:** *When Does Sub-Graph Paging Help? An Empirical Comparison of Full-Context, Top-K, Personalized PageRank, and Summary-Indexed Graph Memory for Multi-Agent Systems*

**Author:** Shubham Kunwar Tiwary (Department of Artificial Intelligence and Data Science) · ORCID: [`0009-0004-8262-7647`](https://orcid.org/0009-0004-8262-7647)

---

## Overview & Empirical Findings

This repository contains the open-source reference implementation, deterministic multi-tier benchmark suite (`server/realBenchmarkRunner.ts`), and interactive workspace for evaluating four competing retrieval paradigms for multi-agent software engineering memory under identical compact tuple serialization (`25 tok/node`) across five scale tiers (`20` to `800` nodes, `300` multi-hop causal queries):

1. **Small Graphs ($\le 144$ nodes / $\le 3.6\text{k}$ compact tokens): Full Context Dominates.**
   When the compact workspace fits comfortably inside the prompt (`500–3,600` tokens), serializing the **Full Context** achieves `100%` path coverage and `100%` node recall with zero routing overhead. Paging architectures are unnecessary at this scale.
2. **Why Naive Summary Paging Fails at Scale (`EngramGraph v1`):**
   Routing solely on compressed 2-sentence sub-topic summaries works on small graphs (`95.0%` at `20` nodes) but degrades to **`58.3%`** at `384` nodes and **`30.0%`** at `800` nodes (`33.3%` node recall) due to *summary compression loss* (specific leaf identifiers omitted from prose summaries) and *unmounted cross-topic bridge hops*.
3. **Recovering Multi-Hop Accuracy Under Paging (`EngramGraph v2`):**
   Augmenting summary routing with an **Entity-Anchor Index Footer** (`+12 tok/sub-topic`), **1-Hop Bidirectional Bridge Closure**, and **Anchor-Seeded Subgraph Projection** ($\tau_{\text{cap}}=60$) recovers complete-chain recall to **`86.7%` at `384` nodes (`95.6%` node coverage)** and **`88.3%` at `800` nodes (`96.1%` node coverage)** while reducing active prompt tokens by **`77.2%` to `87.7%`** (`2,456` vs. `20,000` compact tokens; `96.5%` reduction vs. `70.4k` raw JSON). It also outperforms equal-budget Flat Top-$K$ by **`+20.0 pp` to `+26.6 pp`** (`McNemar p < 0.001`).
4. **Read-Only Global Graph vs. Read/Write Multi-Agent Concurrency:**
   For **read-only** multi-hop queries over large static graphs, **Budget-Matched HippoRAG (Global Personalized PageRank)** achieves the highest non-full-context recall (`98.3%` at `384` nodes; `93.3%` at `800` nodes) because random walks traverse all global edges without partition boundaries. However, Global PPR operates over an unpartitioned graph and provides no write isolation. When concurrent agents mutate shared memory, **`EngramGraph v2`** provides sub-topic lease scoping and **Optimistic Concurrency Control (OCC)** ($72.2\%–75.0\%$ syntactic auto-merge, $22.2\%–27.8\%$ semantic supersession rebase, `0` silent lost updates).

---

## Practical Application Decision Matrix

| Workload Regime & Graph Scale | Recommended Architecture | Active Token Cost | Multi-Hop Chain Recall | Key Engineering Trade-Off & Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **Small Project / Single Microservice** (`<= 144` nodes, `<= 3.6k` compact tok) | **Full-Context Compact Serialization** | `500 - 3,600` tok | **`100.0%`** (`100%` node cov.) | Zero routing latency, zero indexing overhead, and guaranteed `100%` recall. Sub-graph paging is unnecessary overhead at this scale. |
| **Strict Token Budget / Single-Hop Entity Lookup** (`<= 125` tok budget) | **Flat Top-K=5 Lexical / Vector** | `125` tok | `20.0% - 60.0%` (`61% - 82%` node) | Minimal memory footprint and fastest single-call lookup, but misses intermediate causal bridge nodes on 3-hop chains. |
| **Large Read-Only Knowledge Base / Static Audit** (`384 - 800+` nodes, single writer) | **Budget-Matched HippoRAG (Global PPR)** | `2,188 - 2,456` tok | **`93.3% - 98.3%`** (`98.3% - 99.4%` node) | Highest multi-hop recall under a token cap (`87.7%` savings vs. Full Context), but requires full-graph adjacency in memory and lacks write isolation. |
| **Large Concurrent Multi-Agent Read/Write Workspace** (`384 - 800+` nodes, `2 - 16` writers) | **EngramGraph v2 (Anchor + Bridge + OCC)** | `2,188 - 2,456` tok | **`86.7% - 88.3%`** (`95.6% - 96.1%` node) | Outperforms equal-budget Top-K by `+20.0 to +26.6 pp`, cuts active tokens by `77.2% - 87.7%`, and provides sub-topic write leases with `0` lost updates. |

---

## Genuine In-Process Empirical Benchmark Results (v4.2.0)

All retrieval metrics below are computed by executing the actual TypeScript algorithms in `server/realBenchmarkRunner.ts` over real in-memory graph structures (`300` multi-hop causal path queries across `5` tiers):

| Tier (`|V|`, `|E|`, `k`) | Full Context (Compact / JSON) | Engram v1 (Naive Summary) | Engram v2 (Anchor+Bridge) | Flat Top-K=5 (`125` tok) | Budget Top-K (Matched `K`) | HippoRAG-PPR (Matched `K`) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Live** (`20, 22, 4`) | `500 / 1,760` (`100%`) | `369` (`95.0%`) | **`356` (`100.0%`)** | `125` (`60.0%`) | `356` (`95.0%`) | `356` (`100.0%`) |
| **Tier-S** (`48, 58, 6`) | `1,200 / 4,224` (`100%`) | `640` (`85.0%`) | **`871` (`95.0%`)** | `125` (`52.5%`) | `871` (`87.5%`) | `871` (`97.5%`) |
| **Tier-M** (`144, 180, 12`) | `3,600 / 12,672` (`100%`) | `1,069` (`75.0%`) | **`1,719` (`95.0%`)** | `125` (`45.0%`) | `1,719` (`76.7%`) | `1,719` (`96.7%`) |
| **Tier-L** (`384, 490, 24`) | `9,600 / 33,792` (`100%`) | `1,448` (`58.3%`) | **`2,188` (`86.7%`)** | `125` (`30.0%`) | `2,188` (`66.7%`) | `2,188` (`98.3%`) |
| **Tier-XL** (`800, 1,040, 40`) | `20,000 / 70,400` (`100%`) | `1,895` (`30.0%`) | **`2,456` (`88.3%`)** | `125` (`20.0%`) | `2,456` (`61.7%`) | `2,456` (`93.3%`) |

---

## Reproducing the Empirical Benchmarks

```bash
# Install dependencies
npm install

# Start the full-stack server and interactive benchmark suite on port 3000
npm run dev

# Trigger a live in-process execution of all 300 multi-hop queries across all 5 tiers
curl -X POST http://localhost:3000/api/benchmarks/run-real
```

## Citation

See [`CITATION.cff`](./CITATION.cff) or cite directly:

```bibtex
@article{tiwary2026engramgraph,
  title   = {When Does Sub-Graph Paging Help? An Empirical Comparison of Full-Context, Top-K, Personalized PageRank, and Summary-Indexed Graph Memory for Multi-Agent Systems},
  author  = {Tiwary, Shubham Kunwar},
  year    = {2026},
  version = {4.2.0},
  doi     = {10.5281/zenodo.23250573},
  url     = {https://doi.org/10.5281/zenodo.23250573}
}
```
