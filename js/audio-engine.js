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
  }

  getAudioMediaStream() {
    this.ensureContext();
    return this.streamDestination ? this.streamDestination.stream : null;
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
        // Retrieve local blob from IndexedDB
        const blob = await Storage.getBlob(audioConfig.blobId);
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

      // Safe decodeAudioData compatible with both Promise and Callback styles
      const decodedBuffer = await new Promise((resolve, reject) => {
        try {
          const res = this.ctx.decodeAudioData(
            arrayBuffer.slice(0),
            (buffer) => resolve(buffer),
            (err) => reject(err)
          );
          if (res && typeof res.then === 'function') {
            res.then(resolve).catch(reject);
          }
        } catch (e) {
          reject(e);
        }
      });

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
    if (file.type && !file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|ogg|aac|m4a|flac)$/i)) {
      Utils.showToast('Please select a valid audio file (MP3, WAV, etc.)', 'error');
      return;
    }
    this.ensureContext();

    try {
      const blobId = Utils.generateId('audio_blob');
      await Storage.saveBlob(blobId, file);

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

      await this.loadTrack(State.project.audio);
      Utils.showToast(`Audio "${file.name}" imported successfully!`, 'success');
      
      // Auto-play preview on import
      if (State.isPlaying) {
        this.playAt(State.currentTime);
      }
    } catch (err) {
      Utils.showToast(`Failed to import audio: ${err.message}`, 'error');
    }
  }

  /**
   * Fast offline audio rendering for WebCodecs MP4/WebM muxing
   */
  async renderOfflineAudio(duration, sampleRate = 44100) {
    if (!this.currentBuffer || !State.project.audio || !State.project.audio.enabled || State.project.audio.muted) {
      return null;
    }
    const audio = State.project.audio;
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineCtx) return null;

    const totalSamples = Math.ceil(duration * sampleRate);
    if (totalSamples <= 0) return null;

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
