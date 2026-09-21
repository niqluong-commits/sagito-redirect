# sagito-redirect

One job: send **`sagito.app`** and **`www.sagito.app`** to `info.sagito.app`, the
marketing page.

Both addresses were served by Wix and returned **404** — no site was ever published
there. `info.sagito.app` has been the real site since 19 September 2026. A bare
domain that 404s is worse than no domain at all: it is the address people type by
habit and the one a printed link is most likely to use.

**Do not add pages here.** The real site is `niqluong-commits/sagito-site`, and its
pages are generated from `niqluong-commits/sagito`. This repository exists only
because GitHub Pages allows a single custom domain per repository — the same reason
`sagito-privacy-redirect` is separate.

## Why one repository covers both hosts

`CNAME` claims the **apex**, `sagito.app`. When a Pages site's custom domain is an
apex domain, GitHub also serves the `www` variant, provided `www` resolves to
`niqluong-commits.github.io`. So `www` arrives here, is redirected to the apex by
GitHub, and is redirected on to `info.sagito.app` by the page below. Claiming `www`
in `CNAME` instead would have needed a second repository.

## Set-up, recorded so it can be rebuilt

**DNS is at Wix** — the nameservers are `ns4/ns5.wixdns.net` — so the records are
edited in the Wix dashboard, not here:

| Record | Host | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `niqluong-commits.github.io` |

The four A records replace Wix's `185.230.63.107/171/186`; the CNAME replaces
`cdn3.wixdns.net`. **Nothing else in the zone changes** — MX and any other Wix
records stay exactly as they are, so email is untouched. That is the main reason
this route was chosen over moving the nameservers to Cloudflare.

Wix may refuse to edit the apex A record while the domain is still connected to a
Wix site; disconnect the site first, then edit. Nothing is published on it.

`index.html` redirects three ways over, because a static host cannot send a 301:
a `canonical` link for crawlers, a `meta refresh` for browsers with JavaScript off,
and `location.replace` for everyone else. The fragment is carried across.
`404.html` catches any path under either host and sends it to the same place, so a
stray link shows the Sagito holding page rather than GitHub's 404.

After DNS propagates, tick **Enforce HTTPS** in the repository's Pages settings —
the Let's Encrypt certificate covers both hosts and can take up to an hour to issue.
