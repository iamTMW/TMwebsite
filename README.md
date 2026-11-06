# Taha Mohyuddin — Personal Portfolio

Source for [tahamohyuddin.com](https://tahamohyuddin.com).

**Tech:** Hand-built HTML, CSS, JavaScript, static assets, Vercel hosting.

## 2026 portfolio refinement

This update improves the **existing** dark editorial website rather than replacing it with a generic template. It preserves the warm amber palette, original photography, image-led project previews, and personal story.

### What changes

- Four clear primary destinations: **Home, Projects, About, Contact**.
- Personal photo hero with more purposeful copy aligned to software engineering, business systems, and product development.
- A concise **numbers strip** with disclosed personal metrics: 3.7 GPA, 20+ associates led, eight Scrum sprints on a team project, four featured applications.
- E-Commerce Analytics presented first, with team contribution and CI/CD details.
- Numbered project writeups for EduPro, GradeManagerPlus, vCard Manager, and Investment Portfolio Manager.
- Clearer About story, accurate education and retail scope, and retained portrait/cricket photography.
- More focused technical skills, contact methods, SEO metadata, and mobile layout.

### What stays

- `styles.css`: original design, now with refinement styles appended.
- `app.js`: original behaviours, with clean URL navigation fixed.
- Existing image assets and historic pages remain in version control.
- Original project Git history and team credit stay intact.

The old `services.html` URL directs readers to the newer About / Experience section. Legacy blog, testimonials and standalone project pages remain in the repository but are not linked in the primary navigation; those can be reviewed for further cleanup later.

## Local preview

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/index.html`. Or in VS Code, use a local preview / Live Server extension.

To check out the review branch:

```bash
git fetch origin
git switch --track origin/enhance/original-portfolio-2026
```

If already created locally: `git switch enhance/original-portfolio-2026`.

## Review checklist

- [ ] Inspect homepage, Projects, About and Contact on desktop and mobile.
- [ ] Confirm that the original images display correctly.
- [ ] Check external GitHub, LinkedIn and email links.
- [ ] Review numerical claims and descriptions for accuracy.
- [ ] Decide whether internal sales figures can be shared with explicit authorization; they are deliberately **not** published in this update.
- [ ] Review the public resume PDF; the redesigned primary navigation no longer promotes an unverified older copy.
- [ ] Approve the pull request before deployment.

This portfolio distinguishes collaboratively built applications from individual work, and it does not claim unsupported outcome metrics.
