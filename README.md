# sagito-www

The main Sagito site, served by GitHub Pages at **www.sagito.app** (the apex `sagito.app`
redirects to it because `CNAME` claims the `www` host). It was `sagito-redirect` until
5 November 2026, when it was renamed because it stopped redirecting anything.

## Two copies of the site

`niqluong-commits/sagito-info` serves `info.sagito.app` with the same pages, and every
page's canonical tag points at `www.sagito.app`. `info` has to stay up: it is the privacy
policy and support URL given to Google Play and App Store Connect, it is compiled into
every shipped build as `POLICY_URL`, and invite, gift and swap links already sent to
people use it. A copy edit is made in both repos until the stores point at `www`; then
`info` becomes a per-path redirect (not a catch-all, so `/privacy` and `/support` keep
answering 200).

**Edit pages in the app repo** (`niqluong-commits/sagito`, `docs/legal/*-public.html`) and
copy them here and to `sagito-info`. Do not edit the copies on their own.

## The blog

Articles are written in HeyCatch and arrive as pull requests; nothing publishes itself.

```
HeyCatch -> Cloudflare Worker "sagito-blog" -> pull request in this repo
         -> CI content checks (.github/workflows/blog.yml) -> you read and merge
         -> CI builds blog/ and sitemap.xml -> Pages
```

- `blog-src/<slug>.json` is an article as delivered. `scripts/blog-checks.mjs` checks it
  (competitors, prices, links, claims that need evidence); `scripts/build-blog.mjs` turns it
  into `blog/<slug>/index.html` and updates `sitemap.xml`. Both come from `scripts/site/`
  in the app repo, which has the Worker, its tests and `BLOG.md` (the set-up).
- The workflow also runs daily at 06:00 UTC so a scheduled article appears on its date.
- The Worker's `GITHUB_TOKEN` is a fine-grained token limited to this repo (Contents and
  Pull requests, read and write). It expires on 3 February 2027: renew it then with
  `wrangler secret put GITHUB_TOKEN`.
- The built pages copy the header and styles from `index.html`, so changing the homepage
  header changes the blog, after the next build.
