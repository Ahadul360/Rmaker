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
    this.cachedSps = null;
    this.cachedPps = null;
    this.cachedDescription = null;

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

            <div class="export-live-preview-wrap" style="display: flex; justify-content: center; margin: 12px 0 14px;">
              <div id="export-canvas-mount" style="width: 120px; height: 213px; border-radius: 8px; overflow: hidden; background: #000; box-shadow: 0 4px 16px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: center;"></div>
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

            <div class="modal-footer flex-column" style="gap: 10px;">
              <button class="btn btn-primary btn-block" id="btn-download-video">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span id="btn-download-label">Download MP4 Video</span>
              </button>
              <button class="btn btn-secondary btn-block" id="btn-share-video" style="display: none;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                <span id="btn-share-label">Share Video / Social Apps</span>
              </button>
              <button class="btn btn-secondary btn-block" id="btn-export-again" style="opacity: 0.85; font-size: 13px;">Export Another Format / Resolution</button>
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
      const isIOS = typeof navigator !== 'undefined' && (
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      );
      if (isIOS) {
        this.shareVideo();
      } else {
        this.directDownloadVideo();
      }
    });

    const shareBtn = modal.querySelector('#btn-share-video');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        const isIOS = typeof navigator !== 'undefined' && (
          /iPad|iPhone|iPod/.test(navigator.userAgent) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
        );
        if (isIOS) {
          this.directDownloadVideo();
        } else {
          this.shareVideo();
        }
      });
    }

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
      this.exportCanvas.style.cssText = 'width: 100%; height: 100%; object-fit: contain; display: block;';
      const mount = this.exportModal ? this.exportModal.querySelector('#export-canvas-mount') : null;
      if (mount) {
        mount.innerHTML = '';
        mount.appendChild(this.exportCanvas);
      } else {
        this.exportCanvas.style.cssText = 'position: fixed; left: 0; top: 0; width: 120px; height: 120px; opacity: 0.01; pointer-events: none; z-index: 1;';
        document.body.appendChild(this.exportCanvas);
      }
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
    const mount = this.exportModal ? this.exportModal.querySelector('#export-canvas-mount') : null;
    if (mount) {
      mount.innerHTML = '';
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

    const isIOS = typeof navigator !== 'undefined' && (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );

    const canShareFiles = typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      typeof File !== 'undefined';

    const btnDownload = completeView.querySelector('#btn-download-video');
    const downloadLabel = completeView.querySelector('#btn-download-label');
    const btnShare = completeView.querySelector('#btn-share-video');
    const shareLabel = completeView.querySelector('#btn-share-label');

    if (isIOS) {
      // On iOS Safari, Web Share API is the primary route to save videos directly into Camera Roll / Photos app.
      // The secondary button lets the user download the raw file into Files / iCloud Drive.
      if (downloadLabel) downloadLabel.textContent = 'Save to Photos (Camera Roll)';
      if (btnShare) {
        btnShare.style.display = 'flex';
        if (shareLabel) shareLabel.textContent = `Download ${isMp4 ? 'MP4' : 'WebM'} File`;
      }
    } else {
      // On Android and Desktop, direct download saves directly to the Downloads folder and Gallery.
      // Web Share is offered as a secondary option for direct sharing to apps.
      if (downloadLabel) downloadLabel.textContent = `Download ${isMp4 ? 'MP4' : 'WebM'} Video`;
      if (btnShare) {
        btnShare.style.display = canShareFiles ? 'flex' : 'none';
        if (shareLabel) shareLabel.textContent = 'Share Video / Social Apps';
      }
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

    // If user wants MP4 (the universal social media format):
    // Use WebCodecs (MP4 H.264) hardware engine
    if (format === 'mp4') {
      if (hasWebCodecs) {
        const supportedConfig = await this.checkAvcSupport(options);
        return this.exportWithWebCodecs(options, supportedConfig);
      } else {
        Utils.showToast('WebCodecs (MP4 H.264) is not available in this browser. Please use Chrome or iOS Safari on iOS 16.4+.', 'error', 6000);
        return;
      }
    }

    // Otherwise use MediaRecorder with duration patching (for WebM format)
    return this.exportWithMediaRecorder(options);
  }

  async checkAvcSupport(options) {
    const { resolution = '1080p', fps = 30 } = options;
    const project = State.project;
    const baseWidth = Presets.aspectRatios[project.aspectRatio]?.width || 1080;
    const baseHeight = Presets.aspectRatios[project.aspectRatio]?.height || 1920;
    const scale = Presets.resolutions[resolution]?.scale || 1.0;
    let exportW = Math.round(baseWidth * scale);
    let exportH = Math.round(baseHeight * scale);
    // Ensure even dimensions (required for H.264 / AVC hardware encoders)
    exportW = Math.floor(exportW / 2) * 2;
    exportH = Math.floor(exportH / 2) * 2;

    const bitrate = resolution === '1080p' ? 8000000 : (resolution === '720p' ? 4500000 : 2500000);

    const avcProfiles = [
      'avc1.4d002a', // Main Profile Level 4.2
      'avc1.42002a', // Baseline Profile Level 4.2
      'avc1.640028', // High Profile Level 4.0
      'avc1.64002a', // High Profile Level 4.2
      'avc1.4d0033', // Main Profile Level 5.1
      'avc1.640033', // High Profile Level 5.1
      'avc1.420028', // Baseline Profile Level 4.0
      'avc1.42001f', // Baseline Profile Level 3.1
      'avc1.42001e', // Baseline Profile Level 3.0
      'avc1.42E01E', // Constrained Baseline Level 3.0
      'avc1.4D401E', // Main Profile Level 3.0
      'avc1.4d001f'  // Main Profile Level 3.1
    ];

    if (typeof VideoEncoder !== 'undefined' && typeof VideoEncoder.isConfigSupported === 'function') {
      for (const codec of avcProfiles) {
        try {
          const cfg = {
            codec,
            width: exportW,
            height: exportH,
            bitrate,
            framerate: fps
          };
          const res = await VideoEncoder.isConfigSupported(cfg);
          if (res && res.supported) {
            return res.config || cfg;
          }
        } catch (e) {}
      }

      // Secondary check without bitrate (some WebKit/Safari versions require omitting bitrate in query)
      for (const codec of avcProfiles) {
        try {
          const cfg = {
            codec,
            width: exportW,
            height: exportH
          };
          const res = await VideoEncoder.isConfigSupported(cfg);
          if (res && res.supported) {
            return {
              ...(res.config || cfg),
              bitrate,
              framerate: fps
            };
          }
        } catch (e) {}
      }
    }

    // Fallback default config object
    return {
      codec: 'avc1.4d002a',
      width: exportW,
      height: exportH,
      bitrate,
      framerate: fps
    };
  }

  /**
   * Helper to inspect H.264 video chunks and ensure ISO BMFF / AVCC compliance.
   * On WebKit (Safari on macOS and iOS), VideoEncoder does not provide
   * meta.decoderConfig.description (the AVCDecoderConfigurationRecord) and outputs
   * raw Annex B streams (00 00 00 01) instead of length-prefixed AVCC samples.
   * This method extracts SPS/PPS, constructs the ISO/IEC 14496-15 avcC box description,
   * and converts the chunk samples into 4-byte length-prefixed AVCC format.
   */
  processH264Chunk(rawData, meta, avcCodec) {
    const isAnnexB = rawData.length >= 4 && (
      (rawData[0] === 0 && rawData[1] === 0 && rawData[2] === 1) ||
      (rawData[0] === 0 && rawData[1] === 0 && rawData[2] === 0 && rawData[3] === 1)
    );

    // If stream is already length-prefixed AVCC (not Annex B start codes)
    if (!isAnnexB) {
      if (meta?.decoderConfig?.description) {
        let desc = meta.decoderConfig.description;
        if (ArrayBuffer.isView(desc)) {
          desc = new Uint8Array(desc.buffer, desc.byteOffset, desc.byteLength);
        } else if (desc instanceof ArrayBuffer) {
          desc = new Uint8Array(desc);
        }
        this.cachedDescription = desc;
        meta.decoderConfig.description = desc;
      } else if (this.cachedDescription && (!meta || !meta.decoderConfig || !meta.decoderConfig.description)) {
        meta = meta || {};
        meta.decoderConfig = meta.decoderConfig || { codec: avcCodec };
        meta.decoderConfig.description = this.cachedDescription;
      }
      return { data: rawData, meta };
    }

    // Parse NAL units from Annex B byte stream
    const nalUnits = [];
    const len = rawData.length;
    let i = 0;
    while (i < len) {
      let startCodeLen = 0;
      if (i + 4 <= len && rawData[i] === 0 && rawData[i + 1] === 0 && rawData[i + 2] === 0 && rawData[i + 3] === 1) {
        startCodeLen = 4;
      } else if (i + 3 <= len && rawData[i] === 0 && rawData[i + 1] === 0 && rawData[i + 2] === 1) {
        startCodeLen = 3;
      }

      if (startCodeLen > 0) {
        const nalStart = i + startCodeLen;
        let nextStart = len;
        for (let j = nalStart; j < len; j++) {
          if (j + 3 <= len && rawData[j] === 0 && rawData[j + 1] === 0 && (rawData[j + 2] === 1 || (rawData[j + 2] === 0 && j + 4 <= len && rawData[j + 3] === 1))) {
            nextStart = j;
            break;
          }
        }
        if (nextStart > nalStart) {
          let nalEnd = nextStart;
          while (nalEnd > nalStart && rawData[nalEnd - 1] === 0) {
            nalEnd--;
          }
          if (nalEnd > nalStart) {
            nalUnits.push(rawData.subarray(nalStart, nalEnd));
          }
        }
        i = nextStart;
      } else {
        i++;
      }
    }

    if (nalUnits.length === 0) {
      return { data: rawData, meta };
    }

    const sampleNals = [];
    let avccLength = 0;

    for (const nal of nalUnits) {
      const nalType = nal[0] & 0x1F;
      if (nalType === 7) {
        // Sequence Parameter Set (SPS)
        this.cachedSps = new Uint8Array(nal);
        continue;
      }
      if (nalType === 8) {
        // Picture Parameter Set (PPS)
        this.cachedPps = new Uint8Array(nal);
        continue;
      }
      if (nalType === 9) {
        // Access Unit Delimiter (AUD) - not needed in AVCC sample
        continue;
      }
      sampleNals.push(nal);
      avccLength += 4 + nal.length;
    }

    // If description is missing, construct AVCDecoderConfigurationRecord from SPS and PPS
    if ((!meta?.decoderConfig?.description) && this.cachedSps && this.cachedPps) {
      const sps = this.cachedSps;
      const pps = this.cachedPps;
      const recordLen = 11 + sps.length + pps.length;
      const avcRecord = new Uint8Array(recordLen);
      let o = 0;
      avcRecord[o++] = 0x01; // configurationVersion
      avcRecord[o++] = sps[1]; // AVCProfileIndication
      avcRecord[o++] = sps[2]; // profile_compatibility
      avcRecord[o++] = sps[3]; // AVCLevelIndication
      avcRecord[o++] = 0xFF; // lengthSizeMinusOne = 3 (4-byte prefix) | 0xFC
      avcRecord[o++] = 0xE1; // numOfSequenceParameterSets = 1 | 0xE0
      avcRecord[o++] = (sps.length >> 8) & 0xFF;
      avcRecord[o++] = sps.length & 0xFF;
      avcRecord.set(sps, o);
      o += sps.length;
      avcRecord[o++] = 0x01; // numOfPictureParameterSets = 1
      avcRecord[o++] = (pps.length >> 8) & 0xFF;
      avcRecord[o++] = pps.length & 0xFF;
      avcRecord.set(pps, o);

      meta = meta || {};
      meta.decoderConfig = meta.decoderConfig || { codec: avcCodec };
      meta.decoderConfig.description = avcRecord;
      this.cachedDescription = avcRecord;
    } else if (this.cachedDescription && (!meta || !meta.decoderConfig || !meta.decoderConfig.description)) {
      meta = meta || {};
      meta.decoderConfig = meta.decoderConfig || { codec: avcCodec };
      meta.decoderConfig.description = this.cachedDescription;
    }

    if (sampleNals.length === 0) {
      return { data: null, meta };
    }

    // Pack into 4-byte big-endian length-prefixed AVCC format
    const avccData = new Uint8Array(avccLength);
    let outOffset = 0;
    for (const nal of sampleNals) {
      const nLen = nal.length;
      avccData[outOffset++] = (nLen >> 24) & 0xFF;
      avccData[outOffset++] = (nLen >> 16) & 0xFF;
      avccData[outOffset++] = (nLen >> 8) & 0xFF;
      avccData[outOffset++] = nLen & 0xFF;
      avccData.set(nal, outOffset);
      outOffset += nLen;
    }

    return { data: avccData, meta };
  }

  /**
   * Pipeline 1: WebCodecs + mp4-muxer
   * Generates true H.264/AAC MP4 with FastStart (moov atom at front) and exact duration.
   * Perfect for TikTok, Facebook Reels, YouTube Shorts & Instagram.
   */
  async exportWithWebCodecs(options, supportedConfig = null) {
    const { resolution = '1080p', fps = 30, includeAudio = true } = options;
    const project = State.project;
    const duration = project.duration;
    const baseWidth = Presets.aspectRatios[project.aspectRatio].width;
    const baseHeight = Presets.aspectRatios[project.aspectRatio].height;
    const scale = Presets.resolutions[resolution].scale;

    let exportW = Math.round(baseWidth * scale);
    let exportH = Math.round(baseHeight * scale);
    exportW = Math.floor(exportW / 2) * 2;
    exportH = Math.floor(exportH / 2) * 2;
    const videoBitrate = resolution === '1080p' ? 8000000 : (resolution === '720p' ? 5000000 : 3000000);
    let avcCodec = (typeof supportedConfig === 'object' && supportedConfig?.codec)
      ? supportedConfig.codec
      : (typeof supportedConfig === 'string' ? supportedConfig : 'avc1.4d002a');

    // Reset cached SPS/PPS/Description for this export session
    this.cachedSps = null;
    this.cachedPps = null;
    this.cachedDescription = null;

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
      // 1. Prepare and pre-encode Audio (if enabled and fully supported by both AudioEncoder and AudioData)
      const encodedAudioChunks = [];
      let audioTrackConfig = undefined;

      if (includeAudio && project.audio && project.audio.enabled && !project.audio.muted) {
        const hasAudioCodecs = typeof window.AudioEncoder !== 'undefined' && typeof window.AudioData !== 'undefined';
        if (hasAudioCodecs) {
          try {
            const currentTrackKey = project.audio.trackId || project.audio.sourceUrl;
            if (!AudioSys.currentBuffer || AudioSys.currentTrackId !== currentTrackKey) {
              await AudioSys.loadTrack(project.audio);
            }

            // Determine supported AAC sample rate (test 44100Hz, then 48000Hz)
            let targetSampleRate = 44100;
            let aCheck = null;
            try {
              aCheck = await AudioEncoder.isConfigSupported({
                codec: 'mp4a.40.2',
                numberOfChannels: 2,
                sampleRate: 44100,
                bitrate: 128000
              });
            } catch (e) {}

            if (!aCheck || !aCheck.supported) {
              try {
                const aCheck48 = await AudioEncoder.isConfigSupported({
                  codec: 'mp4a.40.2',
                  numberOfChannels: 2,
                  sampleRate: 48000,
                  bitrate: 128000
                });
                if (aCheck48 && aCheck48.supported) {
                  targetSampleRate = 48000;
                  aCheck = aCheck48;
                }
              } catch (e) {}
            }

            const renderedBuffer = await AudioSys.renderOfflineAudio(duration, targetSampleRate);
            if (renderedBuffer && renderedBuffer.length > 0 && aCheck && aCheck.supported) {
              const audioEncoder = new AudioEncoder({
                output: (chunk, meta) => {
                  try {
                    const dur = (Number.isFinite(chunk.duration) && chunk.duration > 0)
                      ? chunk.duration
                      : Math.round((1024 / targetSampleRate) * 1000000);
                    const data = new Uint8Array(chunk.byteLength);
                    chunk.copyTo(data);

                    let cleanMeta = meta;
                    if (meta && meta.decoderConfig) {
                      cleanMeta = { ...meta, decoderConfig: { ...meta.decoderConfig } };
                      const desc = meta.decoderConfig.description;
                      if (desc) {
                        if (desc instanceof Uint8Array) {
                          cleanMeta.decoderConfig.description = desc;
                        } else if (desc instanceof DataView || (desc.buffer && typeof desc.byteOffset === 'number')) {
                          cleanMeta.decoderConfig.description = new Uint8Array(desc.buffer, desc.byteOffset, desc.byteLength);
                        } else if (desc instanceof ArrayBuffer) {
                          cleanMeta.decoderConfig.description = new Uint8Array(desc);
                        }
                      }
                    }

                    encodedAudioChunks.push({
                      data,
                      type: chunk.type,
                      timestamp: chunk.timestamp,
                      duration: dur,
                      meta: cleanMeta
                    });
                  } catch (aErr) {
                    console.warn('[VideoExporter] Audio chunk copy error:', aErr);
                  }
                },
                error: (err) => console.warn('[VideoExporter] AudioEncoder error:', err)
              });

              audioEncoder.configure({
                codec: 'mp4a.40.2',
                numberOfChannels: 2,
                sampleRate: targetSampleRate,
                bitrate: 128000
              });

              const totalAudioSamples = renderedBuffer.length;
              const left = renderedBuffer.getChannelData(0);
              const right = renderedBuffer.numberOfChannels > 1 ? renderedBuffer.getChannelData(1) : left;
              const chunkSize = 1024;

              for (let offset = 0; offset < totalAudioSamples; offset += chunkSize) {
                const framesAvailable = Math.min(chunkSize, totalAudioSamples - offset);
                
                // Allocate exact 1024 frames per channel for strict Apple AudioToolbox AAC-LC compliance
                const planarData = new Float32Array(chunkSize * 2);
                planarData.set(left.subarray(offset, offset + framesAvailable), 0);
                planarData.set(right.subarray(offset, offset + framesAvailable), chunkSize);

                const audioData = new AudioData({
                  format: 'f32-planar',
                  sampleRate: targetSampleRate,
                  numberOfFrames: chunkSize,
                  numberOfChannels: 2,
                  timestamp: Math.round((offset / targetSampleRate) * 1000000),
                  data: planarData
                });

                audioEncoder.encode(audioData);
                audioData.close();
              }

              await Promise.race([
                audioEncoder.flush(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Audio flush timeout')), 10000))
              ]);

              if (encodedAudioChunks.length > 0) {
                audioTrackConfig = {
                  codec: 'aac',
                  numberOfChannels: 2,
                  sampleRate: targetSampleRate
                };
                console.log(`[VideoExporter] Encoded ${encodedAudioChunks.length} AAC audio chunks (${targetSampleRate}Hz)`);
              }
            }
          } catch (audioErr) {
            console.warn('[VideoExporter] Audio pre-encoding failed/skipped:', audioErr);
            encodedAudioChunks.length = 0;
            audioTrackConfig = undefined;
          }
        } else {
          console.warn('[VideoExporter] AudioEncoder is not supported in this browser version');
        }
      }

      // 2. Initialize MP4 Muxer with FastStart & offset first timestamp behavior
      // Note: audio is ONLY declared if audio chunks were ACTUALLY generated and verified!
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

      // Write verified audio chunks into muxer
      if (audioTrackConfig && encodedAudioChunks.length > 0) {
        for (const ac of encodedAudioChunks) {
          muxer.addAudioChunkRaw(ac.data, ac.type, ac.timestamp, ac.duration, ac.meta);
        }
      }

      // 3. Initialize VideoEncoder with robust chunk handling & duration safety
      const frameDurationUs = Math.round(1000000 / fps);
      let lastChunkTimestampUs = -1;
      let encoderError = null;

      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => {
          try {
            let ts = Number.isFinite(chunk.timestamp) ? chunk.timestamp : (lastChunkTimestampUs + frameDurationUs);
            if (ts < 0) ts = 0;
            if (ts <= lastChunkTimestampUs) {
              ts = lastChunkTimestampUs + 1;
            }
            lastChunkTimestampUs = ts;

            // In Safari and some mobile browsers, chunk.duration is null.
            // mp4-muxer requires a finite duration or it throws a TypeError.
            const dur = (Number.isFinite(chunk.duration) && chunk.duration > 0)
              ? chunk.duration
              : frameDurationUs;

            const rawData = new Uint8Array(chunk.byteLength);
            chunk.copyTo(rawData);

            const processed = this.processH264Chunk(rawData, meta, avcCodec);
            if (processed.data && processed.data.byteLength > 0) {
              muxer.addVideoChunkRaw(processed.data, chunk.type, ts, dur, processed.meta);
            }
          } catch (err) {
            console.error('[Muxer addVideoChunkRaw error]', err);
            encoderError = err;
          }
        },
        error: (err) => {
          console.error('[VideoEncoder error]', err);
          encoderError = err;
        }
      });

      // Configure VideoEncoder with verified or fallback candidate profiles
      let isConfigured = false;
      let lastConfigErr = null;

      if (supportedConfig && typeof supportedConfig === 'object') {
        try {
          videoEncoder.configure(supportedConfig);
          isConfigured = true;
          avcCodec = supportedConfig.codec || avcCodec;
        } catch (e) {
          console.warn('[VideoEncoder initial configure with supportedConfig failed]:', e);
        }
      }

      if (!isConfigured) {
        const candidateCodecs = [
          avcCodec,
          'avc1.4d002a',
          'avc1.42002a',
          'avc1.640028',
          'avc1.64002a',
          'avc1.4d0033',
          'avc1.420028',
          'avc1.42001f',
          'avc1.42001e',
          'avc1.42E01E'
        ];

        for (const candidate of candidateCodecs) {
          if (!candidate) continue;
          try {
            videoEncoder.configure({
              codec: candidate,
              width: exportW,
              height: exportH,
              bitrate: videoBitrate,
              framerate: fps
            });
            isConfigured = true;
            avcCodec = candidate;
            break;
          } catch (err) {
            try {
              videoEncoder.configure({
                codec: candidate,
                width: exportW,
                height: exportH
              });
              isConfigured = true;
              avcCodec = candidate;
              break;
            } catch (err2) {
              lastConfigErr = err2;
              console.warn(`[VideoEncoder configure failed for ${candidate}]`, err2);
            }
          }
        }
      }

      if (!isConfigured) {
        throw new Error(lastConfigErr ? lastConfigErr.message : 'Hardware H.264 encoder configuration failed');
      }

      // 4. Encode Video Frames
      const totalFrames = Math.ceil(duration * fps);
      let lastFrameTimestampUs = -1;

      // Verify canvas origin cleanliness before encoding
      try {
        const testCtx = this.exportCanvas.getContext('2d');
        testCtx.getImageData(0, 0, 1, 1);
      } catch (cleanErr) {
        console.warn('[VideoExporter] Canvas origin-clean check warning:', cleanErr);
      }

      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
        if (!this.isExporting || this.abortController.signal.aborted) {
          this.cleanupExportCanvas();
          return;
        }

        if (encoderError) {
          throw new Error(`Video encoder error: ${encoderError.message || encoderError}`);
        }

        const currentTime = frameIndex / fps;
        this.exportRenderer.renderFrame(currentTime, this.exportCanvas, { isExport: true });

        let timestampUs = Math.round(currentTime * 1000000);
        if (frameIndex > 0 && timestampUs <= lastFrameTimestampUs) {
          timestampUs = lastFrameTimestampUs + 1;
        }
        lastFrameTimestampUs = timestampUs;

        let videoFrame = null;
        let bitmap = null;
        try {
          videoFrame = new VideoFrame(this.exportCanvas, {
            timestamp: timestampUs,
            duration: frameDurationUs
          });
        } catch (e) {
          try {
            videoFrame = new VideoFrame(this.exportCanvas, { timestamp: timestampUs });
          } catch (e2) {
            try {
              bitmap = await createImageBitmap(this.exportCanvas);
              videoFrame = new VideoFrame(bitmap, { timestamp: timestampUs });
            } catch (e3) {
              throw new Error(`Frame creation failed at ${currentTime.toFixed(2)}s: ${e3.message || e3}`);
            }
          }
        }

        const isKey = frameIndex % (fps * 2) === 0;
        videoEncoder.encode(videoFrame, { keyFrame: isKey });
        videoFrame.close();
        if (bitmap) {
          bitmap.close();
        }

        // Control memory queue backpressure with while loop to avoid hardware queue saturation on iOS
        while (videoEncoder.encodeQueueSize > 2) {
          if (encoderError || this.abortController.signal.aborted) {
            break;
          }
          await new Promise(r => setTimeout(r, 16));
        }

        if (frameIndex % 3 === 0 || frameIndex === totalFrames - 1) {
          this.updateProgress(currentTime, duration, frameIndex, totalFrames);
          await new Promise(r => setTimeout(r, 0));
        }
      }

      if (encoderError) {
        throw new Error(`Video encoder error: ${encoderError.message || encoderError}`);
      }

      // Flush video encoder with 10-second safety timeout against iOS VideoToolbox freeze
      await Promise.race([
        videoEncoder.flush(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Video encoder flush timeout')), 10000))
      ]);

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
      this.cancelExport(false);
      Utils.showToast(`Export failed: ${err.message || err}`, 'error', 7000);
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

    let exportW = Math.round(baseWidth * scale);
    let exportH = Math.round(baseHeight * scale);
    exportW = Math.floor(exportW / 2) * 2;
    exportH = Math.floor(exportH / 2) * 2;

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

    // Guard against browsers (like iOS Safari) where canvas.captureStream is not implemented
    this.setupExportCanvas(exportW, exportH);
    if (!this.exportCanvas || typeof this.exportCanvas.captureStream !== 'function') {
      this.cleanupExportCanvas();
      this.cancelExport();
      Utils.showToast('MediaRecorder canvas capture is not supported on this device. Please select MP4 format.', 'error', 5000);
      return;
    }

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

  cancelExport(showToast = true) {
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
    if (showToast) {
      Utils.showToast('Export cancelled.', 'info');
    }
  }

  /**
   * Direct file download to user storage (Downloads folder / Files app).
   * Note: We avoid target="_blank" because mobile browsers (Android Chrome and Safari)
   * block or show blank pages for blob: URLs in new tabs.
   */
  directDownloadVideo() {
    if (!this.resultBlob || !this.resultUrl) return;

    const isMp4 = this.resultFormat === 'mp4';
    const ext = isMp4 ? 'mp4' : 'webm';
    const safeName = (State.project.name || 'reel').replace(/[^a-z0-9_\-\u0980-\u09FF]/gi, '_');
    const filename = `${safeName}_${Date.now()}.${ext}`;

    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = this.resultUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) {
        a.parentNode.removeChild(a);
      }
    }, 500);

    Utils.showToast(`Downloading ${filename}...`, 'success');
  }

  /**
   * Web Share API for saving video directly to Camera Roll / Photos on iOS,
   * or sharing directly to social media apps on Android and supported desktop browsers.
   */
  async shareVideo() {
    if (!this.resultBlob || !this.resultUrl) return;

    const isMp4 = this.resultFormat === 'mp4';
    const ext = isMp4 ? 'mp4' : 'webm';
    const mimeType = isMp4 ? 'video/mp4' : 'video/webm';
    const safeName = (State.project.name || 'reel').replace(/[^a-z0-9_\-\u0980-\u09FF]/gi, '_');
    const filename = `${safeName}_${Date.now()}.${ext}`;

    const videoFile = new File([this.resultBlob], filename, { type: mimeType });

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
        this.directDownloadVideo();
      }
    } else {
      this.directDownloadVideo();
    }
  }

  /**
   * Default export download handler:
   * On iOS, delegates to shareVideo() so user can select native "Save Video" to Camera Roll.
   * On Android / Desktop, triggers immediate direct file download.
   */
  downloadExportedVideo() {
    const isIOS = typeof navigator !== 'undefined' && (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );

    if (isIOS) {
      return this.shareVideo();
    }
    return this.directDownloadVideo();
  }
}

export const Exporter = new VideoExporter();
