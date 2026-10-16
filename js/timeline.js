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
            <!-- Dynamically populated in renderTrackBlocks -->
          </div>
        </div>

        <!-- Scrollable Multitrack Canvas/Tracks Area (Right column) -->
        <div class="timeline-scroll-container" id="timeline-scroll">
          <div class="timeline-tracks-content" id="timeline-content">
            <!-- Time Ruler -->
            <div class="timeline-ruler" id="timeline-ruler">
              <div class="ruler-ticks" id="ruler-ticks"></div>
            </div>

            <!-- Dynamic Track Rows Container -->
            <div class="timeline-tracks-rows-container" id="timeline-tracks-rows">
              <!-- Dynamically populated in renderTrackBlocks -->
            </div>

            <!-- Fixed Bottom Audio Track -->
            <div class="timeline-track-row audio-track" id="track-audio">
              <div class="audio-track-block" id="audio-block">
                <canvas class="audio-waveform-canvas" id="audio-waveform"></canvas>
                <span class="audio-name" id="audio-name-label">🎵 Audio Track</span>
              </div>
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
      // Don't scrub if clicking directly on a clip trim handle or delete button
      if (e.target.closest('.block-trim-handle') || e.target.closest('.btn-track-delete')) return;

      const isPlayheadCap = !!e.target.closest('.playhead-cap');
      const isRuler = !!e.target.closest('.timeline-ruler');
      const isTrackAudio = !!e.target.closest('#track-audio');

      // If clicking directly on a block (unless clicking the playhead cap or ruler), don't start scrub
      if (!isPlayheadCap && !isRuler && e.target.closest('.timeline-block')) return;

      // Clicking on the audio track selects audio layer settings
      if (isTrackAudio) {
        State.selectElement('audio');
      }

      this.isScrubbing = true;
      this.scrubToMouse(e);
      window.addEventListener('pointermove', handleScrubMove, { passive: false });
      window.addEventListener('pointerup', handleScrubEnd);
    };

    const handleScrubMove = (e) => {
      if (this.isScrubbing) {
        if (e.cancelable) e.preventDefault();
        this.scrubToMouse(e);
      }
    };

    const handleScrubEnd = () => {
      this.isScrubbing = false;
      window.removeEventListener('pointermove', handleScrubMove);
      window.removeEventListener('pointerup', handleScrubEnd);
    };

    this.scrollContainer.addEventListener('pointerdown', handleScrubStart);
    if (this.playhead) {
      this.playhead.addEventListener('pointerdown', handleScrubStart);
    }

    // Audio Track direct click/pointerdown handlers
    const audioTrackRow = this.container.querySelector('#track-audio');
    if (audioTrackRow) {
      audioTrackRow.addEventListener('click', (e) => {
        State.selectElement('audio');
      });
      audioTrackRow.addEventListener('pointerdown', (e) => {
        State.selectElement('audio');
      });
    }

    const audioBlock = this.container.querySelector('#audio-block');
    if (audioBlock) {
      audioBlock.addEventListener('click', (e) => {
        e.stopPropagation();
        State.selectElement('audio');
      });
      audioBlock.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        State.selectElement('audio');
      });
    }

    // 2-Way Vertical Scroll Synchronization between Tracks and Headers
    const headers = this.container.querySelector('.timeline-track-headers');
    let isSyncing = false;

    if (headers) {
      this.scrollContainer.addEventListener('scroll', () => {
        this.updatePlayhead(State.currentTime);
        if (isSyncing) return;
        isSyncing = true;
        headers.scrollTop = this.scrollContainer.scrollTop;
        isSyncing = false;
      }, { passive: true });

      headers.addEventListener('scroll', () => {
        if (isSyncing) return;
        isSyncing = true;
        this.scrollContainer.scrollTop = headers.scrollTop;
        this.updatePlayhead(State.currentTime);
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
    if (!this.playhead || !this.scrollContainer) return;
    const x = time * this.pixelsPerSecond;
    const scrollTop = this.scrollContainer.scrollTop;
    const visibleHeight = Math.max(this.scrollContainer.clientHeight, 120);
    // Move ONLY horizontally with x; keep vertically stationary at scrollTop to match sticky ruler
    this.playhead.style.transform = `translate3d(${x}px, ${scrollTop}px, 0)`;
    this.playhead.style.height = `${visibleHeight}px`;
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
    const headersContent = this.container.querySelector('#timeline-headers-content');
    const tracksRows = this.container.querySelector('#timeline-tracks-rows');

    if (!headersContent || !tracksRows) return;

    headersContent.innerHTML = '<div class="track-header ruler-header">Tracks</div>';
    tracksRows.innerHTML = '';

    const textElems = State.project.elements.filter(e => e.type === 'text');
    const emojiElems = State.project.elements.filter(e => e.type === 'emoji');
    const shapeElems = State.project.elements.filter(e => e.type === 'shape');

    // 1. Text Layers
    if (textElems.length === 0) {
      const h = document.createElement('div');
      h.className = 'track-header';
      h.innerHTML = `<span class="track-title">Text</span>`;
      headersContent.appendChild(h);

      const r = document.createElement('div');
      r.className = 'timeline-track-row empty-track';
      r.dataset.type = 'text';
      tracksRows.appendChild(r);
    } else {
      textElems.forEach((elem, i) => {
        const h = document.createElement('div');
        h.className = 'track-header';
        h.dataset.id = elem.id;
        const textLabel = elem.text ? elem.text.slice(0, 14).replace(/\n/g, ' ') : 'Text';
        const displayLabel = textElems.length > 1 ? `Text ${i + 1}: ${textLabel}` : `Text: ${textLabel}`;
        h.innerHTML = `<span class="track-title" title="${Utils.escapeHtml(textLabel)}">${Utils.escapeHtml(displayLabel)}</span>`;
        h.addEventListener('click', () => State.selectElement(elem.id));
        headersContent.appendChild(h);

        const r = document.createElement('div');
        r.className = 'timeline-track-row';
        r.dataset.id = elem.id;
        r.dataset.type = 'text';
        r.appendChild(this.createBlockElement(elem));
        tracksRows.appendChild(r);
      });
    }

    // 2. Separate Layer for every Emoji
    if (emojiElems.length === 0) {
      const h = document.createElement('div');
      h.className = 'track-header';
      h.innerHTML = `<span class="track-title">Emoji</span>`;
      headersContent.appendChild(h);

      const r = document.createElement('div');
      r.className = 'timeline-track-row empty-track';
      r.dataset.type = 'emoji';
      tracksRows.appendChild(r);
    } else {
      emojiElems.forEach((elem, i) => {
        const h = document.createElement('div');
        h.className = 'track-header';
        h.dataset.id = elem.id;
        const emojiLabel = `Emoji ${emojiElems.length > 1 ? (i + 1) + ' ' : ''}${elem.emoji || '✨'}`;
        h.innerHTML = `
          <span class="track-title" title="${Utils.escapeHtml(emojiLabel)}">${Utils.escapeHtml(emojiLabel)}</span>
          <button class="btn-track-delete" data-id="${Utils.escapeHtml(elem.id)}" title="Delete Emoji Layer">&times;</button>
        `;
        h.addEventListener('click', (e) => {
          if (e.target.closest('.btn-track-delete')) {
            e.stopPropagation();
            State.removeElement(elem.id);
            Utils.showToast('Emoji layer deleted', 'info');
            return;
          }
          State.selectElement(elem.id);
        });
        headersContent.appendChild(h);

        const r = document.createElement('div');
        r.className = 'timeline-track-row';
        r.dataset.id = elem.id;
        r.dataset.type = 'emoji';
        r.appendChild(this.createBlockElement(elem));
        tracksRows.appendChild(r);
      });
    }

    // 3. Separate Layer for every Shape or Deco
    if (shapeElems.length === 0) {
      const h = document.createElement('div');
      h.className = 'track-header';
      h.innerHTML = `<span class="track-title">Shapes / Deco</span>`;
      headersContent.appendChild(h);

      const r = document.createElement('div');
      r.className = 'timeline-track-row empty-track';
      r.dataset.type = 'shape';
      tracksRows.appendChild(r);
    } else {
      shapeElems.forEach((elem, i) => {
        const h = document.createElement('div');
        h.className = 'track-header';
        h.dataset.id = elem.id;
        const rawShape = elem.shape || 'Deco';
        const formattedShape = rawShape.charAt(0).toUpperCase() + rawShape.slice(1);
        const decoLabel = `Deco ${shapeElems.length > 1 ? (i + 1) + ': ' : ''}${formattedShape}`;
        h.innerHTML = `
          <span class="track-title" title="${Utils.escapeHtml(decoLabel)}">${Utils.escapeHtml(decoLabel)}</span>
          <button class="btn-track-delete" data-id="${Utils.escapeHtml(elem.id)}" title="Delete Deco Layer">&times;</button>
        `;
        h.addEventListener('click', (e) => {
          if (e.target.closest('.btn-track-delete')) {
            e.stopPropagation();
            State.removeElement(elem.id);
            Utils.showToast('Deco layer deleted', 'info');
            return;
          }
          State.selectElement(elem.id);
        });
        headersContent.appendChild(h);

        const r = document.createElement('div');
        r.className = 'timeline-track-row';
        r.dataset.id = elem.id;
        r.dataset.type = 'shape';
        r.appendChild(this.createBlockElement(elem));
        tracksRows.appendChild(r);
      });
    }

    // 4. Social Handle Layer
    const handleHeader = document.createElement('div');
    handleHeader.className = 'track-header';
    handleHeader.dataset.id = 'socialHandle';
    handleHeader.innerHTML = `<span class="track-title">Social Handle</span>`;
    handleHeader.addEventListener('click', () => State.selectElement('socialHandle'));
    headersContent.appendChild(handleHeader);

    const handleRow = document.createElement('div');
    handleRow.className = 'timeline-track-row';
    handleRow.id = 'track-handle';
    handleRow.dataset.type = 'handle';
    if (State.project.socialHandle && State.project.socialHandle.enabled) {
      handleRow.appendChild(this.createBlockElement(State.project.socialHandle, 'socialHandle'));
    }
    tracksRows.appendChild(handleRow);

    // 5. Audio Track Header
    const audioHeader = document.createElement('div');
    audioHeader.className = 'track-header audio-header';
    audioHeader.dataset.id = 'audio';
    audioHeader.innerHTML = `<span>Music Track</span>`;
    audioHeader.addEventListener('click', () => State.selectElement('audio'));
    audioHeader.addEventListener('pointerdown', () => State.selectElement('audio'));
    headersContent.appendChild(audioHeader);
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
      b.classList.toggle('selected', b.dataset.id === selectedId);
    }
    const headers = this.container.querySelectorAll('.timeline-track-headers .track-header');
    for (const h of headers) {
      h.classList.toggle('selected-track-header', h.dataset.id === selectedId);
    }
    const audioTrack = this.container.querySelector('#track-audio');
    if (audioTrack) {
      audioTrack.classList.toggle('selected-audio-track', selectedId === 'audio');
    }
    const audioBlock = this.container.querySelector('#audio-block');
    if (audioBlock) {
      audioBlock.classList.toggle('selected', selectedId === 'audio');
    }
  }

  drawWaveform() {
    const audioBlock = this.container.querySelector('#audio-block');
    const audio = State.project.audio;

    if (!audioBlock) return;

    if (!audio || !audio.enabled) {
      audioBlock.style.display = 'none';
      return;
    }

    audioBlock.style.display = 'flex';
    const duration = State.project.duration || 15;
    const trackWidth = Math.max(20, duration * this.pixelsPerSecond);
    audioBlock.style.left = '0px';
    audioBlock.style.width = `${trackWidth}px`;

    let canvas = audioBlock.querySelector('#audio-waveform');
    let nameLabel = audioBlock.querySelector('#audio-name-label');

    const safeAudioName = Utils.escapeHtml(audio.name || 'Audio Track');

    if (!canvas || !nameLabel) {
      audioBlock.innerHTML = `
        <canvas class="audio-waveform-canvas" id="audio-waveform"></canvas>
        <span class="audio-name" id="audio-name-label">🎵 ${safeAudioName}</span>
      `;
      canvas = audioBlock.querySelector('#audio-waveform');
      nameLabel = audioBlock.querySelector('#audio-name-label');
    } else {
      nameLabel.textContent = `🎵 ${audio.name || 'Audio Track'}`;
    }

    this.waveformCanvas = canvas;
    if (!canvas) return;

    const peaks = AudioSys.waveformPeaks;
    if (!peaks || peaks.length === 0) return;

    const blockHeight = audioBlock.clientHeight > 0 ? audioBlock.clientHeight : 34;
    canvas.width = trackWidth;
    canvas.height = blockHeight;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(56, 239, 125, 0.45)';
    const barWidth = 3;
    const gap = 2;
    const totalBars = Math.floor(trackWidth / (barWidth + gap));
    const centerY = canvas.height / 2;

    for (let i = 0; i < totalBars; i++) {
      const peakIdx = Math.floor((i / totalBars) * peaks.length);
      const val = peaks[peakIdx] || 0.15;
      const barH = Math.max(3, val * (canvas.height - 8));
      const x = i * (barWidth + gap);

      ctx.fillRect(x, centerY - barH / 2, barWidth, barH);
    }
  }
}
