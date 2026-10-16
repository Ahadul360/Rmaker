# ReelMaker — Offline Browser-Based Reel Video Generator

> A complete, offline-first, browser-native Reel Video Generator inspired by quote, status, motivational, and romantic text reels shared on TikTok, Instagram Reels, Facebook Reels, and YouTube Shorts.

---

## 🌟 Key Highlights

- **100% Client-Side & Offline Ready**: Runs entirely inside the browser using HTML5, CSS3, Vanilla ES6+ JavaScript, Canvas 2D API, Web Audio API, and MediaRecorder API. **Zero backend, zero external CDNs, zero cloud rendering, zero user accounts, zero remote tracking.**
- **Authentic TikTok & Reels Aesthetic**: Warm cream/beige backgrounds, subtle decorative doodle patterns (hearts, stars, music, botanical), elegant typography, emojis, and social handles.
- **Advanced Bengali & Multilingual Typography**: Bundled with OFL-licensed local fonts (*Hind Siliguri*, *Noto Serif Bengali*, *Noto Sans Bengali*, and *Outfit*). Includes grapheme-cluster-aware text wrapping that preserves complex conjuncts (যুক্তাক্ষর) and vowel signs (কার/মাত্রা).
- **Multitrack Timeline & Scrubbing**: Control video duration (1s–180s), drag element blocks, trim start/end times, zoom in/out, and scrub smoothly with synchronized audio.
- **Real-Time Web Audio Mixing**: Decodes local MP3/WAV files and bundled ambient tracks, handles fades, volume, looping, and generates real-time timeline waveforms.
- **Native Video Export**: Directly encodes `.webm` / `.mp4` video files using browser `MediaRecorder` with resolution options (1080p, 720p, 480p) and frame rates (24, 30, 60 FPS).
- **Local Persistence & Autosave**: Automatic background saving into `IndexedDB` with full project management (New, Save, Open, Duplicate, Delete, Export/Import JSON).
- **PWA Ready**: Features a complete `manifest.json` and versioned `service-worker.js` for true offline caching.

---

## 🚀 Quick Start / Local Setup

Because this application uses native browser APIs like `ServiceWorker`, `AudioContext`, and `MediaRecorder`, modern browsers require it to run in a secure context (such as `localhost` or `https:`).

You can run any static file server:

### Option A: Using Node.js (Built-in `npx`)
```bash
npx serve .
# or
npx http-server .
```

### Option B: Using Python
```bash
python3 -m http.server 8080
```

### Option C: Using VS Code Live Server
Right-click `index.html` and click **"Open with Live Server"**.

Visit `http://localhost:8080` (or the provided port) in your browser.

---

## 📱 Aspect Ratio & Resolution Presets

| Preset | Dimensions (1080p) | Typical Target |
| :--- | :--- | :--- |
| **Vertical 9:16** | 1080 × 1920 px | TikTok, Instagram Reels, YouTube Shorts |
| **Square 1:1** | 1080 × 1080 px | Instagram Grid Posts, Facebook Feeds |
| **Portrait 4:5** | 1080 × 1350 px | Instagram Feed Portrait Posts |

Output resolutions supported:
- **1080p**: Full HD crisp output.
- **720p**: HD balanced rendering (recommended for low-memory devices).
- **480p**: Fast and lightweight.

---

## 🏗️ Architecture & Project Structure

The project strictly adheres to a modular, dependency-free architecture:

```
/
  index.html            # Semantic HTML5 application shell & viewports
  manifest.json         # PWA Web App Manifest
  service-worker.js     # Cache-first offline PWA service worker
  README.md             # Documentation and usage guide

  css/
    styles.css          # Design system tokens, variables, typography (@font-face)
    editor.css          # Toolbar, sidebar drawers, viewport, modals
    timeline.css        # Multitrack timeline, playhead, clip trim handles
    responsive.css      # Mobile sheets, touch targets, tablet adaptations

  js/
    app.js              # Main coordinator and event orchestrator
    state.js            # Reactive state management with Undo/Redo history
    canvas-renderer.js  # Deterministic 2D Canvas rendering pipeline
    text-editor.js      # Typography controls, quotes, badges, shadows, strokes
    background-editor.js# Color presets, gradients, doodle patterns, image uploads
    timeline.js         # Multitrack interactive timeline & audio waveforms
    audio-engine.js     # Web Audio API mixer, decoder, and stream destination
    video-exporter.js   # MediaRecorder engine with frame pacing & codec fallback
    project-storage.js  # IndexedDB persistence, autosave, and JSON export/import
    presets.js          # Aspect ratios, 10 offline templates, emojis, shapes
    utils.js            # Grapheme cluster wrapping, font loader, toasts

  assets/
    fonts/              # Locally bundled OFL fonts (Hind Siliguri, Noto, Outfit)
    backgrounds/        # High-resolution vector backgrounds (cream paper, obsidian)
    patterns/           # SVG doodle patterns (hearts, stars, music, leaves)
    icons/              # High-resolution application and PWA icons
    music/              # Bundled royalty-free audio tracks (lofi-peace, sad-acoustic)
```

---

## 🎨 20 Included Offline Templates

1. **Cream Beige Doodle (TikTok Style)**: The quintessential viral quote reel with warm cream paper, doodle hearts, and centered Bengali poetry.
2. **Sad Quote Reel (নীরব স্মৃতি)**: Contemplative emotional quote with sad acoustic chords, dark cream canvas, and celestial star doodles.
3. **Romantic Love Quote (এক চিলতে স্বস্তি)**: Pastel rose canvas with botanical leaves, heart doodle, and soft romance.
4. **Dark Aesthetic Reel (রাতের নির্জনতা)**: Deep obsidian moody aesthetic, soft glowing white text, and crescent moon emoji.
5. **Motivational Status (সোনালী ভোর)**: Bold uplifting quote on warm ivory with star doodles.
6. **Minimal Typography Reel (ক্লাসিক সেরিফ)**: Off-white canvas with classic serif quotation marks and timeless wisdom.
7. **Bengali Status Reel (সহজ কথা)**: Everyday relatable life status quotes for Facebook & WhatsApp.
8. **English Quote Reel (Timeless Wisdom)**: Clean international English layout with Outfit typography.
9. **Emoji Reaction Reel (মন ভালো করার গান)**: Large animated emoji with music note doodles and pill text badges.
10. **Blank Canvas (কাস্টম প্রজেক্ট)**: Clean cream slate for full creative freedom.
11. **Midnight Emerald (প্রকৃতির নির্জনতা)**: Lush dark forest green canvas with botanical doodles, mint highlights and calming deep ambient audio.
12. **Coffee & Cozy Café (এক কাপ কফি ও স্মৃতি)**: Warm roasted café beige aesthetic with charming coffee doodles and calm chill vibes.
13. **Velvet Wine & Poetry (গোধূলির কবিতা)**: Luxurious velvet wine canvas with soft starry glow and deep emotional Bengali poetry.
14. **Celestial Galaxy (তারার মেলা)**: Cosmic galaxy doodles with neon celestial blue starlight typography and inspiring status.
15. **Vintage Notebook Grid (স্মৃতির ডায়রি)**: Aesthetic antique parchment notebook with classic grid pattern and nostalgic diary quotes.
16. **Sunburst Golden Hour (সোনালী বিকেল)**: Warm terracotta golden hour vibes with radiant sunburst doodles and uplifting melody.
17. **Rainy Monsoon Mood (বৃষ্টির গান)**: Moody slate blue canvas with gentle wave ripples, rain drops and soothing ambient audio.
18. **Flutters & Butterflies (নতুন স্বপ্নের ডানা)**: Delicate blush pink paper with graceful butterfly flutters and motivating aesthetic.
19. **Square 1:1 Quote Card (ইনস্টাগ্রাম কোট)**: Classic 1:1 square post reel with elegant paper dots, clean serif and piano melody.
20. **Portrait 4:5 Aesthetic Post (সৌন্দর্যের গল্প)**: Modern 4:5 portrait aspect ratio optimized for Instagram feed reels and status.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Space</kbd> | Play / Pause Preview Playhead |
| <kbd>Ctrl</kbd> / <kbd>Cmd</kbd> + <kbd>Z</kbd> | Undo |
| <kbd>Ctrl</kbd> / <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> | Redo |
| <kbd>Ctrl</kbd> / <kbd>Cmd</kbd> + <kbd>S</kbd> | Save Project |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | Delete Selected Element |
| <kbd>Esc</kbd> | Deselect Element / Close Active Modal |

---

## 🌐 Browser Compatibility & Technical Notes

- **Google Chrome / Microsoft Edge / Chromium**: Full support for WebM (VP9/VP8) export, MediaRecorder, Web Audio, and IndexedDB.
- **Mozilla Firefox**: Full support for WebM export and Web Audio.
- **Apple Safari (macOS & iOS)**: Safari supports MediaRecorder with MP4/H.264 codecs natively in modern versions.
- **Mobile Browsers**: Supported on Android Chrome and iOS Safari. Touch dragging is protected with `touch-action: none` to avoid accidental page scrolling while positioning elements.

---

## 🚀 Production Deployment

For complete instructions on deploying ReelMaker to a real server (Nginx, Caddy, Apache, Docker, Vercel, Cloudflare Pages, or GitHub Pages), check the [Deployment Guide (deploy.md)](./deploy.md).
