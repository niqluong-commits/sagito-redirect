# sagito-redirect — now the main site

**The name is out of date and the repository is not a redirect any more.** It serves
**`www.sagito.app`**, which is the canonical Sagito site as of 21 September 2026, and
GitHub Pages redirects the apex `sagito.app` to it because `CNAME` claims the `www`
host. It will be renamed once the migration below finishes.

## Why the content moved here instead of the domain moving

`info.sagito.app` is a store-submitted URL. It is the privacy policy URL in both the
Play Console and App Store Connect, the Support URL in App Store Connect, and
`POLICY_URL` compiled into every shipped build — plus `SITE_ORIGIN` for invite, gift
and swap links already sent to other people.

Moving a hostname between repositories means GitHub re-issues its certificate, and
`info` would answer nothing over HTTPS for as long as that takes. With an Android
release in review, an automated privacy-policy check that fetched it during that
window could have failed. Swapping the *contents* of two repositories that each
already hold a valid certificate costs nothing and takes no host offline.

## Where the migration has got to

**Phase 1, done.** `www` and the apex serve the real site. `niqluong-commits/sagito-site`
still serves `info.sagito.app` with the same pages, byte for byte, so nothing under
review changed. The site therefore exists in two places, and a copy edit has to be made
in both until Phase 2.

**Phase 2, waiting on the stores.** Once the in-review releases clear and the store
fields are repointed at `www`, `info` becomes a path-preserving redirect here — per
path, not a catch-all, so `/privacy` and `/support` keep answering 200 for anything
that still fetches them. `canonical` tags on the `info` copy belong to that phase too;
they were deliberately left out of Phase 1 so no page under review was edited at all.

`constants/externalCode.ts` in the app repository still has `SITE_ORIGIN` pointing at
`info`. Changing it only affects share links made by *future* builds, and installed
builds keep using `info` forever, which is the whole reason it can never be switched off.
