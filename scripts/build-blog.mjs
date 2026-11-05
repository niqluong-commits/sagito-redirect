/**
 * Builds the sagito.app blog: /blog/ and /blog/<slug>/ as plain static pages.
 *
 *   node scripts/site/build-blog.mjs [--src docs/legal/blog-src] [--out docs/legal/blog]
 *                                    [--site docs/legal]
 *
 * (Paths given on the command line are relative to the current directory.)
 *
 * Articles are one JSON file each in `--src`, named `<slug>.json`:
 *
 *   { "slug": "how-to-start-11-plus", "title": "…", "description": "…",
 *     "publishedAt": "2026-11-04T08:00:00Z", "updatedAt": "…" (optional),
 *     "author": "…" (optional), "image": "https://…" (optional),
 *     "content": "markdown", "draft": false }
 *
 * Why this shape rather than HeyCatch's own: HeyCatch pushes articles to a webhook
 * (there is no pull API), and the receiver is what turns its payload into these
 * files. Keeping one normalised shape here means the pages do not change if the
 * payload does; only the receiver's mapping does.
 *
 * The page design is not restated here. The stylesheet, header and analytics
 * snippet are lifted from `index-public.html` at build time, so the blog follows the
 * homepage when it changes. The output is in its final deployed form
 * (`blog/index.html`, `blog/<slug>/index.html`): copy the `blog/` folder and the
 * updated `sitemap.xml` to `sagito-site`.
 *
 * Article text is untrusted: it arrives from a webhook. The markdown converter below
 * escapes all HTML first and only ever emits tags it writes itself, and links and
 * images are limited to http(s) and site-relative addresses.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { checkPost } from './blog-checks.mjs';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
// Defaults are relative to this repository; anything passed on the command line is
// relative to where the command is run, which is what `sagito-site` needs (there the
// script sits in scripts/ and the pages are at the top of the repository).
const where = (name, fallback) => (arg(name) ? resolve(process.cwd(), arg(name)) : resolve(root, fallback));
const siteDir = where('site', 'docs/legal');
const srcDir = where('src', 'docs/legal/blog-src');
const outDir = where('out', 'docs/legal/blog');
const ORIGIN = 'https://www.sagito.app';

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^(https?:\/\/|\/(?!\/))/i.test(u.trim()) ? u.trim() : null);
const day = (iso) => new Date(iso).toISOString().slice(0, 10);
const longDate = (iso) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Inline markdown on already-escaped text. */
const inline = (s) =>
  s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, u) => {
      const url = safeUrl(u.replace(/&amp;/g, '&'));
      return url ? `<img src="${esc(url)}" alt="${alt}" loading="lazy" decoding="async">` : alt;
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, u) => {
      const url = safeUrl(u.replace(/&amp;/g, '&'));
      return url ? `<a href="${esc(url)}">${text}</a>` : text;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');

export function markdownToHtml(md) {
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  let list = null; // 'ul' | 'ol'
  let fence = null;
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(esc(para.join(' ')))}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of lines) {
    if (fence !== null) {
      if (/^```/.test(raw)) {
        out.push(`<pre><code>${esc(fence.join('\n'))}</code></pre>`);
        fence = null;
      } else fence.push(raw);
      continue;
    }
    if (/^```/.test(raw)) {
      flushPara();
      closeList();
      fence = [];
      continue;
    }
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) {
      flushPara();
      closeList();
    } else if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      flushPara();
      closeList();
      // The page title is the h1, so a leading # in the body becomes an h2.
      const level = Math.min(Math.max(m[1].length, 2), 4);
      out.push(`<h${level}>${inline(esc(m[2]))}</h${level}>`);
    } else if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushPara();
      closeList();
      out.push('<hr>');
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara();
      closeList();
      out.push(`<blockquote><p>${inline(esc(m[1]))}</p></blockquote>`);
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      flushPara();
      if (list !== 'ul') {
        closeList();
        out.push('<ul>');
        list = 'ul';
      }
      out.push(`<li>${inline(esc(m[1]))}</li>`);
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      if (list !== 'ol') {
        closeList();
        out.push('<ol>');
        list = 'ol';
      }
      out.push(`<li>${inline(esc(m[1]))}</li>`);
    } else {
      closeList();
      para.push(line.trim());
    }
  }
  if (fence !== null) out.push(`<pre><code>${esc(fence.join('\n'))}</code></pre>`);
  flushPara();
  closeList();
  return out.join('\n');
}

let blocked = 0;
function loadPosts() {
  if (!existsSync(srcDir)) return [];
  const posts = [];
  for (const f of readdirSync(srcDir).filter((n) => n.endsWith('.json')).sort()) {
    let p;
    try {
      p = JSON.parse(readFileSync(join(srcDir, f), 'utf8'));
    } catch (e) {
      console.warn(`skip ${f}: not valid JSON`);
      continue;
    }
    const problems = [];
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug ?? '')) problems.push('slug must be lowercase letters, digits and hyphens');
    if (!p.title || typeof p.title !== 'string') problems.push('title missing');
    if (!p.content || typeof p.content !== 'string') problems.push('content missing');
    if (!p.publishedAt || Number.isNaN(Date.parse(p.publishedAt))) problems.push('publishedAt missing or not a date');
    if (p.slug && `${p.slug}.json` !== f) problems.push(`file name should be ${p.slug}.json`);
    if (problems.length) {
      console.warn(`skip ${f}: ${problems.join('; ')}`);
      continue;
    }
    if (p.draft) continue;
    if (Date.parse(p.publishedAt) > Date.now()) continue; // scheduled for later
    // The content checks (scripts/site/blog-checks.mjs) decide what may be published.
    const { errors, warnings } = checkPost(p);
    for (const w of warnings) console.warn(`warning ${f}: ${w}`);
    if (errors.length) {
      console.error(`BLOCKED ${f}: not published.\n  ${errors.join('\n  ')}`);
      blocked++;
      continue;
    }
    posts.push(p);
  }
  return posts.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

/** The shared pieces, lifted from the homepage so the blog keeps its design. */
// In this repository the homepage is index-public.html; deployed to sagito-site it is index.html.
const homeFile = existsSync(join(siteDir, 'index-public.html')) ? 'index-public.html' : 'index.html';
const home = readFileSync(join(siteDir, homeFile), 'utf8');
const grab = (re, what) => {
  const m = home.match(re);
  if (!m) throw new Error(`${homeFile} no longer has the ${what}; update build-blog.mjs`);
  return m[0];
};
const baseStyle = grab(/<style>[\s\S]*?<\/style>/, '<style> block');
const header = grab(/<header class="top">[\s\S]*?<\/header>/, 'header');
const analytics = home.match(/<script type="module">[\s\S]*?<\/script>\n/)?.[0] ?? '';
const footer = '<footer>&copy; <span id="cy">2026</span> QNL LTD &middot; <a href="/">Sagito</a> &middot; <a href="/privacy">Privacy</a> &middot; <a href="/support">Help</a></footer>';
const blogStyle = `<style>
  .posts { list-style:none; padding:0; margin:28px 0 0; max-width:640px; }
  .posts li { margin:0 0 30px; }
  .posts h2 { margin:0 0 4px; font-size:22px; }
  .posts h2 a { color:var(--ink); text-decoration:none; }
  .posts h2 a:hover { color:var(--green); text-decoration:underline; }
  .posts time, .byline { color:var(--light); font-size:15px; }
  .posts p { margin:6px 0 0; }
  article { max-width:680px; }
  article h2 { margin-top:38px; }
  article h3 { font-size:18px; margin:28px 0 6px; }
  article img { max-width:100%; height:auto; border-radius:12px; }
  article blockquote { margin:0 0 26px; padding-left:16px; border-left:3px solid var(--tint); }
  article code { background:var(--tint); border-radius:4px; padding:1px 5px; font-size:.92em; }
  article pre { background:var(--tint); border-radius:10px; padding:14px 16px; overflow-x:auto; margin:0 0 26px; }
  article pre code { background:none; padding:0; }
  article ol { color:var(--light); margin:0 0 26px; padding-left:22px; }
  .byline { margin:0 0 28px; }
</style>`;

const page = ({ title, description, path, robots, image, ld, body }) => `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<link rel="icon" href="/favicon.png" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="description" content="${esc(description)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
${robots ? `<meta name="robots" content="${robots}">\n` : ''}<link rel="canonical" href="${ORIGIN}${path}">
<meta property="og:type" content="${path === '/blog/' ? 'website' : 'article'}">
<meta property="og:site_name" content="Sagito">
<meta property="og:locale" content="en_GB">
<meta property="og:url" content="${ORIGIN}${path}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(image)}">
${analytics}<script type="application/ld+json">
${JSON.stringify(ld, null, 2).replace(/</g, '\\u003c')}
</script>
${baseStyle}
${blogStyle}
</head>
<body>
<main class="wrap">
${header}
${body}
${footer}
</main>
</body>
</html>
`;

const OG = `${ORIGIN}/images/og-sagito.png`;
const orgRef = { '@id': `${ORIGIN}/#org` };
const posts = loadPosts();

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// Index
const listing = posts.length
  ? `<ul class="posts">\n${posts
      .map(
        (p) => `  <li>
    <h2><a href="/blog/${p.slug}/">${esc(p.title)}</a></h2>
    <time datetime="${day(p.publishedAt)}">${longDate(p.publishedAt)}</time>
    ${p.description ? `<p>${esc(p.description)}</p>` : ''}
  </li>`,
      )
      .join('\n')}\n</ul>`
  : '<p>No articles yet. <a href="/">Back to Sagito</a>.</p>';
writeFileSync(
  join(outDir, 'index.html'),
  page({
    title: 'Sagito blog: articles for parents on 11+ practice',
    description: 'Articles for parents on 11+ practice, from the makers of Sagito, the UK 11+ practice app with 2,000 free questions.',
    path: '/blog/',
    robots: posts.length ? '' : 'noindex',
    image: OG,
    ld: {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: 'Sagito blog',
      url: `${ORIGIN}/blog/`,
      publisher: orgRef,
      blogPost: posts.map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: `${ORIGIN}/blog/${p.slug}/`, datePublished: p.publishedAt })),
    },
    body: `<h1>The Sagito blog</h1>\n<p class="lede">Articles for parents on 11+ practice.</p>\n${listing}`,
  }),
);

// Posts
for (const p of posts) {
  const url = `/blog/${p.slug}/`;
  const description = (p.description || p.content.replace(/[#>*`\[\]()!_-]/g, '').replace(/\s+/g, ' ').trim()).slice(0, 155);
  const image = safeUrl(p.image ?? '')?.startsWith('http') ? p.image : OG;
  const modified = p.updatedAt && !Number.isNaN(Date.parse(p.updatedAt)) ? p.updatedAt : p.publishedAt;
  const title = `${p.title} | Sagito`;
  if (title.length > 60) console.warn(`note ${p.slug}: title is ${title.length} characters with the site name; search results cut it near 60`);
  mkdirSync(join(outDir, p.slug), { recursive: true });
  writeFileSync(
    join(outDir, p.slug, 'index.html'),
    page({
      title,
      description,
      path: url,
      image,
      ld: {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: p.title,
        description,
        url: `${ORIGIN}${url}`,
        mainEntityOfPage: `${ORIGIN}${url}`,
        image,
        datePublished: p.publishedAt,
        dateModified: modified,
        author: p.author ? { '@type': 'Person', name: p.author } : orgRef,
        publisher: orgRef,
      },
      body: `<article>
<h1>${esc(p.title)}</h1>
<p class="byline"><time datetime="${day(p.publishedAt)}">${longDate(p.publishedAt)}</time>${p.author ? ` &middot; ${esc(p.author)}` : ''}</p>
${markdownToHtml(p.content)}
</article>
<p><a href="/blog/">All articles</a></p>`,
    }),
  );
}

// Sitemap: only the section between the markers is ours.
const sitemapPath = join(siteDir, 'sitemap.xml');
const START = '<!-- blog:start -->';
const END = '<!-- blog:end -->';
let sitemap = readFileSync(sitemapPath, 'utf8');
if (!sitemap.includes(START)) sitemap = sitemap.replace('</urlset>', `  ${START}\n  ${END}\n</urlset>`);
const entries = posts.length
  ? [
      `  <url><loc>${ORIGIN}/blog/</loc><lastmod>${day(posts[0].updatedAt || posts[0].publishedAt)}</lastmod></url>`,
      ...posts.map((p) => `  <url><loc>${ORIGIN}/blog/${p.slug}/</loc><lastmod>${day(p.updatedAt || p.publishedAt)}</lastmod></url>`),
    ].join('\n')
  : '';
sitemap = sitemap.replace(new RegExp(`${START}[\\s\\S]*?${END}`), `${START}\n${entries ? entries + '\n' : ''}  ${END}`);
writeFileSync(sitemapPath, sitemap);

console.log(`${posts.length} article${posts.length === 1 ? '' : 's'} built into ${outDir}${blocked ? `; ${blocked} blocked by content checks` : ''}`);
if (blocked) process.exitCode = 1;
