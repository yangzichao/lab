# Lab

Interactive teaching labs & toys, split out of the main site
([zichaoyang.com](https://zichaoyang.com/)) into their own repo + subdomain so
they can evolve independently. Lives at **[lab.zichaoyang.com](https://lab.zichaoyang.com/)**.

| Lab | Path |
| --- | --- |
| Quaternion Rotation Lab | `/quaternions/` |
| URL Shortener Lab | `/system-design/url-shortener/` |
| Rate Limiter Lab | `/system-design/rate-limiter/` |
| News Feed Lab | `/system-design/news-feed/` |
| Chat / Messaging Lab | `/system-design/chat-messaging/` |
| Notification System Lab | `/system-design/notification-system/` |
| Search Autocomplete Lab | `/system-design/search-autocomplete/` |
| Web Crawler Lab | `/system-design/web-crawler/` |
| Video Streaming Lab | `/system-design/video-streaming/` |
| File Sync Lab | `/system-design/file-sync/` |
| Ride Sharing Lab | `/system-design/ride-sharing/` |
| Key-Value Store Lab | `/system-design/kv-store/` |
| Payment Ledger Lab | `/system-design/payment-ledger/` |
| Google Docs Lab | `/system-design/google-docs/` |
| Online Judge Lab | `/system-design/online-judge/` |
| Ad Click Tracking Lab | `/system-design/ad-tracking/` |
| Recommendation System Lab | `/system-design/recommendation-system/` |
| Feature Store Lab | `/system-design/feature-store/` |
| Model Serving Lab | `/system-design/model-serving/` |
| Fraud Detection Lab | `/system-design/fraud-detection/` |
| ML Training Pipeline Lab | `/system-design/ml-training-pipeline/` |
| LLM Pretraining Infra Lab | `/system-design/llm-training-infra/` |
| LLM Inference Lab | `/system-design/llm-inference/` |
| RAG System Lab | `/system-design/rag-system/` |
| RLHF Pipeline Lab | `/system-design/rlhf-pipeline/` |
| Agent Orchestration Lab | `/system-design/agent-orchestration/` |

Physics experiments now live in the separate
**[Sandbox Physics](https://sandboxphysics.com/)** repository and site. Legacy
`/physics/` and `/en/physics/` pages remain here only as static redirect pages.

## Develop

```sh
npm install
npm run dev      # http://localhost:4321
npm run check    # astro type-check
npm run build    # static output to ./dist
```

## Deploy

Pushed to `main` → GitHub Actions builds and publishes to GitHub Pages
(`.github/workflows/deploy.yml`). The custom domain is pinned via `public/CNAME`.

## Layout

- `src/pages/index.astro` — landing page listing the labs.
- `src/pages/quaternions.astro` and `src/pages/system-design/<slug>.astro`
  (core system design, then ML systems, then LLM training/inference/agent
  infrastructure) — the interactive labs.
- Each system design lab is its own page; metadata (page title, nav label, index
  card) lives in `src/scripts/system-design-lab/system-design-pages.ts` and the
  cross-lab nav is `src/components/system-design-lab/SystemDesignLabNav.astro`.
  Adding a data-driven lab is: write its definition under
  `src/scripts/system-design-lab/labs/<slug>-lab.ts` (build the architecture
  diagram with `buildColumnDiagram` from `diagram-layout.ts` instead of
  hand-placing SVG coordinates), register it in `lab-definitions.ts`, add a page,
  and add a `system-design-pages.ts` entry. Most labs ship a `teachingWalkthrough`
  — an ordered Socratic walkthrough whose steps apply scenarios so the diagram,
  meters, and decisions react live (Ad Tracking is the one bespoke exception).
- `src/data/legacy-redirects/physics-lab-redirects.ts` keeps the former physics
  URLs pointed at their matching Sandbox Physics pages.
- `src/scripts/<lab>/` — per-lab logic; `src/styles/<lab>/` — per-lab styles.
- `src/components/system-design-lab/` — system-design lab widgets.
- `src/layouts/BaseLayout.astro` + `src/scripts/effects/` — shared shell carried
  over from the main site.
