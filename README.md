# Clipmax Pro

A local-first clipper studio for long streams and recordings. It downloads a VOD, listens to it on your machine, scores every candidate window, cuts vertical captioned clips, and queues them for YouTube Shorts, TikTok, Instagram Reels and Facebook.

Nothing leaves the computer until you connect a platform, render an export, and add it to the queue with dry run off.

---

## What it does

1. **Ingest** — paste a Twitch / YouTube / Kick / X link for `yt-dlp`, or drop a local file (up to 4 GB).
2. **Listen** — FFmpeg extracts 16 kHz mono audio; a local Whisper model (via `@huggingface/transformers`) produces word-level timestamps. No cloud transcription.
3. **Score** — sentence windows are judged on hook words, questions, numbers, emotion, payoff lines, speaking pace, length and audio energy. The studio draws the interest curve and marks every suggested cut.
4. **Cut** — choose 9:16, 4:5 or 1:1; fill, blur, split or triple layout; pan, crop and zoom; pick one of 56 caption styles from 7 groups; trim in/out.
5. **Render** — FFmpeg burns the captions with ASS, normalises loudness to −16 LUFS, and writes an H.264/AAC MP4 at 1080 wide.
6. **Queue** — one export can fan out to four official APIs. Each platform reports success or failure on its own line. Dry run simulates everything.

---

## Requirements

| Tool | Why |
| --- | --- |
| Node.js 20+ | Runs the API, the UI build and the desktop shell |
| FFmpeg + FFprobe | Probe, audio extraction, preview, thumbnails, final render |
| yt-dlp | Pull streams and clips from links |
| Chrome (optional) | Only used if you add cookie-based downloads later |

On Windows the app also finds FFmpeg and yt-dlp through `PATH`, WinGet links and the usual install folders. If an engine says **missing**, restart the terminal so the new `PATH` is visible.

The first Whisper run downloads the selected model once into `data/models/` (tiny ≈ 75 MB, base ≈ 145 MB, small ≈ 490 MB). After that, analysis is offline.

---

## Run it

```powershell
# from the project folder
npm.cmd install
npm.cmd run dev
```

Open <http://127.0.0.1:5173>. The API listens on `127.0.0.1:8787` and Vite proxies `/api` to it.

Production build and desktop shell:

```powershell
npm.cmd run build
npm.cmd run desktop
```

`npm.cmd run desktop` starts its own API on port 8787 and loads the built files. If the port is already taken by `npm run dev`, the desktop window reuses that server.

Package an installer:

```powershell
npm.cmd run desktop:build
```

Output lands in `release/`. FFmpeg and yt-dlp are **not** bundled; install them on the target machine, or set `FFMPEG_PATH`, `FFPROBE_PATH` and keep `yt-dlp` on `PATH`.

> PowerShell blocks `npm.ps1` and `npx.ps1` on this machine. Use `npm.cmd` / `npx.cmd`, or run the commands from Command Prompt.

---

## Using the studio

### Add a source

- **From a link** — paste a VOD or clip URL. `yt-dlp` chooses the best MP4 it can see. Live streams download from the start unless the platform blocks it.
- **From a file** — drag a recording onto the drop zone. The file is copied into `data/uploads/` and never uploaded anywhere.

Long streams take time. The studio shows the current stage and a percentage; the SSE stream keeps the window current.

### Find the moment

The **heatmap** blends spoken-word density with audio energy. Every suggested cut is outlined on the curve. Click anywhere to move the preview there; click a cut in the list to load it.

Each cut carries a score from 22–98, a plain-language label (Filler, Solid, Strong hook, Scroll-stopper) and the reasons behind the score, so you can see why the cutter liked it.

### Cut and caption

- **Frame** — aspect, layout, horizontal/vertical focus, zoom, in/out trim.
- **Captions** — 56 styles, 3–6 words per cue, top/middle/bottom, size. The preview approximates the burned-in look; the render is exact.
- **Exports** — every render is listed with its size, length and style. Preview it, post it, or delete it.

### Post

Press **Post** on an export. Pick platforms, edit the title, caption and hashtags, and optionally schedule a local time. With dry run on, every target resolves as `Simulated` and nothing is sent.

The queue retries are per item, and each platform records its own result — one TikTok failure does not hide a successful YouTube upload.

---

## Connect the platforms

Credentials are stored in `data/settings.json` on this machine. The UI only ever receives `configured` flags, never the saved secrets. Use app-specific tokens; never a password.

### YouTube Shorts

1. Create a Google Cloud project and enable **YouTube Data API v3**.
2. Configure the OAuth consent screen and add your account as a test user.
3. Create an OAuth client of type **Desktop app**.
4. Run:

   ```powershell
   npm.cmd run youtube:auth -- --client-id YOUR_ID --client-secret YOUR_SECRET
   ```

   Approve access in the browser. The helper prints a refresh token.
5. Paste the client ID, client secret and refresh token into **Settings → YouTube**.

Unverified API projects can have uploads locked to private until Google audits the app. That is Google's rule, not a setting here.

### TikTok

1. Create an app at <https://developers.tiktok.com> and add the **Content Posting API** product.
2. Request `video.publish` and complete Login Kit OAuth.
3. Paste the user access token into **Settings → TikTok**.

Unaudited apps can usually post only to private / self-only audiences. Public posting needs TikTok review. Tokens expire; re-authorise when posts start failing.

### Instagram Reels

Instagram does not accept a file upload for Reels — Meta pulls the video from a public URL. So:

1. Use an Instagram **Business or Creator** account linked to a Facebook Page.
2. Create a Meta app, add the Instagram Graph API, request `instagram_content_publish`.
3. Get the IG user id:

   ```
   GET /{page-id}?fields=instagram_business_account
   ```

4. Generate a long-lived token with `instagram_basic`, `instagram_content_publish` and `pages_show_list`.
5. Start an HTTPS tunnel to the local API, for example:

   ```powershell
   cloudflared tunnel --url http://127.0.0.1:8787
   ```

6. Put the `https://…` origin into **Settings → Instagram** together with the IG user id and token.

Keep the tunnel running while a reel publishes. The app exposes only `data/exports/` through `/api/public/exports/…` for this purpose. Stop the tunnel when you are done.

### Facebook Page

1. Make sure you can post to the Page as an admin.
2. In the Meta app request `pages_manage_posts` and `pages_read_engagement`.
3. Get a Page access token from `GET /me/accounts`, and copy the Page id beside it.
4. Paste both into **Settings → Facebook**.

Facebook treats these as normal Page videos; vertical framing still matters for the feed.

---

## Where things live

```
data/
  uploads/       source files and preview copies
  exports/       rendered MP4s, grouped by project
  projects/      one JSON record per source
  tmp/           transient WAVs (deleted after analysis)
  models/        cached Whisper models
  settings.json  defaults, brand, platform credentials
  queue.json     scheduled and finished posts
```

Back up `data/settings.json` if you do not want to reconnect the platforms after a reinstall. Delete a source from the library to remove its upload, preview, project record and every export.

---

## Engines and design

- [REA](https://github.com/morluto/rea) — the only analysis source used while building this app. Native and managed analysis engines were skipped because a JS/Electron clipper does not need them.
- [Hallmark](https://github.com/nutlope/hallmark) — the UI design brain. Deep maroon canvas, condensed display type, signal gold, film grain, one stroke icon family.
- [PulseCut](https://github.com/juxPapi/pulsecut) — the ASR → sentence scoring → ASS burn-in path was studied and reused as a reference. This app adds link ingest, the heatmap studio, the publish queue and the four connectors.

---

## Troubleshooting

**"FFmpeg missing" / "yt-dlp missing"** — install them, then restart the app from a new terminal. Check with `ffmpeg -version` and `yt-dlp --version`.

**Nothing is transcribed** — try a bigger Whisper model in **Listen again** (base → small), or set the spoken language explicitly instead of auto-detect.

**Instagram says the public URL is missing** — start the HTTPS tunnel, save its origin in Settings, and keep it alive until the queue item finishes.

**YouTube upload is private** — the OAuth project is unverified. Request an audit or use the private upload as a draft.

**A render fails on an unusual file** — check the log tail in the studio. Rotated phone footage, variable frame rate and 10-bit sources are the usual culprits; transcode the source to H.264/AAC first.

**The desktop window says the build is missing** — run `npm.cmd run build` before `npm.cmd run desktop`.

---

## Tests

```powershell
npm.cmd test
```

The suite covers caption cue chunking, ASS generation and the clip scorer with synthetic transcripts. It does not call FFmpeg or any platform API.
