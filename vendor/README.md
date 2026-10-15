# Vendor Directory & Third-Party Library Notes

## Zero External Runtime Dependencies
This application is intentionally engineered to operate **completely offline without any external CDNs, cloud servers, or remote APIs**.

### Bundled Local Assets
- **Fonts (assets/fonts/)**:
  - `HindSiliguri-Regular.ttf` & `HindSiliguri-Bold.ttf`: Open Font License (OFL) by Indian Type Foundry.
  - `NotoSansBengali.ttf` & `NotoSerifBengali.ttf`: Open Font License (OFL) by Google.
  - `Outfit.ttf`: Open Font License (OFL) by Outfit.io / Rodrigo Fuenzalida.
  - All licenses are preserved in `assets/fonts/OFL.txt`.
- **Music (assets/music/)**:
  - `lofi-peace-15s.wav` & `sad-acoustic-15s.wav`: Original royalty-free synthesized audio loops produced specifically for this application under Public Domain / CC0 equivalent.
- **Patterns & Backgrounds (assets/patterns/, assets/backgrounds/)**:
  - Custom vector SVG assets crafted specifically for this project.

### Native Web APIs Employed
1. **HTML5 Canvas 2D API**: High-resolution rendering, path clipping, typography, text wrapping, and composition.
2. **Web Audio API**: Real-time mixing, stereo gain, panning, trimming, and stream destination piping.
3. **MediaRecorder API**: Native browser video encoding (`canvas.captureStream()` combined with audio tracks).
4. **IndexedDB API**: Client-side storage for projects, custom user audio files, custom user background images, and autosave state.
5. **Service Worker API**: Complete offline application caching and PWA functionality.
6. **Web Workers API**: Background encoding, state processing, and project file packaging.
