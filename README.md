# robwattfilms.com

Portfolio site for Rob Watt — filmmaker & aerial cinematographer. Plain HTML/CSS/JS, no build step, hosted on GitHub Pages.

## Folder structure

```
robwattfilms/
├── index.html            ← home: autoplaying reel (must stay at the root for GitHub Pages)
├── 404.html              ← not-found page
├── CNAME                 ← tells GitHub Pages to serve at robwattfilms.com
├── robots.txt            ← lets search engines crawl
├── sitemap.xml           ← list of pages for Google (update when you add pages)
├── llms.txt              ← plain-language site summary for AI assistants (update with new posts)
├── css/
│   └── style.css         ← all styling; colours and fonts are at the top
├── html/
│   ├── aerial.html       ← aerial video grid
│   ├── aerial/           ← one page per aerial video (for Google video search)
│   ├── films.html
│   ├── about.html
│   ├── journal.html      ← blog index
│   └── journal/
│       └── phedon-papamichael-getting-made-podcast.html   ← duplicate this for each new post
├── js/
│   └── main.js           ← mobile menu + video lightbox
├── videos/             ← self-hosted video files
└── images/
    ├── stills/           ← video thumbnails
    ├── placeholder.svg   ← swap for your own stills
    └── favicon.png
```

## Adding work

Each project is a `<li>` block in `html/aerial.html`, with its own page in `html/aerial/` and a `<video:video>` entry in `sitemap.xml`. Copy one and change:

- `data-video` — a Vimeo or YouTube link, or a file in `/videos`
- `data-title` / `data-credit` — shown under the player
- `img src` — a 16:9 still in `/images/stills` (JPG, ~1600px wide)
- `alt` — a short description of the image

## Things to fill in

Search the project for `YOUR-HANDLE` and `YOUR-ID` and replace them. `images/og-image.jpg` (1200×630) is the image shown when links are shared. `images/rob-watt.jpg` is the about-page photo.

## Publishing on GitHub Pages

1. Create a new repository on GitHub (e.g. `robwattfilms`).
2. Upload everything **inside** this folder to the root of the repo (so `index.html` is at the top level).
3. Repo → **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main` / `(root)` → Save.
4. Under **Custom domain** enter `robwattfilms.com` (the `CNAME` file already sets this) and tick **Enforce HTTPS** once it's available.
5. At your domain registrar, add these DNS records:
   - `A` records for `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` record for `www` → `YOUR-GITHUB-USERNAME.github.io`

DNS can take up to a day to propagate.

## After launch (SEO / AEO)

- Add the site to Google Search Console and submit `https://robwattfilms.com/sitemap.xml`.
- Keep each page's `<title>` and `description` specific to that page.
- Start journal posts with a plain 1–2 sentence answer to the question the post is about.
