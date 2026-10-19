/**
 * ReelMaker Video Export Engine
 * Dual-engine video export:
 * 1. WebCodecs (VideoEncoder + AudioEncoder) + mp4-muxer for genuine, standard H.264/AAC MP4 with FastStart
 *    - Fully compatible with TikTok, Facebook Reels, YouTube Shorts, and Instagram.
 *    - Accurate duration metadata written to ISO BMFF mvhd & tkhd boxes.
 * 2. MediaRecorder + fix-webm-duration for WebM (VP9/VP8 + Opus) & fallback
 *    - Automatically injects EBML Duration metadata (0x4489) for seeking & timeline display.
 */

import { Utils } from './utils.js';
import { State } from './state.js';
import { CanvasRenderer } from './canvas-renderer.js';
import { AudioSys } from './audio-engine.js';
import { Presets } from './presets.js';
import * as Mp4Muxer from './mp4-muxer.js';
import { fixWebmDuration } from './fix-webm-duration.js';

export class VideoExporter {
  constructor() {
    this.isExporting = false;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.exportCanvas = null;
    this.exportRenderer = null;
    this.abortController = null;
    this.exportModal = null;
    this.resultBlob = null;
    this.resultUrl = null;
    this.resultFormat = 'mp4';

    this.initExportModal();
  }

  initExportModal() {
    let modal = document.getElementById('export-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'export-modal';
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-card export-card" role="dialog" aria-modal="true" aria-labelledby="export-title">
          <div class="modal-header">
            <h3 id="export-title">Export Reel Video</h3>
            <button class="modal-close" id="btn-close-export">&times;</button>
          </div>

          <!-- Configuration View -->
          <div class="modal-body" id="export-config-view">
            <!-- 1. Format Selection -->
            <div class="form-group">
              <label for="export-format">Export Video Format:</label>
              <select id="export-format" class="form-select">
                <option value="mp4" selected>MP4 Video (.mp4) — Universal (TikTok, Facebook, YouTube, Reels)</option>
                <option value="webm">WebM Video (.webm) — High Quality (Web, Chrome & Discord)</option>
              </select>
              <div class="format-help-text" id="export-format-help" style="font-size: 11.5px; color: #94A3B8; margin-top: 6px; line-height: 1.4;">
                ✓ Standard H.264 / AAC MP4 with FastStart headers. Ready for TikTok, Facebook Reels, YouTube Shorts & Instagram.
              </div>
            </div>

            <!-- 2. Resolution -->
            <div class="form-group">
              <label for="export-resolution">Resolution:</label>
              <select id="export-resolution" class="form-select">
                <option value="1080p" selected>1080p (Full HD - High Quality)</option>
                <option value="720p">720p (HD - Balanced)</option>
                <option value="480p">480p (SD - Light / Fast)</option>
              </select>
            </div>

            <!-- 3. Frame Rate -->
            <div class="form-group">
              <label for="export-fps">Frame Rate:</label>
              <select id="export-fps" class="form-select">
                <option value="30" selected>30 FPS (Standard Social Media)</option>
                <option value="24">24 FPS (Cinematic Look)</option>
                <option value="60">60 FPS (Ultra Smooth Motion)</option>
              </select>
            </div>

            <!-- 4. Aspect Ratio -->
            <div class="form-group">
              <label for="export-aspect-display">Aspect Ratio:</label>
              <input type="text" id="export-aspect-display" class="form-input" disabled />
            </div>

            <!-- 5. Audio Toggle -->
            <div class="form-group checkbox-group">
              <label>
                <input type="checkbox" id="export-include-audio" checked />
                <span>Include Music / Audio Track</span>
              </label>
            </div>

            <div class="export-notes">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              <span id="export-engine-info">Export renders 100% locally in your browser. Embedded duration ensures seeking & full compatibility.</span>
            </div>

            <div class="modal-footer">
              <button class="btn btn-secondary" id="btn-cancel-config">Cancel</button>
              <button class="btn btn-primary" id="btn-start-export">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <span id="btn-start-export-label">Start Export (MP4)</span>
              </button>
            </div>
          </div>

          <!-- Progress View -->
          <div class="modal-body" id="export-progress-view" style="display: none;">
            <div class="export-spinner-container">
              <div class="spinner-ring"></div>
              <div class="progress-percent" id="export-percent">0%</div>
            </div>

            <div class="progress-bar-track">
              <div class="progress-bar-fill" id="export-progress-bar"></div>
            </div>

            <div class="export-stats-grid">
              <div class="stat-item">
                <span class="stat-label">Progress:</span>
                <span class="stat-value" id="stat-time">0.0s / 15.0s</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Resolution:</span>
                <span class="stat-value" id="stat-res">1080x1920</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">FPS:</span>
                <span class="stat-value" id="stat-fps">30 FPS</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Engine:</span>
                <span class="stat-value" id="stat-engine">WebCodecs (H.264)</span>
              </div>
            </div>

            <div class="modal-footer">
              <button class="btn btn-danger" id="btn-cancel-rendering">Cancel Export</button>
            </div>
          </div>

          <!-- Completion View -->
          <div class="modal-body" id="export-complete-view" style="display: none;">
            <div class="export-success-badge">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2ED573" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <h4 id="export-complete-title">Reel Video Ready (.mp4)!</h4>
              <p id="export-complete-subtitle" style="font-size: 12px; color: var(--text-muted); margin: 0;">Full duration metadata included & ready to upload.</p>
            </div>

            <div class="export-preview-wrapper">
              <video id="export-video-preview" controls playsinline></video>
            </div>

            <div class="modal-footer flex-column">
              <button class="btn btn-primary btn-block" id="btn-download-video">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span id="btn-download-label">Download MP4 Video</span>
              </button>
              <button class="btn btn-secondary btn-block" id="btn-export-again">Export Another Format / Resolution</button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      this.exportModal = modal;
      this.bindModalEvents();
    }
  }

  bindModalEvents() {
    const modal = this.exportModal;

    modal.querySelector('#btn-close-export').addEventListener('click', () => this.closeModal());
    modal.querySelector('#btn-cancel-config').addEventListener('click', () => this.closeModal());
    modal.querySelector('#btn-cancel-rendering').addEventListener('click', () => this.cancelExport());

    // Format selection change
    const selectFormat = modal.querySelector('#export-format');
    const formatHelp = modal.querySelector('#export-format-help');
    const startExportLabel = modal.querySelector('#btn-start-export-label');

    const updateFormatUI = () => {
      const val = selectFormat.value;
      if (val === 'mp4') {
        formatHelp.innerHTML = '✓ Standard H.264 / AAC MP4 with FastStart headers. Ready for TikTok, Facebook Reels, YouTube Shorts & Instagram.';
        startExportLabel.textContent = 'Start Export (MP4)';
      } else {
        formatHelp.innerHTML = '✓ WebM video with VP9/VP8 & embedded EBML duration metadata. Compatible with Web, Chrome, Firefox & Discord.';
        startExportLabel.textContent = 'Start Export (WebM)';
      }
    };

    selectFormat.addEventListener('change', updateFormatUI);

    modal.querySelector('#btn-start-export').addEventListener('click', () => {
      const format = selectFormat.value;
      const resolution = modal.querySelector('#export-resolution').value;
      const fps = parseInt(modal.querySelector('#export-fps').value, 10);
      const includeAudio = modal.querySelector('#export-include-audio').checked;
      this.startExport({ format, resolution, fps, includeAudio });
    });

    modal.querySelector('#btn-download-video').addEventListener('click', () => {
      this.downloadExportedVideo();
    });

    modal.querySelector('#btn-export-again').addEventListener('click', () => {
      this.showConfigView();
    });
  }

  openSettings() {
    if (this.isExporting) return;
    const modal = this.exportModal;
    modal.querySelector('#export-aspect-display').value = `${State.project.aspectRatio} (${Presets.aspectRatios[State.project.aspectRatio].name})`;
    this.showConfigView();
    modal.classList.add('active');
  }

  closeModal() {
    if (this.isExporting) {
      if (!confirm('Video is currently exporting. Do you want to cancel?')) return;
      this.cancelExport();
    }
    this.exportModal.classList.remove('active');
  }

  showConfigView() {
    this.exportModal.querySelector('#export-config-view').style.display = 'block';
    this.exportModal.querySelector('#export-progress-view').style.display = 'none';
    this.exportModal.querySelector('#export-complete-view').style.display = 'none';
  }

  showProgressView() {
    this.exportModal.querySelector('#export-config-view').style.display = 'none';
    this.exportModal.querySelector('#export-progress-view').style.display = 'block';
    this.exportModal.querySelector('#export-complete-view').style.display = 'none';
  }

  setupExportCanvas(w, h) {
    if (!this.exportCanvas) {
      this.exportCanvas = document.createElement('canvas');
      this.exportCanvas.id = 'reelmaker-export-canvas';
      // In iOS 18 WebKit / Mobile Safari, off-screen canvases outside the viewport (-9999px or 1px)
      // have their GPU backing store suspended or culled.
      // Keeping it within viewport bounds with non-zero dimensions and near-zero opacity ensures
      // WebCodecs VideoFrame and captureStream encode crisp frames without failure.
      this.exportCanvas.style.cssText = 'position:fixed; left:0; top:0; width:120px; height:120px; opacity:0.001; pointer-events:none; z-index:-1;';
      document.body.appendChild(this.exportCanvas);
    }
    this.exportCanvas.width = w;
    this.exportCanvas.height = h;
    this.exportRenderer = new CanvasRenderer(this.exportCanvas);
    return this.exportCanvas;
  }

  cleanupExportCanvas() {
    if (this.exportCanvas && this.exportCanvas.parentNode) {
      try {
        this.exportCanvas.parentNode.removeChild(this.exportCanvas);
      } catch (e) {}
    }
    this.exportCanvas = null;
    this.exportRenderer = null;
  }

  showCompleteView(blobUrl) {
    this.exportModal.querySelector('#export-config-view').style.display = 'none';
    this.exportModal.querySelector('#export-progress-view').style.display = 'none';
    const completeView = this.exportModal.querySelector('#export-complete-view');
    completeView.style.display = 'block';

    const isMp4 = this.resultFormat === 'mp4';
    const ext = isMp4 ? '.mp4' : '.webm';
    completeView.querySelector('#export-complete-title').textContent = `Reel Video Ready (${ext})!`;

    // Detect if Web Share API with files is available (iOS Safari Save to Photos)
    const canShareFiles = typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      typeof File !== 'undefined';

    const downloadLabel = completeView.querySelector('#btn-download-label');
    if (downloadLabel) {
      downloadLabel.textContent = canShareFiles
        ? 'Save to Photos / Share Video'
        : (isMp4 ? 'Download MP4 Video' : 'Download WebM Video');
    }

    const videoEl = completeView.querySelector('#export-video-preview');
    videoEl.src = blobUrl;
    videoEl.load();
  }

  async startExport(options) {
    if (this.isExporting) return;

    const { format = 'mp4' } = options;
    const hasWebCodecs = typeof window !== 'undefined' &&
      typeof window.VideoEncoder !== 'undefined' &&
      typeof window.VideoFrame !== 'undefined';

    // If user wants MP4 and browser has WebCodecs, check for H.264/AVC support.
    // WebCodecs encodes frames directly from canvas without requiring MediaStream/MediaRecorder,
    // avoiding the known WebKit bug on iOS Safari where mixed canvas+audio MediaStreams fail.
    if (format === 'mp4' && hasWebCodecs) {
      const isAvcSupported = await this.checkAvcSupport(options);
      if (isAvcSupported) {
        return this.exportWithWebCodecs(options);
      }
    }

    // Otherwise use MediaRecorder with duration patching
    return this.exportWithMediaRecorder(options);
  }

  async checkAvcSupport(options) {
    const { resolution = '1080p', fps = 30 } = options;
    const project = State.project;
    const baseWidth = Presets.aspectRatios[project.aspectRatio].width;
    const baseHeight = Presets.aspectRatios[project.aspectRatio].height;
    const scale = Presets.resolutions[resolution].scale;
    const exportW = Math.round(baseWidth * scale);
    const exportH = Math.round(baseHeight * scale);

    // Order matters: check Level 4.2 / Level 4.0 first (required for 1080p hardware encoding on iOS Safari)
    const avcProfiles = [
      'avc1.4d002a', // Main Profile, Level 4.2 (Standard Apple VideoToolbox HW)
      'avc1.640028', // High Profile, Level 4.0
      'avc1.420028', // Baseline Profile, Level 4.0
      'avc1.4d0028', // Main Profile, Level 4.0
      'avc1.42001f', // Baseline Profile, Level 3.1
      'avc1.42E01E'  // Constrained Baseline
    ];
    for (const codec of avcProfiles) {
      try {
        const res = await VideoEncoder.isConfigSupported({
          codec,
          width: exportW,
          height: exportH,
          bitrate: resolution === '1080p' ? 8000000 : 4000000,
          framerate: fps
        });
        if (res && res.supported) {
          return codec;
        }
      } catch (e) {}
    }
    return false;
  }

  /**
   * Pipeline 1: WebCodecs + mp4-muxer
   * Generates true H.264/AAC MP4 with FastStart (moov atom at front) and exact duration.
   * Perfect for TikTok, Facebook Reels, YouTube Shorts & Instagram.
   */
  async exportWithWebCodecs(options) {
    const { resolution = '1080p', fps = 30, includeAudio = true } = options;
    const project = State.project;
    const duration = project.duration;
    const baseWidth = Presets.aspectRatios[project.aspectRatio].width;
    const baseHeight = Presets.aspectRatios[project.aspectRatio].height;
    const scale = Presets.resolutions[resolution].scale;

    const exportW = Math.round(baseWidth * scale);
    const exportH = Math.round(baseHeight * scale);
    const videoBitrate = resolution === '1080p' ? 8000000 : (resolution === '720p' ? 5000000 : 3000000);

    const avcCodec = await this.checkAvcSupport(options) || 'avc1.4d002a';

    // Prepare DOM-attached offscreen canvas (prevents iOS WebKit GPU buffer suspension)
    this.setupExportCanvas(exportW, exportH);

    this.showProgressView();
    this.isExporting = true;
    this.resultFormat = 'mp4';
    this.abortController = new AbortController();

    const statRes = this.exportModal.querySelector('#stat-res');
    const statFps = this.exportModal.querySelector('#stat-fps');
    const statEngine = this.exportModal.querySelector('#stat-engine');
    statRes.textContent = `${exportW}×${exportH}`;
    statFps.textContent = `${fps} FPS`;
    statEngine.textContent = 'WebCodecs (MP4 H.264)';

    try {
      // 1. Check AudioEncoder support for AAC
      let canEncodeAudio = false;
      let audioTrackConfig = undefined;

      if (includeAudio && project.audio && project.audio.enabled && !project.audio.muted && typeof window.AudioEncoder !== 'undefined') {
        try {
          const aCheck = await AudioEncoder.isConfigSupported({
            codec: 'mp4a.40.2',
            numberOfChannels: 2,
            sampleRate: 44100,
            bitrate: 128000
          });
          if (aCheck && aCheck.supported) {
            canEncodeAudio = true;
            audioTrackConfig = {
              codec: 'aac',
              numberOfChannels: 2,
              sampleRate: 44100
            };
          }
        } catch (e) {
          canEncodeAudio = false;
        }
      }

      // 2. Initialize MP4 Muxer with FastStart & offset first timestamp behavior
      const muxer = new Mp4Muxer.Muxer({
        target: new Mp4Muxer.ArrayBufferTarget(),
        video: {
          codec: 'avc',
          width: exportW,
          height: exportH,
          frameRate: fps
        },
        audio: audioTrackConfig,
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset'
      });

      // 3. Initialize VideoEncoder with monotonic timestamp enforcement
      let lastVideoTimestampUs = -1;
      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => {
          let ts = chunk.timestamp;
          if (ts < 0) ts = 0;
          if (ts <= lastVideoTimestampUs) {
            ts = lastVideoTimestampUs + 1;
          }
          lastVideoTimestampUs = ts;
          muxer.addVideoChunk(chunk, meta, ts);
        },
        error: (err) => console.error('[VideoEncoder error]', err)
      });

      videoEncoder.configure({
        codec: avcCodec,
        width: exportW,
        height: exportH,
        bitrate: videoBitrate,
        framerate: fps
      });

      // 4. Encode Audio (if enabled and AudioEncoder supported)
      let audioEncoder = null;
      if (canEncodeAudio) {
        const renderedBuffer = await AudioSys.renderOfflineAudio(duration, 44100);
        if (renderedBuffer && this.isExporting && !this.abortController.signal.aborted) {
          audioEncoder = new AudioEncoder({
            output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
            error: (err) => console.warn('[AudioEncoder error]', err)
          });

          audioEncoder.configure({
            codec: 'mp4a.40.2',
            numberOfChannels: 2,
            sampleRate: 44100,
            bitrate: 128000
          });

          const totalAudioSamples = renderedBuffer.length;
          const left = renderedBuffer.getChannelData(0);
          const right = renderedBuffer.numberOfChannels > 1 ? renderedBuffer.getChannelData(1) : left;
          const chunkSize = 1024;

          for (let offset = 0; offset < totalAudioSamples; offset += chunkSize) {
            const framesThisChunk = Math.min(chunkSize, totalAudioSamples - offset);
            const planarData = new Float32Array(framesThisChunk * 2);
            planarData.set(left.subarray(offset, offset + framesThisChunk), 0);
            planarData.set(right.subarray(offset, offset + framesThisChunk), framesThisChunk);

            const audioData = new AudioData({
              format: 'f32-planar',
              sampleRate: 44100,
              numberOfFrames: framesThisChunk,
              numberOfChannels: 2,
              timestamp: Math.round((offset / 44100) * 1000000),
              data: planarData
            });

            audioEncoder.encode(audioData);
            audioData.close();
          }

          await audioEncoder.flush();
        }
      }

      // 5. Encode Video Frames
      const totalFrames = Math.ceil(duration * fps);
      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
        if (!this.isExporting || this.abortController.signal.aborted) {
          this.cleanupExportCanvas();
          return;
        }

        const currentTime = frameIndex / fps;
        this.exportRenderer.renderFrame(currentTime, this.exportCanvas, { isExport: true });

        const timestampUs = Math.round(currentTime * 1000000);
        const videoFrame = new VideoFrame(this.exportCanvas, { timestamp: timestampUs });
        const isKey = frameIndex % (fps * 2) === 0;

        videoEncoder.encode(videoFrame, { keyFrame: isKey });
        videoFrame.close();

        // Control memory queue backpressure
        if (videoEncoder.encodeQueueSize > 6) {
          await new Promise(r => setTimeout(r, 4));
        }

        if (frameIndex % 3 === 0 || frameIndex === totalFrames - 1) {
          this.updateProgress(currentTime, duration, frameIndex, totalFrames);
          await new Promise(r => setTimeout(r, 0));
        }
      }

      await videoEncoder.flush();
      muxer.finalize();

      this.cleanupExportCanvas();

      this.resultBlob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
      this.resultUrl = URL.createObjectURL(this.resultBlob);
      this.isExporting = false;

      this.showCompleteView(this.resultUrl);
      Utils.showToast('Reel video exported in MP4 format (Social Media Ready)!', 'success');
    } catch (err) {
      console.error('WebCodecs export failed:', err);
      this.cleanupExportCanvas();
      // If WebCodecs failed unexpectedly, fallback to MediaRecorder
      if (this.isExporting && !this.abortController.signal.aborted) {
        console.warn('Falling back to MediaRecorder...');
        return this.exportWithMediaRecorder(options);
      }
      this.cancelExport();
      Utils.showToast(`Export failed: ${err.message}`, 'error');
    }
  }

  /**
   * Pipeline 2: MediaRecorder with fix-webm-duration
   * Records canvas and audio streams, then patches duration metadata into the EBML header.
   */
  async exportWithMediaRecorder(options) {
    const { format = 'webm', resolution = '1080p', fps = 30, includeAudio = true } = options;
    const project = State.project;
    const duration = project.duration;
    const baseWidth = Presets.aspectRatios[project.aspectRatio].width;
    const baseHeight = Presets.aspectRatios[project.aspectRatio].height;
    const scale = Presets.resolutions[resolution].scale;

    const exportW = Math.round(baseWidth * scale);
    const exportH = Math.round(baseHeight * scale);

    // Determine supported MIME type
    let mimeType = '';
    let targetFormat = format;

    if (format === 'mp4') {
      const mp4Types = [
        'video/mp4;codecs=avc1.4d002a,mp4a.40.2',
        'video/mp4;codecs=avc1.420028,mp4a.40.2',
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4;codecs=avc1',
        'video/mp4'
      ];
      for (const t of mp4Types) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
          mimeType = t;
          break;
        }
      }
      if (!mimeType) {
        targetFormat = 'webm';
        Utils.showToast('Your browser does not support native MP4 recording. Exporting as WebM with duration.', 'info');
      }
    }

    if (!mimeType) {
      const webmTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
      ];
      for (const t of webmTypes) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
          mimeType = t;
          break;
        }
      }
    }

    if (!mimeType) {
      Utils.showToast('No compatible video recording format supported in this browser.', 'error');
      return;
    }

    // Attach to DOM so captureStream works reliably in iOS WebKit / Safari
    this.setupExportCanvas(exportW, exportH);

    this.showProgressView();
    this.isExporting = true;
    this.resultFormat = targetFormat;
    this.recordedChunks = [];
    this.abortController = new AbortController();

    const statRes = this.exportModal.querySelector('#stat-res');
    const statFps = this.exportModal.querySelector('#stat-fps');
    const statEngine = this.exportModal.querySelector('#stat-engine');
    statRes.textContent = `${exportW}×${exportH}`;
    statFps.textContent = `${fps} FPS`;
    statEngine.textContent = targetFormat === 'mp4' ? 'MediaRecorder (MP4)' : 'MediaRecorder (WebM + Duration Fix)';

    try {
      const canvasStream = this.exportCanvas.captureStream(fps);
      const combinedTracks = [...canvasStream.getVideoTracks()];

      let audioStream = null;
      if (includeAudio && project.audio && project.audio.enabled) {
        try {
          audioStream = AudioSys.getAudioMediaStream();
          if (audioStream && audioStream.getAudioTracks().length > 0) {
            combinedTracks.push(audioStream.getAudioTracks()[0]);
          }
        } catch (e) {
          console.warn('[Export] Audio stream capture skipped:', e);
        }
      }

      let combinedStream = new MediaStream(combinedTracks);
      try {
        this.mediaRecorder = new MediaRecorder(combinedStream, {
          mimeType,
          videoBitsPerSecond: resolution === '1080p' ? 8000000 : 4000000
        });
      } catch (e) {
        // Fallback for iOS WebKit (Bug 194640) where mixed canvas+audio stream throws NotSupportedError
        console.warn('[Export] MediaRecorder rejected mixed audio+video stream, falling back to video-only track:', e);
        combinedStream = new MediaStream([...canvasStream.getVideoTracks()]);
        this.mediaRecorder = new MediaRecorder(combinedStream, {
          mimeType,
          videoBitsPerSecond: resolution === '1080p' ? 8000000 : 4000000
        });
      }

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.start(400);

      if (includeAudio && project.audio && project.audio.enabled) {
        AudioSys.playAt(0);
      }

      const totalFrames = Math.ceil(duration * fps);
      const frameIntervalMs = 1000 / fps;
      let frameIndex = 0;

      const videoTrack = canvasStream.getVideoTracks()[0];
      const hasRequestFrame = !!(videoTrack && videoTrack.requestFrame);

      const renderLoop = async () => {
        if (!this.isExporting || this.abortController.signal.aborted) {
          this.cleanupExportCanvas();
          return;
        }

        const currentTime = frameIndex / fps;
        if (currentTime > duration || frameIndex >= totalFrames) {
          this.finishMediaRecorderExport(mimeType, targetFormat, duration);
          return;
        }

        this.exportRenderer.renderFrame(currentTime, this.exportCanvas, { isExport: true });

        if (hasRequestFrame) {
          try {
            videoTrack.requestFrame();
          } catch (e) {}
        }

        this.updateProgress(currentTime, duration, frameIndex, totalFrames);
        frameIndex++;
        setTimeout(renderLoop, frameIntervalMs);
      };

      renderLoop();
    } catch (err) {
      console.error('MediaRecorder export failed:', err);
      this.cleanupExportCanvas();
      this.cancelExport();
      Utils.showToast(`Export failed: ${err.message}`, 'error');
    }
  }

  async finishMediaRecorderExport(mimeType, targetFormat, duration) {
    if (!this.isExporting) return;

    AudioSys.stop();

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.onstop = async () => {
        const rawBlob = new Blob(this.recordedChunks, { type: mimeType });

        if (targetFormat === 'webm') {
          // Patch EBML duration metadata for full player seeking & social upload validation
          try {
            const fixedBlob = await fixWebmDuration(rawBlob, Math.round(duration * 1000));
            this.resultBlob = fixedBlob;
          } catch (e) {
            console.warn('fixWebmDuration fallback:', e);
            this.resultBlob = rawBlob;
          }
        } else {
          this.resultBlob = rawBlob;
        }

        this.cleanupExportCanvas();

        this.resultUrl = URL.createObjectURL(this.resultBlob);
        this.isExporting = false;
        this.showCompleteView(this.resultUrl);
        Utils.showToast(`Reel video ready in ${targetFormat.toUpperCase()} format!`, 'success');
      };
      this.mediaRecorder.stop();
    } else {
      this.cleanupExportCanvas();
    }
  }

  updateProgress(currentTime, duration, frameIndex, totalFrames) {
    const percent = Math.min(100, Math.floor((frameIndex / totalFrames) * 100));
    this.exportModal.querySelector('#export-percent').textContent = `${percent}%`;
    this.exportModal.querySelector('#export-progress-bar').style.width = `${percent}%`;
    this.exportModal.querySelector('#stat-time').textContent = `${currentTime.toFixed(1)}s / ${duration.toFixed(1)}s`;
  }

  cancelExport() {
    this.isExporting = false;
    if (this.abortController) {
      this.abortController.abort();
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (e) {}
    }
    AudioSys.stop();
    this.cleanupExportCanvas();
    this.recordedChunks = [];
    this.showConfigView();
    Utils.showToast('Export cancelled.', 'info');
  }

  async downloadExportedVideo() {
    if (!this.resultBlob || !this.resultUrl) return;

    const isMp4 = this.resultFormat === 'mp4';
    const ext = isMp4 ? 'mp4' : 'webm';
    const mimeType = isMp4 ? 'video/mp4' : 'video/webm';
    const safeName = (State.project.name || 'reel').replace(/[^a-z0-9_\-\u0980-\u09FF]/gi, '_');
    const filename = `${safeName}_${Date.now()}.${ext}`;

    const videoFile = new File([this.resultBlob], filename, { type: mimeType });

    // 1. Web Share API (Primary for iOS Safari / Mobile - lets user "Save Video" to Camera Roll / Photos)
    if (navigator.canShare && navigator.canShare({ files: [videoFile] })) {
      try {
        await navigator.share({
          files: [videoFile],
          title: State.project.name || 'Reel Video',
          text: 'Created with ReelMaker'
        });
        Utils.showToast('Video saved / shared successfully!', 'success');
        return;
      } catch (err) {
        if (err.name === 'AbortError') {
          return; // User cancelled the native share sheet
        }
        console.warn('Web Share failed, falling back to direct download:', err);
      }
    }

    // 2. Fallback to standard anchor download (Desktop & browsers without Web Share)
    const a = document.createElement('a');
    a.href = this.resultUrl;
    a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 150);

    Utils.showToast(`Saved as ${filename}`, 'success');
  }
}

export const Exporter = new VideoExporter();
