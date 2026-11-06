# Taha Mohyuddin — Portfolio Website

A focused personal site for software engineering, business systems, and product-oriented roles.

**Live website:** [tahamohyuddin.com](https://tahamohyuddin.com)  
**Source:** HTML, CSS, minimal JavaScript (legacy pages), Vercel static hosting.

## Website structure

The core portfolio is deliberately limited to **four pages**:

| Page | Purpose |
| --- | --- |
| `index.html` | Clear introduction and curated projects |
| `portfolio.html` | Technical project summaries and source links |
| `about.html` | Education, operations leadership, and research |
| `contact.html` | Direct email, GitHub, and LinkedIn links |

The new layout lives in `studio.css`. It does **not** rely on a JavaScript framework or animation library. It includes a responsive menu, keyboard-visible focus styles, semantic landmarks, and reduced-motion support.

Legacy pages and their older `styles.css` / `app.js` are retained for now so existing content remains recoverable. The former Experience page routes readers to the consolidated About section, and retired legacy pages are excluded from search indexing.

## Preview the redesign locally

From the repository directory:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/index.html`. Navigate with the **Home / Work / About / Contact** header links.

### Branch workflow

This redesign is being developed in `redesign/focused-portfolio-2026` until visually reviewed. A pull request lets us compare all content and layout changes before changing the deployed main branch.

If you check out the branch locally:

```bash
git fetch origin
git switch redesign/focused-portfolio-2026
```

If a local tracking branch does not exist, use `git switch --track origin/redesign/focused-portfolio-2026`.

## Publication checklist

- [ ] Review desktop and mobile layouts in a real browser.
- [ ] Confirm all GitHub and LinkedIn links.
- [ ] Review project descriptions and team credit.
- [ ] Verify current resume content before adding a resume download link.
- [ ] Review and remove retired legacy pages/assets after confirming nothing still needs them.
- [ ] Optimize large media assets if they remain linked.
- [ ] Merge redesign PR only when the updated site is approved.

This site emphasizes **real, verifiable work**. In-progress projects are described as prototypes, and collaborative work is credited as such.
