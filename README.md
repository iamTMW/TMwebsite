# Personal Portfolio Website

Source for [tahamohyuddin.com](https://tahamohyuddin.com), built with HTML, CSS, JavaScript, and the original image-led, dark-and-amber visual design.

## Original-site refinements (2026)

This update **keeps the existing website design, photographs, navigation, and content**. It is intentionally **not** a replacement template or a new design system.

What was added or corrected:

- A compact number strip on the home page: **3.7 / 4.0 GPA**, **20+ associates led**, **8 Scrum sprints**, and **~4% reported sales growth**.
- The public **E-Commerce Analytics Platform** in the existing homepage selected-work list and project portfolio, with attribution to the team.
- Current **CIS*4900 independent research on student burnout** in the existing About timeline and Experience carousel, without removing previous research or employment entries.
- A brief mention of a separate receipt-management prototype within an existing in-progress project description (no Mohyu logo).
- Updated 2027 career wording, corrected education details, and added missing skills such as Spring Boot, MariaDB, Docker, and GitLab CI/CD.
- Minor favicon fixes and current-page navigation handling for Vercel clean URLs.

### Important note about the sales-growth metric

The **~4%** figure is presented as an *approximate reported team outcome*, not a direct attribution to one individual. Confirm the measurement period, underlying source, and permission to share before merging this change publicly. No confidential dollar sales figures are included.

### Existing assets and layout

All existing page sections, personal photographs, cricket content, employment cards, testimonial and notes pages, and original project imagery have been retained. The CSS changes are **additions to** the existing `styles.css`, not a redesign.

## Local preview

From the repository root:

```bash
python3 scripts/preview.py
```

Open `http://localhost:8000/index.html`.

To inspect this specific branch in VS Code:

```bash
git fetch origin
git switch --track origin/refine/keep-original-site-2026
```

If the local branch already exists, use `git switch refine/keep-original-site-2026` instead. Preserve any uncommitted local edits before switching branches.

## Review before merging

- [ ] Check layout on desktop and mobile.
- [ ] Verify the 4% figure and public-sharing permission.
- [ ] Check new E-Commerce project links and existing image assets.
- [ ] Review any legacy experience descriptions for accuracy.
- [ ] Confirm the live contact form and resume PDF still meet your needs.

This is a small, additive enhancement to the official website, not a deletion or replacement.

## Quality checks

Automated checks run on every pull request:

- Internal links, assets, HTML metadata and anchors: `python3 scripts/verify_site.py`
- JavaScript syntax: `node --check app.js`
- Desktop and mobile browser smoke checks: `python3 scripts/browser_smoke.py` (requires Playwright and Chromium)

The browser suite checks primary and legacy pages, photo loading, horizontal overflow, About tabs, Experience cards, the mobile navigation sheet, and contact-form feedback **with a mocked submission**. It does **not** send a real message or prove that FormSubmit has been activated.

Check the **Portfolio quality checks** workflow on GitHub and review the screenshot artifact before approving deployment.

## Publishing notes

The public pages retain all their original photos and sections. The visible website copy avoids long, formulaic dash punctuation. E-Commerce Analytics is shown as a team project, and the EduPro source repository is linked instead of claiming an unverified live demo.

A real form delivery test, review of older experience claims, and confirmation that the reported ~4% sales metric can be shared are still needed.
