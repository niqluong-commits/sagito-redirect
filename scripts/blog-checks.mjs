/**
 * Content checks for blog articles, run before anything is published.
 *
 *   node scripts/site/blog-checks.mjs [--src docs/legal/blog-src]    (exits 1 on any error)
 *
 * Articles are written by HeyCatch, not by us, so this is what stands between its
 * wording and a public page that carries the company's name. The rules are the ones
 * this site already keeps, from docs/STORE-LISTING.md "Things deliberately not claimed":
 *
 *   - no outcome promise: nothing says a child will pass, improve by a grade or get in;
 *   - no scarcity or urgency: no countdowns or "limited time", because the audience is
 *     nine to eleven year olds and pressure selling around a child's revision is what
 *     the Children's Code watches hardest;
 *   - no exam board or school endorsement: "CEM" and "GL" are search terms, never an
 *     affiliation, and the site says it is not affiliated with any of them.
 *
 * A second group of rules is about children, because the site is the front of an app
 * for nine to eleven year olds and children do read it, even though the articles are
 * written for parents: nothing adult, nothing that collects or asks a child for personal
 * information, nothing that sets a child up to ask for a purchase, nothing that shames a
 * child, and any sensitive subject (self-harm, health conditions) held for a person to
 * read rather than waved through. Those are marked "child-safety:" in the report.
 *
 * Two levels. An ERROR stops the article being built at all. A WARNING is printed for
 * the reviewer and does not stop it: they are things a person should look at (a price,
 * a competitor name, a title that will be cut off in search results), not things that
 * are wrong on their face.
 *
 * Pattern checks catch wording, not meaning: they will miss a promise phrased in a way
 * nobody has thought of, so passing them is "nothing obvious", not "approved". The
 * receiver should open a pull request, not publish straight to the live branch, so a
 * person still reads every article.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Each rule: what it is, what it matches, and what to tell the reviewer. */
const ERROR_RULES = [
  {
    id: 'outcome-promise',
    re: /\b(guarantee[sd]?|guaranteed (?:a )?(?:place|pass|success|result)s?|(?:will|can) (?:definitely |certainly )?(?:pass|get (?:in|into)|secure a place)|pass(?:ed|es)? the 11\+|improve[sd]?(?: \w+){0,3} by (?:a|one|two|three|\d+) grades?|boosts? (?:scores?|marks?) by|proven to (?:raise|improve|boost|increase)|gets? your child into)\b/i,
    say: 'promises a result (a pass, a place, a grade). The store listing rules this out: it cannot be substantiated.',
  },
  {
    id: 'urgency',
    re: /\b(limited[- ]time|hurry|last chance|act now|don'?t miss out|before it'?s too late|running out of time|only \d+ (?:places|spots|days|hours) left|ends (?:today|tonight|soon)|while stocks last|offer (?:ends|expires))\b/i,
    say: 'uses urgency or scarcity. This audience is children; the store listing rules out pressure selling.',
  },
  {
    id: 'fear-pressure',
    re: /\b(falling behind|left behind|other (?:kids|children|parents) are already|your child will (?:fail|struggle|miss out)|you'?re failing your child)\b/i,
    say: 'puts fear or comparison pressure on a parent or child.',
  },
  {
    id: 'endorsement',
    re: /(?<!not )(?<!un)\b(officially (?:partnered|approved|endorsed|recommended)|endorsed by|approved by|recommended by|(?:in )?partner(?:ship)? with|affiliated with|authori[sz]ed by|licen[sc]ed by)\b/i,
    say: 'claims an endorsement, approval or partnership. Sagito is not affiliated with any exam board or school.',
  },
  {
    id: 'app-data-claim',
    re: /\b(we (?:track|collect|store|monitor|record|share) (?:your child|children|their (?:answers|data|progress|location))|(?:sagito|the app) (?:tracks|collects|sends|shares|uploads) (?:your|their|children'?s?) )/i,
    say: 'says the app collects or sends children\'s data. It does not, and the privacy notice says so; any wording to the contrary is wrong.',
  },
  {
    id: 'child-safety: adult content',
    re: /\b(fuck\w*|shit\w*|bitch\w*|cunt|porn\w*|nsfw|nude|erotic|gambl\w+|casino|betting|vap(?:e|ing)|cannabis|cocaine|heroin)\b/i,
    say: 'contains adult, profane or age-restricted wording. This brand is for children and families.',
  },
  {
    id: 'child-safety: self-harm',
    re: /\b(suicid\w*|self[- ]harm\w*|kill(?:ing)? (?:yourself|themselves|himself|herself)|overdos\w+|end(?:ing)? (?:their|his|her) (?:own )?life)\b/i,
    say: 'touches self-harm or suicide. That needs a person and the safeguarding wording (Childline), never an automated post.',
  },
  {
    id: 'child-safety: asks for a child\'s details',
    re: /\b(?:enter|send|share|give|tell us|email us|upload|post)\s+(?:us\s+)?(?:your|their|his|her)\s+(?:child'?s?\s+)?(?:full\s+)?(?:name|surname|address|phone(?: number)?|mobile|email(?: address)?|school|photos?|pictures?|age|birthday|date of birth|location)\b/i,
    say: 'asks a child or parent to hand over a child\'s personal details. Sagito collects none, and the site must not ask.',
  },
  {
    id: 'child-safety: sells to a child',
    re: /\b(ask (?:your |their |his |her )?(?:mum|mom|mummy|dad|daddy|parents?|grown-?ups?) to (?:buy|get|subscribe|pay)|tell (?:your |their |his |her )?(?:mum|mom|dad|parents?) to (?:buy|subscribe)|pester|nag (?:your )?(?:mum|dad|parents?))\b/i,
    say: 'points a child at a purchase. Nothing is ever sold to a child; purchases sit behind a parent PIN.',
  },
  {
    id: 'child-safety: shames a child',
    re: /\b(stupid|dumb|idiots?|thick|useless|dim|slow learners?|lazy (?:child|kid|boy|girl|children|kids)s?)\b/i,
    say: 'labels or shames a child. Written for parents, it should never describe a child that way.',
  },
  {
    id: 'raw-script',
    re: /<\s*(?:script|iframe|object|embed|style)\b|\son\w+\s*=|javascript:/i,
    say: 'contains script, frame or event-handler markup.',
  },
];

const WARNING_RULES = [
  { id: 'superlative', re: /\b(best|#1|number one|top[- ]rated|most effective|leading|unbeatable|revolutionary)\b/i, say: 'uses a superlative that needs evidence.' },
  { id: 'exam-board-name', re: /\b(GL Assessment|GL|CEM|Durham University|ISEB)\b/, say: 'names an exam provider. Fine as a topic; check nothing reads as a link between them and Sagito.' },
  { id: 'competitor', re: /\b(Pip(?: 11\+)?|Atom Learning|EdPlace|Bond|Bright Minds|11 Plus Blocks)\b/, say: 'names a competitor. Check every fact and price about them against their own site.' },
  { id: 'child-safety: sensitive topic', re: /\b(ADHD|dyslexi\w*|dyspraxi\w*|autis\w+|anxiety|anxious|depress\w+|diagnos\w+|medication|SEN|special needs|eating disorder|bullying|bullied|abuse)\b/i, say: 'covers a health, learning or safeguarding subject. A person should read it for tone and for anything that sounds like advice.' },
  { id: 'child-safety: stress language', re: /\b(panic\w*|terrif\w+|dread\w*|nightmare|desperate|crushing|break(?:s|ing)? down in tears|meltdown)\b/i, say: 'uses alarming language about children and exams.' },
  { id: 'child-safety: contest or reward', re: /\b(giveaway|win a|competition|prizes?|raffle|sweepstakes?|free gift|referral|refer a friend|invite (?:a )?friends?)\b/i, say: 'mentions a prize, giveaway or referral. Those need their own safeguarding and privacy review, not a blog post.' },
  { id: 'child-safety: children pictured', re: /\b(photos?|pictures?|videos?) of (?:your |their |a )?(?:child|children|kids?|son|daughter)\b/i, say: 'talks about photographing or filming children. Check it does not encourage posting them.' },
  { id: 'child-safety: direct to child', re: /\b(hey kids|hi kids|kids,|children,|dear (?:child|kids?|pupil)|you(?:'| )?re (?:a )?(?:\d+|nine|ten|eleven)[- ]year[- ]old)\b/i, say: 'speaks straight to a child. The articles are for parents; a child-directed page is a different thing with its own rules.' },
  { id: 'html-in-markdown', re: /<\/?[a-z][a-z0-9]*[^>]*>/i, say: 'contains HTML, which is shown as plain text on the page.' },
];

/** The only prices and counts the site itself states; anything else gets a second look. */
const KNOWN_PRICES = new Set(['£0', '£2.99', '£3.99', '£39.99']);
const KNOWN_QUESTION_COUNTS = new Set(['5,000', '2,000', '5000', '2000']);

function snippet(text, re) {
  const m = text.match(re);
  if (!m) return '';
  const i = m.index ?? 0;
  const s = text.slice(Math.max(0, i - 30), i + m[0].length + 30).replace(/\s+/g, ' ');
  return `…${s}…`;
}

export function checkPost(post) {
  const errors = [];
  const warnings = [];
  const body = `${post.title ?? ''}\n${post.description ?? ''}\n${post.content ?? ''}`;

  for (const r of ERROR_RULES) {
    if (r.re.test(body)) errors.push(`${r.id}: ${r.say} ${snippet(body, r.re)}`);
  }
  for (const r of WARNING_RULES) {
    if (r.re.test(body)) warnings.push(`${r.id}: ${r.say} ${snippet(body, r.re)}`);
  }

  // Structure and search basics, from the SEO audit.
  const title = `${post.title ?? ''} | Sagito`;
  if (title.length > 60) warnings.push(`title: ${title.length} characters with the site name; search results cut it near 60.`);
  if (title.length < 30) warnings.push(`title: ${title.length} characters with the site name; under 30 says little.`);
  const d = (post.description ?? '').length;
  if (!d) warnings.push('description: none, so the page will use the start of the article.');
  else if (d < 110 || d > 160) warnings.push(`description: ${d} characters; 110 to 160 reads best in results.`);
  const words = (post.content ?? '').split(/\s+/).filter(Boolean).length;
  if (words < 300) warnings.push(`length: ${words} words; short articles rarely rank or get quoted.`);
  if (/^# /m.test(post.content ?? '')) warnings.push('heading: the body starts with a # heading, but the title is already the page heading; it is shown as a second-level heading.');
  if (/!\[\s*\]\(/.test(post.content ?? '')) warnings.push('images: an image has no alt text.');
  const exclaims = (body.match(/!/g) ?? []).length;
  if (exclaims > 3) warnings.push(`tone: ${exclaims} exclamation marks.`);

  // Money and counts: only what the site itself states passes unremarked.
  const prices = [...new Set((body.match(/£\s?\d[\d,]*(?:\.\d+)?/g) ?? []).map((p) => p.replace(/\s/g, '')))];
  const unknown = prices.filter((p) => !KNOWN_PRICES.has(p));
  if (unknown.length) warnings.push(`prices: ${unknown.join(', ')} is not a Sagito price (£2.99, £3.99, £39.99). If it is a competitor's or a tutor's, check it.`);
  const counts = [...new Set([...body.matchAll(/(\d[\d,]*)\s+(?:practice\s+)?questions\b/gi)].map((m) => m[1]))];
  const oddCounts = counts.filter((c) => !KNOWN_QUESTION_COUNTS.has(c));
  if (oddCounts.length) warnings.push(`counts: "${oddCounts.join('", "')} questions" does not match the 5,000 total or 2,000 free. Check it.`);

  // Links and images: only http(s) and site-relative addresses survive the build.
  for (const m of (post.content ?? '').matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
    if (!/^(https?:\/\/|\/(?!\/))/i.test(m[1])) errors.push(`link: "${m[1]}" is not an http(s) or site-relative address.`);
  }

  // External destinations a family could be sent to. Apple, Google Play, government,
  // the ICO, Companies House and Sagito's own domains are known; anything else is for a person to look at.
  const SAFE_HOSTS = /(^|\.)(sagito\.app|sagitogo\.app|apple\.com|play\.google\.com|google\.com|gov\.uk|ico\.org\.uk|childline\.org\.uk|nspcc\.org\.uk|nhs\.uk|bbc\.co\.uk)$/i;
  const SHORTENERS = /(^|\.)(bit\.ly|t\.co|tinyurl\.com|goo\.gl|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly)$/i;
  const hosts = new Set();
  for (const m of (post.content ?? '').matchAll(/!?\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi)) {
    try {
      const h = new URL(m[1]).hostname.toLowerCase();
      if (SHORTENERS.test(h)) errors.push(`child-safety: link to ${h} hides where it goes. Use the real address.`);
      else if (!SAFE_HOSTS.test(h)) hosts.add(h);
    } catch {
      errors.push(`link: "${m[1]}" is not a valid address.`);
    }
  }
  if (hosts.size) warnings.push(`child-safety: links to ${[...hosts].join(', ')}. Open each and check it is suitable for a family to land on.`);
  const imgHosts = new Set();
  for (const m of (post.content ?? '').matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi)) {
    try {
      imgHosts.add(new URL(m[1]).hostname.toLowerCase());
    } catch {}
  }
  if (imgHosts.size) warnings.push(`child-safety: loads pictures from ${[...imgHosts].join(', ')}. Look at each picture; it is not hosted by us.`);

  // Plain English: long sentences are hard on a tired parent and on a screen reader.
  const sentences = (post.content ?? '').replace(/```[\s\S]*?```/g, ' ').split(/[.!?]+\s/).filter((t) => t.trim().split(/\s+/).length > 1);
  const long = sentences.filter((t) => t.trim().split(/\s+/).length > 35).length;
  if (long > 2) warnings.push(`readability: ${long} sentences run over 35 words.`);
  return { errors, warnings };
}

export function loadPostFiles(srcDir) {
  if (!existsSync(srcDir)) return [];
  return readdirSync(srcDir)
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((file) => {
      try {
        return { file, post: JSON.parse(readFileSync(join(srcDir, file), 'utf8')) };
      } catch {
        return { file, post: null };
      }
    });
}

// CLI
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const i = process.argv.indexOf('--src');
  const srcDir = i > -1 ? resolve(process.cwd(), process.argv[i + 1]) : resolve(root, 'docs/legal/blog-src');
  let failed = 0;
  const files = loadPostFiles(srcDir);
  if (!files.length) console.log(`no articles in ${srcDir}`);
  for (const { file, post } of files) {
    if (!post) {
      console.log(`FAIL  ${file}\n      not valid JSON`);
      failed++;
      continue;
    }
    const { errors, warnings } = checkPost(post);
    console.log(`${errors.length ? 'FAIL' : 'ok  '}  ${file}`);
    for (const e of errors) console.log(`      error    ${e}`);
    for (const w of warnings) console.log(`      warning  ${w}`);
    if (errors.length) failed++;
  }
  if (failed) {
    console.log(`\n${failed} article${failed === 1 ? '' : 's'} blocked. Fix them, or leave them out of the build.`);
    process.exit(1);
  }
}
