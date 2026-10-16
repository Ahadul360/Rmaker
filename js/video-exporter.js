/**
 * ReelMaker Video Export Engine
 * Browser-native offline video recording using Canvas captureStream,
 * Web Audio MediaStream mixing, and MediaRecorder with supported codec detection.
 */

import { Utils } from './utils.js';
import { State } from './state.js';
import { CanvasRenderer } from './canvas-renderer.js';
import { AudioSys } from './audio-engine.js';
import { Presets } from './presets.js';

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

    this.initExportModal();
  }

  initExportModal() {
    let modal = document.getElementById('export-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'export-modal';
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-card export-card" role="dialog" aria-modal="true">
          <div class="modal-header">
            <h3 id="export-title">Export Reel Video</h3>
            <button class="modal-close" id="btn-close-export">&times;</button>
          </div>

          <!-- Configuration View -->
          <div class="modal-body" id="export-config-view">
            <div class="form-group">
              <label>Export Format:</label>
              <input type="text" class="form-input" value="MP4 Video (.mp4)" disabled style="font-weight: 600; color: #4FACFE;" />
            </div>

            <div class="form-group">
              <label>Resolution:</label>
              <select id="export-resolution" class="form-select">
                <option value="1080p" selected>1080p (Full HD - High Quality)</option>
                <option value="720p">720p (HD - Balanced)</option>
                <option value="480p">480p (SD - Light / Fast)</option>
              </select>
            </div>

            <div class="form-group">
              <label>Frame Rate:</label>
              <select id="export-fps" class="form-select">
                <option value="30" selected>30 FPS (Standard)</option>
                <option value="24">24 FPS (Cinematic)</option>
                <option value="60">60 FPS (Ultra Smooth)</option>
              </select>
            </div>

            <div class="form-group">
              <label>Aspect Ratio:</label>
              <input type="text" id="export-aspect-display" class="form-input" disabled />
            </div>

            <div class="form-group checkbox-group">
              <label>
                <input type="checkbox" id="export-include-audio" checked />
                <span>Include Music / Audio</span>
              </label>
            </div>

            <div class="export-notes">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              <span>Export renders 100% locally in your browser. Keep this tab active while exporting.</span>
            </div>

            <div class="modal-footer">
              <button class="btn btn-secondary" id="btn-cancel-config">Cancel</button>
              <button class="btn btn-primary" id="btn-start-export">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <span>Start Export (MP4)</span>
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
                <span class="stat-label">Est. Size:</span>
                <span class="stat-value" id="stat-size">Calculating...</span>
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
              <h4>Reel Video Ready (.mp4)!</h4>
            </div>

            <div class="export-preview-wrapper">
              <video id="export-video-preview" controls playsinline></video>
            </div>

            <div class="modal-footer flex-column">
              <button class="btn btn-primary btn-block" id="btn-download-video">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span>Download MP4 Video</span>
              </button>
              <button class="btn btn-secondary btn-block" id="btn-export-again">Export Another Resolution</button>
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

    modal.querySelector('#btn-start-export').addEventListener('click', () => {
      const resolution = modal.querySelector('#export-resolution').value;
      const fps = parseInt(modal.querySelector('#export-fps').value, 10);
      const includeAudio = modal.querySelector('#export-include-audio').checked;
      this.startExport({ resolution, fps, includeAudio });
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

  showCompleteView(blobUrl) {
    this.exportModal.querySelector('#export-config-view').style.display = 'none';
    this.exportModal.querySelector('#export-progress-view').style.display = 'none';
    const completeView = this.exportModal.querySelector('#export-complete-view');
    completeView.style.display = 'block';

    const videoEl = completeView.querySelector('#export-video-preview');
    videoEl.src = blobUrl;
    videoEl.load();
  }

  /**
   * Supported MIME type tester
   */
  getSupportedMimeType() {
    const types = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=avc1.4d002a,mp4a.40.2',
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4;codecs=avc1',
      'video/mp4;codecs=h264,aac',
      'video/mp4;codecs=h264',
      'video/mp4',
      'video/webm;codecs=h264,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];

    for (const type of types) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  }

  async startExport(options) {
    if (this.isExporting) return;

    const mimeType = this.getSupportedMimeType();
    if (!mimeType) {
      Utils.showToast('Your browser does not support MediaRecorder video export.', 'error');
      return;
    }

    const { resolution = '1080p', fps = 30, includeAudio = true } = options;
    const project = State.project;
    const duration = project.duration;
    const baseWidth = Presets.aspectRatios[project.aspectRatio].width;
    const baseHeight = Presets.aspectRatios[project.aspectRatio].height;
    const scale = Presets.resolutions[resolution].scale;

    const exportW = Math.round(baseWidth * scale);
    const exportH = Math.round(baseHeight * scale);

    // Prepare offscreen canvas
    this.exportCanvas = document.createElement('canvas');
    this.exportCanvas.width = exportW;
    this.exportCanvas.height = exportH;
    this.exportRenderer = new CanvasRenderer(this.exportCanvas);

    // Switch view
    this.showProgressView();
    this.isExporting = true;
    this.recordedChunks = [];
    this.abortController = new AbortController();

    const statRes = this.exportModal.querySelector('#stat-res');
    const statFps = this.exportModal.querySelector('#stat-fps');
    statRes.textContent = `${exportW}×${exportH}`;
    statFps.textContent = `${fps} FPS`;

    try {
      // 1. Capture stream from canvas
      const canvasStream = this.exportCanvas.captureStream(fps);
      const combinedTracks = [...canvasStream.getVideoTracks()];

      // 2. Mix in Audio Track if enabled
      let audioStream = null;
      if (includeAudio && project.audio && project.audio.enabled) {
        audioStream = AudioSys.getAudioMediaStream();
        if (audioStream && audioStream.getAudioTracks().length > 0) {
          combinedTracks.push(audioStream.getAudioTracks()[0]);
        }
      }

      const combinedStream = new MediaStream(combinedTracks);
      this.mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: resolution === '1080p' ? 8000000 : 4000000
      });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      // Start recorder with 500ms chunk slices
      this.mediaRecorder.start(500);

      // Start audio playback at 0s synchronized with recording
      if (includeAudio && project.audio && project.audio.enabled) {
        AudioSys.playAt(0);
      }

      // Frame-by-frame controlled rendering loop
      const totalFrames = Math.ceil(duration * fps);
      const frameIntervalMs = 1000 / fps;
      let frameIndex = 0;

      const videoTrack = canvasStream.getVideoTracks()[0];
      const hasRequestFrame = !!(videoTrack && videoTrack.requestFrame);

      const renderLoop = async () => {
        if (!this.isExporting || this.abortController.signal.aborted) {
          return;
        }

        const currentTime = (frameIndex / fps);
        if (currentTime > duration || frameIndex >= totalFrames) {
          // Rendered final frame
          this.finishExport(mimeType);
          return;
        }

        // Deterministically render exact frame
        this.exportRenderer.renderFrame(currentTime, this.exportCanvas, { isExport: true });

        if (hasRequestFrame) {
          try {
            videoTrack.requestFrame();
          } catch (e) {}
        }

        // Update progress UI
        this.updateProgress(currentTime, duration, frameIndex, totalFrames);

        frameIndex++;
        // Maintain pacing for real-time capture
        setTimeout(renderLoop, frameIntervalMs);
      };

      renderLoop();
    } catch (err) {
      console.error('Export initiation failed:', err);
      this.cancelExport();
      Utils.showToast(`Export failed: ${err.message}`, 'error');
    }
  }

  updateProgress(currentTime, duration, frameIndex, totalFrames) {
    const percent = Math.min(100, Math.floor((frameIndex / totalFrames) * 100));
    this.exportModal.querySelector('#export-percent').textContent = `${percent}%`;
    this.exportModal.querySelector('#export-progress-bar').style.width = `${percent}%`;
    this.exportModal.querySelector('#stat-time').textContent = `${currentTime.toFixed(1)}s / ${duration.toFixed(1)}s`;

    // Rough size estimate
    const totalBytes = this.recordedChunks.reduce((acc, c) => acc + c.size, 0);
    const mb = (totalBytes / (1024 * 1024)).toFixed(1);
    this.exportModal.querySelector('#stat-size').textContent = `${mb} MB`;
  }

  finishExport(mimeType) {
    if (!this.isExporting) return;

    AudioSys.stop();

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.onstop = () => {
        const isMp4 = mimeType.includes('mp4');
        const blobType = isMp4 ? mimeType : 'video/mp4';
        this.resultBlob = new Blob(this.recordedChunks, { type: blobType });
        this.resultUrl = URL.createObjectURL(this.resultBlob);
        this.isExporting = false;
        this.showCompleteView(this.resultUrl);
        Utils.showToast('Reel video exported in MP4 format!', 'success');
      };
      this.mediaRecorder.stop();
    }
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
    this.recordedChunks = [];
    this.showConfigView();
    Utils.showToast('Export cancelled.', 'info');
  }

  downloadExportedVideo() {
    if (!this.resultBlob || !this.resultUrl) return;

    const safeName = (State.project.name || 'reel').replace(/[^a-z0-9_\-\u0980-\u09FF]/gi, '_');
    const filename = `${safeName}_${Date.now()}.mp4`;

    const a = document.createElement('a');
    a.href = this.resultUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    Utils.showToast(`Saved as ${filename}`, 'success');
  }
}

export const Exporter = new VideoExporter();
