/**
 * ReelMaker Multitrack Timeline Component
 * Supports scrubbing, clip trimming, dragging, zooming, audio waveform visualization,
 * and synchronized video/audio playback controls.
 */

import { Utils } from './utils.js';
import { State } from './state.js';
import { AudioSys } from './audio-engine.js';

export class Timeline {
  constructor(containerElement) {
    this.container = containerElement;
    this.pixelsPerSecond = 40; // Default zoom: 40px = 1s
    this.minPps = 15;
    this.maxPps = 140;

    this.isScrubbing = false;
    this.activeDrag = null; // { type: 'body'|'start'|'end', elemId, initialStart, initialEnd, startX }

    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="timeline-header-bar">
        <div class="timeline-controls-left">
          <button id="btn-jump-start" class="btn-icon" title="Jump to start (Home)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
          </button>
          <button id="btn-timeline-play" class="btn-play-pause" title="Play/Pause (Space)">
            <svg id="play-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
          <button id="btn-jump-end" class="btn-icon" title="Jump to end (End)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
          </button>
          <div class="timeline-timecode">
            <span id="tc-current">00:00.00</span>
            <span class="tc-separator">/</span>
            <span id="tc-total">00:15.00</span>
          </div>
        </div>

        <div class="timeline-controls-right">
          <div class="timeline-duration-field">
            <label for="input-duration">Duration:</label>
            <input type="number" id="input-duration" min="1" max="180" step="1" value="15" />
            <span>s</span>
          </div>
          <div class="timeline-zoom-controls">
            <button id="btn-zoom-out" class="btn-icon" title="Zoom Out">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            </button>
            <button id="btn-zoom-in" class="btn-icon" title="Zoom In">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            </button>
          </div>
        </div>
      </div>

      <div class="timeline-body-wrapper">
        <!-- Track Headers (Left column) -->
        <div class="timeline-track-headers" id="timeline-headers">
          <div class="timeline-headers-content" id="timeline-headers-content">
            <div class="track-header ruler-header">Tracks</div>
            <div class="track-header"><span>Text Layers</span></div>
            <div class="track-header"><span>Emojis</span></div>
            <div class="track-header"><span>Shapes / Deco</span></div>
            <div class="track-header"><span>Social Handle</span></div>
            <div class="track-header audio-header"><span>Music Track</span></div>
          </div>
        </div>

        <!-- Scrollable Multitrack Canvas/Tracks Area (Right column) -->
        <div class="timeline-scroll-container" id="timeline-scroll">
          <div class="timeline-tracks-content" id="timeline-content">
            <!-- Time Ruler -->
            <div class="timeline-ruler" id="timeline-ruler">
              <div class="ruler-ticks" id="ruler-ticks"></div>
            </div>

            <!-- Tracks -->
            <div class="timeline-track-row" id="track-text" data-type="text"></div>
            <div class="timeline-track-row" id="track-emoji" data-type="emoji"></div>
            <div class="timeline-track-row" id="track-shape" data-type="shape"></div>
            <div class="timeline-track-row" id="track-handle" data-type="handle"></div>
            <div class="timeline-track-row audio-track" id="track-audio">
              <canvas class="audio-waveform-canvas" id="audio-waveform"></canvas>
              <div class="audio-track-block" id="audio-block"></div>
            </div>

            <!-- Red Playhead Scrubber -->
            <div class="timeline-playhead" id="timeline-playhead">
              <div class="playhead-cap"></div>
              <div class="playhead-line"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.playBtn = this.container.querySelector('#btn-timeline-play');
    this.playIcon = this.container.querySelector('#play-icon');
    this.tcCurrent = this.container.querySelector('#tc-current');
    this.tcTotal = this.container.querySelector('#tc-total');
    this.inputDuration = this.container.querySelector('#input-duration');
    this.scrollContainer = this.container.querySelector('#timeline-scroll');
    this.tracksContent = this.container.querySelector('#timeline-content');
    this.rulerTicks = this.container.querySelector('#ruler-ticks');
    this.playhead = this.container.querySelector('#timeline-playhead');
    this.waveformCanvas = this.container.querySelector('#audio-waveform');

    this.render();
  }

  bindEvents() {
    // Play/Pause
    this.playBtn.addEventListener('click', async () => {
      await AudioSys.unlockAudioContext();
      State.togglePlay();
    });

    // Jump buttons
    this.container.querySelector('#btn-jump-start').addEventListener('click', () => State.setTime(0));
    this.container.querySelector('#btn-jump-end').addEventListener('click', () => State.setTime(State.project.duration));

    // Duration change
    this.inputDuration.addEventListener('change', (e) => {
      State.setDuration(e.target.value);
    });

    // Zoom controls
    this.container.querySelector('#btn-zoom-in').addEventListener('click', () => {
      this.pixelsPerSecond = Math.min(this.maxPps, this.pixelsPerSecond + 15);
      this.render();
    });
    this.container.querySelector('#btn-zoom-out').addEventListener('click', () => {
      this.pixelsPerSecond = Math.max(this.minPps, this.pixelsPerSecond - 15);
      this.render();
    });

    // Scrubber click/drag on Ruler & Tracks
    const handleScrubStart = (e) => {
      // Don't scrub if clicking directly on a clip or clip handle
      if (e.target.closest('.timeline-block')) return;
      this.isScrubbing = true;
      this.scrubToMouse(e);
      window.addEventListener('pointermove', handleScrubMove);
      window.addEventListener('pointerup', handleScrubEnd);
    };

    const handleScrubMove = (e) => {
      if (this.isScrubbing) this.scrubToMouse(e);
    };

    const handleScrubEnd = () => {
      this.isScrubbing = false;
      window.removeEventListener('pointermove', handleScrubMove);
      window.removeEventListener('pointerup', handleScrubEnd);
    };

    this.scrollContainer.addEventListener('pointerdown', handleScrubStart);

    // 2-Way Vertical Scroll Synchronization between Tracks and Headers
    const headers = this.container.querySelector('.timeline-track-headers');
    let isSyncing = false;

    if (headers) {
      this.scrollContainer.addEventListener('scroll', () => {
        if (isSyncing) return;
        isSyncing = true;
        headers.scrollTop = this.scrollContainer.scrollTop;
        isSyncing = false;
      }, { passive: true });

      headers.addEventListener('scroll', () => {
        if (isSyncing) return;
        isSyncing = true;
        this.scrollContainer.scrollTop = headers.scrollTop;
        isSyncing = false;
      }, { passive: true });

      // Wheel on headers scrolls tracks vertically and horizontally
      headers.addEventListener('wheel', (e) => {
        this.scrollContainer.scrollTop += e.deltaY;
        this.scrollContainer.scrollLeft += e.deltaX;
      }, { passive: true });
    }

    // React to State Events
    State.on('timeChange', ({ time }) => this.updatePlayhead(time));
    State.on('durationChange', (duration) => {
      this.inputDuration.value = duration;
      this.tcTotal.textContent = Utils.formatTime(duration);
      this.render();
    });
    State.on('playbackChange', (isPlaying) => this.updatePlayIcon(isPlaying));
    State.on('selectionChange', () => this.highlightSelectedBlock());
    State.on('projectChange', () => this.render());
    State.on('waveformReady', () => this.drawWaveform());
  }

  scrubToMouse(e) {
    const containerRect = this.scrollContainer.getBoundingClientRect();
    const scrollLeft = this.scrollContainer.scrollLeft;
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clickX = clientX - containerRect.left + scrollLeft;

    const time = Utils.clamp(clickX / this.pixelsPerSecond, 0, State.project.duration);
    State.setTime(time);
    if (State.isPlaying) {
      AudioSys.playAt(time);
    }
  }

  updatePlayIcon(isPlaying) {
    if (isPlaying) {
      this.playIcon.innerHTML = `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;
      this.playBtn.title = 'Pause (Space)';
    } else {
      this.playIcon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"/>`;
      this.playBtn.title = 'Play (Space)';
    }
  }

  updatePlayhead(time) {
    const x = time * this.pixelsPerSecond;
    this.playhead.style.transform = `translateX(${x}px)`;
    this.tcCurrent.textContent = Utils.formatTime(time);
  }

  render() {
    const project = State.project;
    if (!project) return;

    const duration = project.duration || 15;
    const minW = Math.max(1400, (this.scrollContainer ? this.scrollContainer.clientWidth : 0) + 400);
    const totalWidth = Math.max(minW, duration * this.pixelsPerSecond + 350);
    this.tracksContent.style.width = `${totalWidth}px`;

    // 1. Render Ruler Ticks
    this.renderRuler(duration);

    // 2. Render Track Blocks
    this.renderTrackBlocks();

    // 3. Update Audio Waveform
    this.drawWaveform();

    // 4. Update Timecode
    this.tcCurrent.textContent = Utils.formatTime(State.currentTime);
    this.tcTotal.textContent = Utils.formatTime(duration);
    this.updatePlayhead(State.currentTime);
    this.highlightSelectedBlock();
  }

  renderRuler(duration) {
    this.rulerTicks.innerHTML = '';
    const step = this.pixelsPerSecond < 30 ? 2 : 1; // 1s or 2s intervals based on zoom

    for (let sec = 0; sec <= duration; sec += step) {
      const tick = document.createElement('div');
      tick.className = 'ruler-tick';
      tick.style.left = `${sec * this.pixelsPerSecond}px`;
      tick.innerHTML = `<span class="tick-label">${sec}s</span>`;
      this.rulerTicks.appendChild(tick);
    }
  }

  renderTrackBlocks() {
    const trackText = this.container.querySelector('#track-text');
    const trackEmoji = this.container.querySelector('#track-emoji');
    const trackShape = this.container.querySelector('#track-shape');
    const trackHandle = this.container.querySelector('#track-handle');

    trackText.innerHTML = '';
    trackEmoji.innerHTML = '';
    trackShape.innerHTML = '';
    trackHandle.innerHTML = '';

    for (const elem of State.project.elements) {
      const block = this.createBlockElement(elem);
      if (elem.type === 'text') trackText.appendChild(block);
      else if (elem.type === 'emoji') trackEmoji.appendChild(block);
      else if (elem.type === 'shape') trackShape.appendChild(block);
    }

    // Social Handle Block
    if (State.project.socialHandle && State.project.socialHandle.enabled) {
      const handleBlock = this.createBlockElement(State.project.socialHandle, 'socialHandle');
      trackHandle.appendChild(handleBlock);
    }
  }

  createBlockElement(elem, customId = null) {
    const id = customId || elem.id;
    const block = document.createElement('div');
    block.className = 'timeline-block';
    block.dataset.id = id;

    const startTime = elem.startTime || 0;
    const endTime = elem.endTime !== undefined ? elem.endTime : State.project.duration;
    const left = startTime * this.pixelsPerSecond;
    const width = Math.max(20, (endTime - startTime) * this.pixelsPerSecond);

    block.style.left = `${left}px`;
    block.style.width = `${width}px`;

    let label = 'Element';
    if (customId === 'socialHandle') {
      label = `Handle: ${elem.text || '@handle'}`;
    } else if (elem.type === 'text') {
      label = `Text: ${elem.text ? elem.text.slice(0, 16).replace(/\n/g, ' ') : '...'}`;
    } else if (elem.type === 'emoji') {
      label = `Emoji: ${elem.emoji || '✨'}`;
    } else if (elem.type === 'shape') {
      label = `Shape: ${elem.shape || 'Deco'}`;
    }

    block.innerHTML = `
      <div class="block-trim-handle trim-left" title="Trim start"></div>
      <div class="block-label">${Utils.escapeHtml(label)}</div>
      <div class="block-trim-handle trim-right" title="Trim end"></div>
    `;

    // Selection on click
    block.addEventListener('click', (e) => {
      e.stopPropagation();
      State.selectElement(id);
    });

    // Drag / Trim interactions
    this.setupBlockDrag(block, id, elem);

    return block;
  }

  setupBlockDrag(block, id, elem) {
    const handleDragStart = (e, dragType) => {
      e.stopPropagation();
      e.preventDefault();

      const startX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      const initialStart = elem.startTime || 0;
      const initialEnd = elem.endTime !== undefined ? elem.endTime : State.project.duration;

      this.activeDrag = {
        type: dragType,
        id,
        initialStart,
        initialEnd,
        startX
      };

      const handlePointerMove = (ev) => {
        if (!this.activeDrag) return;
        const currentX = ev.clientX !== undefined ? ev.clientX : (ev.touches && ev.touches[0] ? ev.touches[0].clientX : 0);
        const deltaSec = (currentX - this.activeDrag.startX) / this.pixelsPerSecond;
        const duration = State.project.duration;

        let newStart = this.activeDrag.initialStart;
        let newEnd = this.activeDrag.initialEnd;
        const clipLen = newEnd - newStart;

        if (this.activeDrag.type === 'body') {
          newStart = Utils.clamp(this.activeDrag.initialStart + deltaSec, 0, duration - clipLen);
          newEnd = newStart + clipLen;
        } else if (this.activeDrag.type === 'left') {
          newStart = Utils.clamp(this.activeDrag.initialStart + deltaSec, 0, newEnd - 0.2);
        } else if (this.activeDrag.type === 'right') {
          newEnd = Utils.clamp(this.activeDrag.initialEnd + deltaSec, newStart + 0.2, duration);
        }

        // Apply immediately for silky responsiveness
        if (id === 'socialHandle') {
          State.project.socialHandle.startTime = newStart;
          State.project.socialHandle.endTime = newEnd;
        } else {
          const el = State.project.elements.find(item => item.id === id);
          if (el) {
            el.startTime = newStart;
            el.endTime = newEnd;
          }
        }

        // Update block styling live
        block.style.left = `${newStart * this.pixelsPerSecond}px`;
        block.style.width = `${Math.max(20, (newEnd - newStart) * this.pixelsPerSecond)}px`;
        State.emit('stateRenderNeeded');
      };

      const handlePointerUp = () => {
        if (this.activeDrag) {
          // Push single undo state on drag finish
          State.pushUndo(`Adjust ${id} timing`);
          this.activeDrag = null;
        }
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    };

    block.addEventListener('pointerdown', (e) => {
      if (e.target.classList.contains('trim-left')) {
        handleDragStart(e, 'left');
      } else if (e.target.classList.contains('trim-right')) {
        handleDragStart(e, 'right');
      } else {
        handleDragStart(e, 'body');
      }
    });
  }

  highlightSelectedBlock() {
    const selectedId = State.selectedElementId;
    const blocks = this.container.querySelectorAll('.timeline-block');
    for (const b of blocks) {
      if (b.dataset.id === selectedId) {
        b.classList.add('selected');
      } else {
        b.classList.remove('selected');
      }
    }
  }

  drawWaveform() {
    const canvas = this.waveformCanvas;
    if (!canvas) return;

    const audioBlock = this.container.querySelector('#audio-block');
    const audio = State.project.audio;

    if (!audio || !audio.enabled) {
      audioBlock.style.display = 'none';
      return;
    }

    audioBlock.style.display = 'block';
    const duration = State.project.duration;
    const trackWidth = duration * this.pixelsPerSecond;
    audioBlock.style.width = `${trackWidth}px`;
    const safeAudioName = Utils.escapeHtml(audio.name || 'Audio Track');
    audioBlock.innerHTML = `<span class="audio-name">🎵 ${safeAudioName}</span>`;

    // Render peaks to canvas
    const peaks = AudioSys.waveformPeaks;
    if (!peaks || peaks.length === 0) return;

    const trackRow = this.container.querySelector('#track-audio');
    canvas.width = trackWidth;
    canvas.height = trackRow && trackRow.clientHeight > 0 ? trackRow.clientHeight : 40;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(139, 124, 255, 0.45)';
    const barWidth = 3;
    const gap = 2;
    const totalBars = Math.floor(trackWidth / (barWidth + gap));
    const centerY = canvas.height / 2;

    for (let i = 0; i < totalBars; i++) {
      const peakIdx = Math.floor((i / totalBars) * peaks.length);
      const val = peaks[peakIdx] || 0.1;
      const barH = Math.max(4, val * (canvas.height - 6));
      const x = i * (barWidth + gap);

      ctx.fillRect(x, centerY - barH / 2, barWidth, barH);
    }
  }
}
