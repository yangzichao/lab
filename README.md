# Lab

Interactive teaching labs & toys, split out of the main site
([zichaoyang.com](https://zichaoyang.com/)) into their own repo + subdomain so
they can evolve independently. Lives at **[lab.zichaoyang.com](https://lab.zichaoyang.com/)**.

| Lab | Path |
| --- | --- |
| Geoduck Dig | `/geoduck-dig/` |
| Quaternion Rotation Lab | `/quaternions/` |
| Double Pendulum | `/physics/double-pendulum/` |
| Orbit Lab | `/physics/orbit/` |
| Wave Interference | `/physics/wave-interference/` |
| Ad Click Tracking Lab | `/system-design/ad-tracking/` |
| Google Docs Lab | `/system-design/google-docs/` |
| Online Judge Lab | `/system-design/online-judge/` |
| Rate Limiter Lab | `/system-design/rate-limiter/` |

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
- `src/pages/{geoduck-dig,quaternions}.astro`,
  `src/pages/physics/{double-pendulum,orbit,wave-interference}.astro`, and
  `src/pages/system-design/{ad-tracking,google-docs,online-judge,rate-limiter}.astro`
  — the labs.
- Each system design lab is its own page; metadata (page title, nav label, index
  card) lives in `src/scripts/system-design-lab/system-design-pages.ts` and the
  cross-lab nav is `src/components/system-design-lab/SystemDesignLabNav.astro`.
- Each physics lab is one page driven by a shared shell
  (`src/components/physics-lab/PhysicsLabShell.astro`) and registered in
  `src/scripts/physics-lab/physics-lab-catalog.ts`. Adding a new physics lab is:
  write its `<slug>/` module (physics + render + lab controller under
  `src/scripts/physics-lab/`), add a catalog entry, add a page.
- `src/scripts/physics-lab/shared/` — canvas toolkit, RAF loop, DOM control
  helpers, and formatters reused by every physics lab.
- `src/scripts/<lab>/` — per-lab logic; `src/styles/<lab>/` — per-lab styles.
- `src/components/system-design-lab/` — system-design lab widgets.
- `src/layouts/BaseLayout.astro` + `src/scripts/effects/` — shared shell carried
  over from the main site.
