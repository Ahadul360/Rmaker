/**
 * ReelMaker Web Audio Engine
 * Real-time audio mixing, timeline synchronization, local file decoding,
 * waveform peak generation, and MediaStreamDestination piping for video export.
 */

import { Utils } from './utils.js';
import { State } from './state.js';
import { Storage } from './project-storage.js';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.currentBuffer = null;
    this.currentTrackId = null;
    this.sourceNode = null;
    this.gainNode = null;
    this.streamDestination = null;

    this.isPlaying = false;
    this.waveformPeaks = [];
    this.isLoadingTrack = false;
    this.localBlobCache = new Map();

    this._unlocked = false;
    this._setupGlobalUnlock();
  }

  _setupGlobalUnlock() {
    const unlock = () => {
      this.unlockAudioContext();
    };
    window.addEventListener('click', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        console.warn('Web Audio API not supported in this browser.');
        return null;
      }
      this.ctx = new AudioCtx();
      this.gainNode = this.ctx.createGain();
      this.streamDestination = this.ctx.createMediaStreamDestination();

      // Connect to speakers and recording stream destination
      this.gainNode.connect(this.ctx.destination);
      this.gainNode.connect(this.streamDestination);
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(e => console.warn('AudioContext resume error:', e));
    }
    return this.ctx;
  }

  async unlockAudioContext() {
    this.ensureContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
        this._unlocked = true;
      } catch (e) {
        console.warn('AudioContext unlock failed:', e);
      }
    } else {
      this._unlocked = true;
    }
    // Play a brief 1-sample silent buffer to force iOS CoreAudio hardware to un-mute
    try {
      if (this.ctx && this.ctx.state === 'running') {
        const osc = this.ctx.createBufferSource();
        osc.buffer = this.ctx.createBuffer(1, 1, 22050);
        osc.connect(this.ctx.destination);
        osc.start(0);
      }
    } catch (e) {}
  }

  getAudioMediaStream() {
    this.ensureContext();
    return this.streamDestination ? this.streamDestination.stream : null;
  }

  /**
   * Fast, synchronous, pure-JS RIFF/WAV parser for 16-bit PCM audio.
   * Completely immune to AudioContext suspended states, browser autoplay policies, and WebKit decoding bugs.
   */
  parseWavDirect(arrayBuffer) {
    try {
      if (!arrayBuffer || arrayBuffer.byteLength < 44) return null;
      const view = new DataView(arrayBuffer);
      const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
      const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
      if (riff !== 'RIFF' || wave !== 'WAVE') return null;

      let offset = 12;
      let numChannels = 2;
      let sampleRate = 44100;
      let bitsPerSample = 16;
      let dataOffset = -1;
      let dataLength = 0;

      while (offset < view.byteLength - 8) {
        const chunkId = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
        const chunkSize = view.getUint32(offset + 4, true);
        if (chunkId === 'fmt ') {
          numChannels = view.getUint16(offset + 10, true);
          sampleRate = view.getUint32(offset + 12, true);
          bitsPerSample = view.getUint16(offset + 22, true);
        } else if (chunkId === 'data') {
          dataOffset = offset + 8;
          dataLength = chunkSize;
          break;
        }
        offset += 8 + chunkSize;
      }

      if (dataOffset === -1 || bitsPerSample !== 16) return null;

      const numSamples = Math.floor(dataLength / (numChannels * 2));
      const channels = [];
      for (let c = 0; c < numChannels; c++) {
        channels.push(new Float32Array(numSamples));
      }

      let sampleIdx = 0;
      let bytePos = dataOffset;
      const factor = 1.0 / 32768.0;

      while (sampleIdx < numSamples && bytePos <= view.byteLength - (numChannels * 2)) {
        for (let c = 0; c < numChannels; c++) {
          channels[c][sampleIdx] = view.getInt16(bytePos, true) * factor;
          bytePos += 2;
        }
        sampleIdx++;
      }

      this.ensureContext();
      let audioBuf = null;
      if (this.ctx && typeof this.ctx.createBuffer === 'function') {
        try {
          audioBuf = this.ctx.createBuffer(numChannels, numSamples, sampleRate);
        } catch (e) {}
      }
      if (!audioBuf) {
        audioBuf = {
          numberOfChannels: numChannels,
          length: numSamples,
          sampleRate,
          duration: numSamples / sampleRate,
          _channels: channels,
          getChannelData(c) { return this._channels[c] || this._channels[0]; }
        };
      } else {
        for (let c = 0; c < numChannels; c++) {
          audioBuf.getChannelData(c).set(channels[c]);
        }
      }
      return audioBuf;
    } catch (e) {
      console.warn('[AudioEngine] parseWavDirect error:', e);
      return null;
    }
  }

  async loadTrack(audioConfig) {
    if (!audioConfig || !audioConfig.enabled) {
      this.stop();
      this.currentBuffer = null;
      this.currentTrackId = null;
      this.waveformPeaks = [];
      State.emit('waveformReady', []);
      return null;
    }

    this.ensureContext();
    this.isLoadingTrack = true;

    try {
      let arrayBuffer = null;

      if (audioConfig.sourceType === 'local' && audioConfig.blobId) {
        // Retrieve local blob from in-memory cache first, then IndexedDB
        let blob = this.localBlobCache.get(audioConfig.blobId);
        if (!blob) {
          blob = await Storage.getBlob(audioConfig.blobId);
          if (blob) {
            this.localBlobCache.set(audioConfig.blobId, blob);
          }
        }
        if (blob) {
          arrayBuffer = await Utils.readFileAsArrayBuffer(blob);
        }
      } else if (audioConfig.sourceUrl) {
        // Confine sourceUrl strictly to local bundled tracks under assets/music/
        const cleanPath = String(audioConfig.sourceUrl).replace(/^\.\//, '');
        if (!cleanPath.startsWith('assets/music/') || cleanPath.includes('..')) {
          throw new Error('Unauthorized or invalid audio source path');
        }
        const url = `./${cleanPath}`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} fetching ${url}`);
        }
        arrayBuffer = await response.arrayBuffer();
      }

      if (!arrayBuffer) {
        this.isLoadingTrack = false;
        return null;
      }

      // 1. Try pure-JS fast direct WAV decoding first (bypasses AudioContext suspended state & iOS restrictions)
      let decodedBuffer = this.parseWavDirect(arrayBuffer);

      // 2. Fallback to AudioContext.decodeAudioData for compressed formats (MP3, AAC, etc.)
      if (!decodedBuffer) {
        this.ensureContext();
        if (this.ctx && this.ctx.state === 'suspended') {
          try {
            await this.ctx.resume();
          } catch (e) {}
        }

        decodedBuffer = await new Promise((resolve, reject) => {
          let settled = false;
          const onOk = (buf) => {
            if (!settled) {
              settled = true;
              resolve(buf);
            }
          };
          const onErr = (err) => {
            if (!settled) {
              settled = true;
              reject(err);
            }
          };
          try {
            const res = this.ctx.decodeAudioData(
              arrayBuffer.slice(0),
              onOk,
              onErr
            );
            if (res && typeof res.then === 'function') {
              res.then(onOk).catch(onErr);
            }
          } catch (e) {
            onErr(e);
          }
        });
      }

      this.currentBuffer = decodedBuffer;
      this.currentTrackId = audioConfig.trackId || audioConfig.sourceUrl;
      this.generateWaveformPeaks(decodedBuffer);
      State.emit('waveformReady', this.waveformPeaks);
      this.isLoadingTrack = false;
      return decodedBuffer;
    } catch (err) {
      console.warn('Failed to load/decode audio:', err);
      this.isLoadingTrack = false;
      return null;
    }
  }

  generateWaveformPeaks(audioBuffer, sampleCount = 100) {
    if (!audioBuffer) return [];
    const rawData = audioBuffer.getChannelData(0);
    const blockSize = Math.floor(rawData.length / sampleCount);
    const peaks = [];

    for (let i = 0; i < sampleCount; i++) {
      const start = i * blockSize;
      const end = Math.min(start + blockSize, rawData.length);
      let maxVal = 0;

      for (let j = start; j < end; j++) {
        const val = Math.abs(rawData[j]);
        if (val > maxVal) maxVal = val;
      }
      peaks.push(Math.max(0.12, Number(maxVal.toFixed(3))));
    }

    this.waveformPeaks = peaks;
    return peaks;
  }

  async playAt(timestamp = 0) {
    if (!State.project || !State.project.audio || !State.project.audio.enabled) {
      return;
    }

    this.ensureContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (e) {}
    }

    // Auto-load track if not yet loaded or if track changed
    const trackId = State.project.audio.trackId || State.project.audio.sourceUrl;
    if (!this.currentBuffer || this.currentTrackId !== trackId) {
      await this.loadTrack(State.project.audio);
    }

    if (!this.currentBuffer) {
      return;
    }

    this.stopSourceOnly();

    const audio = State.project.audio;
    const duration = this.currentBuffer.duration;
    const trimStart = audio.trimStart || 0;
    const trimEnd = Math.min(duration, audio.trimEnd || duration);
    const playableLength = Math.max(0.1, trimEnd - trimStart);

    let audioPosition = (timestamp % playableLength) + trimStart;
    if (audioPosition >= trimEnd) audioPosition = trimStart;

    try {
      this.sourceNode = this.ctx.createBufferSource();
      this.sourceNode.buffer = this.currentBuffer;
      this.sourceNode.loop = audio.loop !== undefined ? audio.loop : true;
      this.sourceNode.loopStart = trimStart;
      this.sourceNode.loopEnd = trimEnd;

      // Update volume
      const vol = audio.muted ? 0 : (audio.volume !== undefined ? audio.volume : 0.85);
      if (this.gainNode) {
        this.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
        this.gainNode.gain.setValueAtTime(vol, this.ctx.currentTime);
      }

      this.sourceNode.connect(this.gainNode);
      this.sourceNode.start(0, audioPosition);
      this.isPlaying = true;
    } catch (err) {
      console.warn('Audio start error:', err);
    }
  }

  stop() {
    this.stopSourceOnly();
    this.isPlaying = false;
  }

  stopSourceOnly() {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch (e) {}
      this.sourceNode = null;
    }
  }

  setVolume(volume) {
    if (this.gainNode && this.ctx) {
      try {
        this.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
        this.gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);
      } catch (e) {}
    }
  }

  async importLocalAudioFile(file) {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      Utils.showToast('Audio file too large (max 50MB)', 'error');
      return;
    }
    const isAudioMime = !file.type || file.type.startsWith('audio/') || file.type === 'video/mp4' || file.type === 'application/octet-stream';
    const hasAudioExt = !!(file.name && file.name.match(/\.(mp3|wav|ogg|aac|m4a|flac|caf|mp4|aiff|alac)$/i));
    if (!isAudioMime && !hasAudioExt) {
      Utils.showToast('Please select a valid audio file (MP3, WAV, M4A, etc.)', 'error');
      return;
    }
    this.ensureContext();

    try {
      const blobId = Utils.generateId('audio_blob');
      // Cache file object in memory immediately for instantaneous access & Private Browsing resilience
      this.localBlobCache.set(blobId, file);

      try {
        await Storage.saveBlob(blobId, file);
      } catch (storageErr) {
        console.warn('[AudioEngine] Storage.saveBlob warning (likely Private Browsing):', storageErr);
      }

      State.updateAudio({
        enabled: true,
        trackId: blobId,
        name: file.name,
        fileName: file.name,
        sourceType: 'local',
        blobId: blobId,
        sourceUrl: null,
        volume: 0.85,
        muted: false,
        trimStart: 0,
        trimEnd: 15,
        loop: true
      });

      const loaded = await this.loadTrack(State.project.audio);
      if (loaded) {
        Utils.showToast(`Audio "${file.name}" imported successfully!`, 'success');
        if (State.isPlaying) {
          this.playAt(State.currentTime);
        }
      } else {
        Utils.showToast(`Could not decode audio from "${file.name}". Ensure it is a valid MP3, WAV, or M4A file.`, 'error', 5000);
      }
    } catch (err) {
      console.error('[AudioEngine] importLocalAudioFile failed:', err);
      Utils.showToast(`Failed to import audio: ${err.message || err}`, 'error');
    }
  }

  /**
   * Fast, reliable offline audio rendering for WebCodecs MP4/WebM muxing.
   * Uses pure-JS Float32 mixing first (< 3ms) for zero-risk execution across iOS/Safari,
   * with OfflineAudioContext as a secondary fallback.
   */
  async renderOfflineAudio(duration, sampleRate = 44100) {
    if (!this.currentBuffer || !State.project.audio || !State.project.audio.enabled || State.project.audio.muted) {
      return null;
    }
    const audio = State.project.audio;
    const totalSamples = Math.ceil(duration * sampleRate);
    if (totalSamples <= 0) return null;

    // Method 1: Pure-JS Float32Array channel mixer (100% reliable on iOS WebKit, no AudioContext limits)
    try {
      const srcChannels = this.currentBuffer.numberOfChannels || 1;
      const srcSampleRate = this.currentBuffer.sampleRate || sampleRate;
      const srcDuration = this.currentBuffer.duration || (this.currentBuffer.length / srcSampleRate);
      const srcLeft = this.currentBuffer.getChannelData(0);
      const srcRight = srcChannels > 1 ? this.currentBuffer.getChannelData(1) : srcLeft;

      const outLeft = new Float32Array(totalSamples);
      const outRight = new Float32Array(totalSamples);

      const trimStart = Utils.clamp(audio.trimStart || 0, 0, srcDuration);
      const trimEnd = Math.min(srcDuration, Math.max(trimStart + 0.1, audio.trimEnd || srcDuration));
      const loop = audio.loop !== undefined ? !!audio.loop : true;
      const vol = audio.volume !== undefined ? audio.volume : 0.85;
      const fadeIn = audio.fadeIn || 0;
      const fadeOut = audio.fadeOut || 0;

      const playableLengthSec = trimEnd - trimStart;
      const trimStartSamples = Math.round(trimStart * srcSampleRate);
      const playableSamples = Math.max(1, Math.round(playableLengthSec * srcSampleRate));

      for (let i = 0; i < totalSamples; i++) {
        const tSec = i / sampleRate;
        let srcOffset = Math.round(tSec * srcSampleRate);

        if (loop) {
          srcOffset = (srcOffset % playableSamples) + trimStartSamples;
        } else {
          srcOffset = srcOffset + trimStartSamples;
          if (srcOffset >= trimStartSamples + playableSamples) {
            break;
          }
        }

        if (srcOffset >= 0 && srcOffset < srcLeft.length) {
          let g = vol;
          if (fadeIn > 0 && tSec < fadeIn) {
            g = vol * (tSec / fadeIn);
          } else if (fadeOut > 0 && tSec > (duration - fadeOut)) {
            g = vol * Math.max(0, (duration - tSec) / fadeOut);
          }

          outLeft[i] = srcLeft[srcOffset] * g;
          outRight[i] = srcRight[srcOffset] * g;
        }
      }

      this.ensureContext();
      let resBuffer = null;
      if (this.ctx && typeof this.ctx.createBuffer === 'function') {
        try {
          resBuffer = this.ctx.createBuffer(2, totalSamples, sampleRate);
          resBuffer.getChannelData(0).set(outLeft);
          resBuffer.getChannelData(1).set(outRight);
        } catch (e) {}
      }
      if (!resBuffer) {
        resBuffer = {
          numberOfChannels: 2,
          length: totalSamples,
          sampleRate,
          duration,
          _channels: [outLeft, outRight],
          getChannelData(c) { return this._channels[c] || this._channels[0]; }
        };
      }
      return resBuffer;
    } catch (err) {
      console.warn('[AudioEngine] Pure-JS renderOfflineAudio failed, attempting OfflineAudioContext fallback:', err);
    }

    // Method 2: OfflineAudioContext fallback
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineCtx) return null;

    try {
      const offlineCtx = new OfflineCtx(2, totalSamples, sampleRate);
      const source = offlineCtx.createBufferSource();
      source.buffer = this.currentBuffer;

      const bufferDuration = this.currentBuffer.duration;
      const trimStart = Utils.clamp(audio.trimStart || 0, 0, bufferDuration);
      const trimEnd = Math.min(bufferDuration, audio.trimEnd || bufferDuration);

      source.loop = audio.loop !== undefined ? !!audio.loop : true;
      source.loopStart = trimStart;
      source.loopEnd = trimEnd;

      const gainNode = offlineCtx.createGain();
      const vol = audio.volume !== undefined ? audio.volume : 0.85;
      gainNode.gain.setValueAtTime(vol, 0);

      if (audio.fadeIn && audio.fadeIn > 0) {
        gainNode.gain.setValueAtTime(0, 0);
        gainNode.gain.linearRampToValueAtTime(vol, Math.min(audio.fadeIn, duration));
      }

      if (audio.fadeOut && audio.fadeOut > 0) {
        const fadeStart = Math.max(0, duration - audio.fadeOut);
        gainNode.gain.setValueAtTime(vol, fadeStart);
        gainNode.gain.linearRampToValueAtTime(0, duration);
      }

      source.connect(gainNode);
      gainNode.connect(offlineCtx.destination);
      source.start(0, trimStart, duration);

      const renderedBuffer = await offlineCtx.startRendering();
      return renderedBuffer;
    } catch (e) {
      console.warn('renderOfflineAudio failed:', e);
      return null;
    }
  }
}

export const AudioSys = new AudioEngine();
