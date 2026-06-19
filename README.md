# Lab

Interactive teaching labs & toys, split out of the main site
([zichaoyang.com](https://zichaoyang.com/)) into their own repo + subdomain so
they can evolve independently. Lives at **[lab.zichaoyang.com](https://lab.zichaoyang.com/)**.

| Lab | Path |
| --- | --- |
| Quaternion Rotation Lab | `/quaternions/` |
| Physics Simulation Lab | `/physics-simulations/` |
| System Design Lab | `/system-design-lab/` |

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
- `src/pages/{quaternions,physics-simulations,system-design-lab}.astro` — the labs.
- `src/scripts/<lab>/` — per-lab logic; `src/styles/tools/` — per-lab styles.
- `src/components/system-design-lab/` — system-design lab widgets.
- `src/layouts/BaseLayout.astro` + `src/scripts/effects/` — shared shell carried
  over from the main site.
