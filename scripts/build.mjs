#!/usr/bin/env node
/**
 * Static site build. Zero dependencies.
 *
 *   node scripts/build.mjs        -> writes dist/
 *
 * Each file in src/pages/ starts with a page header comment:
 *   <!--page {"title":"…","description":"…","path":"/work","nav":"work"}-->
 * followed by the page's <main> markup. The build wraps it with the shared head,
 * header and footer partials, fingerprints CSS/JS, copies only the images that the
 * output actually references, and writes sitemap.xml and robots.txt.
 *
 * Pages listed in EXCLUDE stay in the repository but are never deployed.
 */
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const SITE = 'https://www.tahamohyuddin.com';
// Vercel Web Analytics loads only when enabled for the project and flagged at build time,
// otherwise /_vercel/insights/script.js returns 404 for every visitor.
const ANALYTICS = process.env.ENABLE_VERCEL_ANALYTICS === '1';

// test.html holds third-party testimonials that have not been re-confirmed for publication.
const EXCLUDE = new Set(['test.html']);

const NAV = [
  ['home', '/', 'Home', 'Start here'],
  ['work', '/work', 'Work', 'Projects and case studies'],
  ['about', '/about', 'About', 'Background, studies, cricket'],
  ['experience', '/experience', 'Experience', 'Roles and responsibilities'],
  ['notes', '/notes', 'Notes', 'Lessons from the job'],
  ['contact', '/contact', 'Contact', 'Get in touch'],
];

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function fail(msg) {
  console.error(`BUILD FAILED: ${msg}`);
  process.exit(1);
}

async function fingerprint(rel) {
  const src = path.join(SRC, 'assets', rel);
  const body = await readFile(src);
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 10);
  const ext = path.extname(rel);
  const out = `/assets/${path.basename(rel, ext)}.${hash}${ext}`;
  await writeFile(path.join(DIST, out), body);
  return out;
}

function navLinks(current, cls) {
  return NAV.map(([key, href, label]) => {
    const here = key === current || (current === 'case' && key === 'work');
    return `<a href="${href}"${here ? ' aria-current="page" class="is-here"' : ''}>${label}</a>`;
  }).join('\n      ');
}

function tabLinks(current) {
  return NAV.filter(([key]) => ['home', 'work', 'about', 'contact'].includes(key)).map(([key, href, label]) => {
    const here = key === current || (current === 'case' && key === 'work');
    return `<a href="${href}"${here ? ' aria-current="page" class="is-here"' : ''}><span class="pip" aria-hidden="true"></span>${label}</a>`;
  }).join('\n  ');
}

function sheetLinks(current) {
  return NAV.map(([key, href, label, hint]) => {
    const here = key === current || (current === 'case' && key === 'work');
    return `<a href="${href}"${here ? ' aria-current="page"' : ''}>${label} <small>${hint}</small></a>`;
  }).join('\n    ');
}

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(path.join(DIST, 'assets'), { recursive: true });

  const assets = {
    css: await fingerprint('styles.css'),
    js: await fingerprint('app.js'),
    theme: await fingerprint('theme.js'),
  };

  const partial = async (name) => readFile(path.join(SRC, 'partials', name), 'utf8');
  const [headTpl, headerTpl, footerTpl] = await Promise.all([
    partial('head.html'), partial('header.html'), partial('footer.html'),
  ]);

  const pages = (await readdir(path.join(SRC, 'pages'))).filter((f) => f.endsWith('.html'));
  const sitemap = [];
  const html = {};

  for (const file of pages) {
    if (EXCLUDE.has(file)) continue;
    const raw = await readFile(path.join(SRC, 'pages', file), 'utf8');
    const m = raw.match(/^<!--page\s+(\{[\s\S]*?\})\s*-->\s*/);
    if (!m) fail(`${file} is missing its <!--page {...}--> header`);
    let meta;
    try { meta = JSON.parse(m[1]); } catch (e) { fail(`${file}: invalid page header JSON (${e.message})`); }
    for (const key of ['title', 'description', 'path']) {
      if (!meta[key]) fail(`${file}: page header needs "${key}"`);
    }
    let body = raw.slice(m[0].length);
    for (const inc of body.matchAll(/<!--include:([a-z0-9-]+)-->/g)) {
      body = body.replace(inc[0], await partial(`${inc[1]}.html`));
    }
    const url = meta.path === '/' ? `${SITE}/` : `${SITE}${meta.path}`;
    const image = `${SITE}${meta.image || '/images/og/og-default.png'}`;

    const head = headTpl
      .replaceAll('{{title}}', esc(meta.title))
      .replaceAll('{{description}}', esc(meta.description))
      .replaceAll('{{canonical}}', esc(url))
      .replaceAll('{{og_type}}', esc(meta.ogType || 'website'))
      .replaceAll('{{og_image}}', esc(image))
      .replaceAll('{{robots}}', meta.noindex ? 'noindex, follow' : 'index, follow')
      .replaceAll('{{css}}', assets.css)
      .replaceAll('{{theme}}', assets.theme)
      .replaceAll('{{jsonld}}', meta.jsonld
        ? `<script type="application/ld+json">${JSON.stringify(meta.jsonld).replace(/</g, '\\u003c')}</script>`
        : '');

    const header = headerTpl
      .replace('{{nav}}', navLinks(meta.nav))
      .replace('{{tabs}}', tabLinks(meta.nav))
      .replace('{{sheet}}', sheetLinks(meta.nav));

    const doc = `<!DOCTYPE html>
<html lang="en">
<head>
${head}
</head>
<body data-page="${esc(meta.nav || '')}"${ANALYTICS ? ' data-analytics="vercel"' : ''}>
${header}
${body.trim()}
${footerTpl}
<script src="${assets.js}" defer></script>
</body>
</html>
`;

    for (const marker of ['<<<<<<<', '>>>>>>>', '{{', '}}']) {
      if (doc.includes(marker)) fail(`${file}: unresolved "${marker}" in output`);
    }
    // Output location follows the public route: "/" -> index.html, "/work/opsrelay" -> work/opsrelay.html
    const outRel = meta.path === '/' ? 'index.html' : `${meta.path.slice(1)}.html`;
    if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*\.html$/.test(outRel)) fail(`${file}: unsupported path ${meta.path}`);
    html[outRel] = doc;
    await mkdir(path.dirname(path.join(DIST, outRel)), { recursive: true });
    await writeFile(path.join(DIST, outRel), doc);
    if (!meta.noindex) sitemap.push(url);
  }

  // Copy fonts and favicon, then only the images the output references.
  await cp(path.join(ROOT, 'fonts'), path.join(DIST, 'fonts'), { recursive: true });
  const css = await readFile(path.join(SRC, 'assets', 'styles.css'), 'utf8');
  const corpus = Object.values(html).join('\n') + css;
  const refs = new Set();
  for (const m of corpus.matchAll(/(?:["'(\s]|tahamohyuddin\.com)(\/images\/[^"')\s?#]+)/g)) refs.add(decodeURI(m[1]));
  for (const ref of refs) {
    const from = path.join(ROOT, ref);
    if (!from.startsWith(path.join(ROOT, 'images'))) fail(`reference escapes images/: ${ref}`);
    try {
      if (!(await stat(from)).isFile()) throw new Error('not a file');
    } catch {
      fail(`missing image referenced by the site: ${ref}`);
    }
    const to = path.join(DIST, ref);
    await mkdir(path.dirname(to), { recursive: true });
    await cp(from, to);
  }

  // The current resume, published at a stable URL (/resume redirects here; see vercel.json).
  await cp(path.join(ROOT, 'images', 'TMW.pdf'), path.join(DIST, 'resume.pdf'));

  await writeFile(path.join(DIST, 'robots.txt'),
    `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);
  const today = new Date().toISOString().slice(0, 10);
  await writeFile(path.join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
      sitemap.map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')
    }\n</urlset>\n`);

  console.log(`Built ${Object.keys(html).length} pages, ${refs.size} images -> dist/`);
}

main().catch((err) => fail(err.stack || String(err)));
