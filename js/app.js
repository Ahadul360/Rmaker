/**
 * ReelMaker Main Application Controller
 * Orchestrates rendering loop, interactive pointer dragging on canvas,
 * tool panels, keyboard shortcuts, templates, and PWA offline readiness.
 */

import { Utils } from './utils.js';
import { State } from './state.js';
import { Storage } from './project-storage.js';
import { Presets } from './presets.js';
import { CanvasRenderer } from './canvas-renderer.js';
import { AudioSys } from './audio-engine.js';
import { Timeline } from './timeline.js';
import { Exporter } from './video-exporter.js';
import { TextEditor } from './text-editor.js';
import { BackgroundEditor } from './background-editor.js';

class ReelApp {
  constructor() {
    this.canvas = null;
    this.renderer = null;
    this.timeline = null;
    this.textEditor = null;
    this.bgEditor = null;

    this.activeToolTab = 'text'; // 'text' | 'emoji' | 'background' | 'shapes' | 'handle' | 'audio' | 'templates'
    this.canvasDrag = null; // { type: 'body'|'nw'|'ne'|'se'|'sw'|'rot', elemId, startX, startY, origX, origY, origW, origH, origRot, origSize }

    // Playback clock
    this.lastFrameTime = 0;
    this.renderNeeded = true;
  }

  async init() {
    this.canvas = document.getElementById('preview-canvas');
    if (!this.canvas) {
      console.error('Canvas #preview-canvas not found');
      return;
    }

    // Initialize Canvas Renderer
    this.renderer = new CanvasRenderer(this.canvas);

    // Initialize IndexedDB Storage
    await Storage.init();

    // Check if there is an existing project in storage, or load default
    const savedProjects = await Storage.getAllProjects();
    if (savedProjects.length > 0) {
      State.loadProject(savedProjects[0]);
    } else {
      State.initDefaultProject();
      await Storage.saveProject(State.project);
    }

    // Initialize Submodules
    this.initTimeline();
    this.initEditors();
    this.initToolbar();
    this.initLeftTools();
    this.initCanvasInteractions();
    this.initShortcuts();
    this.initPWA();

    // Preload fonts
    Utils.loadFont('Hind Siliguri');
    Utils.loadFont('Noto Serif Bengali');
    Utils.loadFont('Noto Sans Bengali');
    Utils.loadFont('Outfit');

    // Preload audio
    if (State.project.audio && State.project.audio.enabled) {
      AudioSys.loadTrack(State.project.audio);
    }

    // Global audio sync with playback and timeline
    this.setupGlobalAudioSync();

    // Adjust canvas resolution and setup responsive resize listeners
    this.resizeCanvas();
    requestAnimationFrame(() => this.resizeCanvas());
    setTimeout(() => this.resizeCanvas(), 100);
    this.setupResponsiveCanvas();

    // Start render loop
    State.on('stateRenderNeeded', () => { this.renderNeeded = true; });
    requestAnimationFrame(this.renderLoop.bind(this));

    Utils.showToast('ReelMaker ready! (Offline capable)', 'success', 3000);
  }

  setupGlobalAudioSync() {
    // Listen to playback state changes globally
    State.on('playbackChange', async (isPlaying) => {
      if (isPlaying) {
        await AudioSys.playAt(State.currentTime);
      } else {
        AudioSys.stop();
      }
    });

    // Listen to scrubbing/seeking while playing
    State.on('timeChange', ({ time, notifyAudio }) => {
      if (State.isPlaying && notifyAudio) {
        AudioSys.playAt(time);
      }
    });

    // Listen to audio property updates
    State.on('audioUpdate', (audio) => {
      if (audio.muted) {
        AudioSys.setVolume(0);
      } else {
        AudioSys.setVolume(audio.volume !== undefined ? audio.volume : 0.85);
      }
      if (!audio.enabled) {
        AudioSys.stop();
      }
    });
  }

  setupResponsiveCanvas() {
    // ResizeObserver watches the wrapper container dynamically
    const wrapper = document.querySelector('.canvas-viewport-wrapper');
    if (wrapper && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        this.resizeCanvas();
      });
      ro.observe(wrapper);
    }

    window.addEventListener('resize', Utils.debounce(() => this.resizeCanvas(), 50));
    window.addEventListener('orientationchange', () => setTimeout(() => this.resizeCanvas(), 150));
  }

  initTimeline() {
    const timelineEl = document.getElementById('timeline-container');
    if (timelineEl) {
      this.timeline = new Timeline(timelineEl);
    }
  }

  initEditors() {
    const textPanel = document.getElementById('panel-text-content');
    if (textPanel) {
      this.textEditor = new TextEditor(textPanel);
    }

    const bgPanel = document.getElementById('panel-bg-content');
    if (bgPanel) {
      this.bgEditor = new BackgroundEditor(bgPanel);
    }

    this.initEmojiPanel();
    this.initShapesPanel();
    this.initHandlePanel();
    this.initAudioPanel();
  }

  initToolbar() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    const btnSave = document.getElementById('btn-save');
    const btnNew = document.getElementById('btn-new');
    const btnOpen = document.getElementById('btn-open');
    const btnExport = document.getElementById('btn-export');
    const btnSafeArea = document.getElementById('btn-safe-area');
    const inputTitle = document.getElementById('input-project-title');
    const saveBadge = document.getElementById('save-status-badge');

    // Aspect Ratio Buttons
    const ratioBtns = document.querySelectorAll('.ratio-pill');
    ratioBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        ratioBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        State.setAspectRatio(btn.dataset.ratio);
        this.resizeCanvas();
      });
    });

    // Undo / Redo
    btnUndo.addEventListener('click', () => State.undo());
    btnRedo.addEventListener('click', () => State.redo());

    State.on('historyChange', ({ canUndo, canRedo }) => {
      btnUndo.disabled = !canUndo;
      btnRedo.disabled = !canRedo;
    });

    // Project Title
    inputTitle.value = State.project.name || 'Untitled Reel';
    inputTitle.addEventListener('change', (e) => {
      State.setProjectName(e.target.value.trim() || 'Untitled Reel');
    });

    // Save
    btnSave.addEventListener('click', async () => {
      await Storage.saveProject(State.project);
      State.setSaveStatus('saved');
      Utils.showToast('Project saved to local device!', 'success');
    });

    State.on('saveStatusChange', (status) => {
      if (status === 'saved') {
        saveBadge.innerHTML = `<span class="status-dot dot-green"></span> Saved`;
      } else if (status === 'saving') {
        saveBadge.innerHTML = `<span class="status-dot dot-yellow"></span> Saving...`;
      } else {
        saveBadge.innerHTML = `<span class="status-dot dot-gray"></span> Unsaved`;
      }
    });

    // New Project
    btnNew.addEventListener('click', () => {
      if (confirm('Create a new project? Any unsaved edits will be lost.')) {
        State.initDefaultProject();
        this.resizeCanvas();
        inputTitle.value = State.project.name;
        this.timeline.render();
        Utils.showToast('New project created', 'info');
      }
    });

    // Open Project Modal
    btnOpen.addEventListener('click', () => this.openProjectsModal());

    // Safe Area Toggle
    btnSafeArea.addEventListener('click', () => {
      State.showSafeArea = !State.showSafeArea;
      btnSafeArea.classList.toggle('active', State.showSafeArea);
      this.renderNeeded = true;
    });

    // Export Button
    btnExport.addEventListener('click', () => {
      Exporter.openSettings();
    });

    // Responsive Top Title Sync
    State.on('projectLoaded', (proj) => {
      inputTitle.value = proj.name;
      ratioBtns.forEach(b => b.classList.toggle('active', b.dataset.ratio === proj.aspectRatio));
      this.resizeCanvas();
      if (proj.audio && proj.audio.enabled) {
        AudioSys.loadTrack(proj.audio);
      }
    });
  }

  initLeftTools() {
    const toolButtons = document.querySelectorAll('.sidebar-nav-btn');
    const panels = document.querySelectorAll('.tool-panel-tab');
    const drawer = document.getElementById('tool-panels-drawer');
    const backdrop = document.getElementById('tool-drawer-backdrop');
    const drawerTitle = document.getElementById('drawer-active-title');
    const closeBtn = document.getElementById('btn-close-tool-drawer');

    const toolTitles = {
      text: 'Text & Typography',
      emoji: 'Emoji Stickers',
      background: 'Backdrop & Patterns',
      shapes: 'Decorations & Shapes',
      handle: 'Creator Branding Handle',
      audio: 'Audio & Music'
    };

    const closeMobileDrawer = () => {
      if (drawer) drawer.classList.remove('mobile-open');
      if (backdrop) backdrop.classList.remove('mobile-open');
      toolButtons.forEach(b => b.classList.remove('active'));
      const ws = document.querySelector('.app-workspace');
      if (ws) ws.classList.remove('drawer-open');
      document.getElementById('app-container')?.classList.remove('drawer-open');
      this.resizeCanvas();
      setTimeout(() => this.resizeCanvas(), 50);
    };

    toolButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        if (tool === 'templates') {
          closeMobileDrawer();
          this.openTemplatesModal();
          return;
        }

        const isAlreadyActive = btn.classList.contains('active') && drawer && drawer.classList.contains('mobile-open');
        if (isAlreadyActive && window.innerWidth <= 768) {
          closeMobileDrawer();
          return;
        }

        toolButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        panels.forEach(p => {
          if (p.id === `tab-${tool}`) {
            p.classList.add('active');
          } else {
            p.classList.remove('active');
          }
        });

        // Open mobile bottom sheet
        if (window.innerWidth <= 768) {
          if (drawer) drawer.classList.add('mobile-open');
          if (backdrop) backdrop.classList.add('mobile-open');
          if (drawerTitle) drawerTitle.textContent = toolTitles[tool] || 'Editing Panel';
          const ws = document.querySelector('.app-workspace');
          if (ws) ws.classList.add('drawer-open');
          document.getElementById('app-container')?.classList.add('drawer-open');
          this.resizeCanvas();
          setTimeout(() => this.resizeCanvas(), 50);
        }

        this.activeToolTab = tool;
      });
    });

    if (closeBtn) closeBtn.addEventListener('click', closeMobileDrawer);
    if (backdrop) backdrop.addEventListener('click', closeMobileDrawer);

    const dragPill = document.querySelector('.drawer-drag-pill');
    if (dragPill) dragPill.addEventListener('click', closeMobileDrawer);
  }

  initEmojiPanel() {
    const grid = document.getElementById('emoji-grid');
    if (!grid) return;

    grid.innerHTML = Presets.emojis.map(e => `
      <button class="emoji-picker-btn" data-emoji="${e}">${e}</button>
    `).join('');

    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('.emoji-picker-btn');
      if (!btn) return;

      const emoji = btn.dataset.emoji;
      const newEmojiElem = {
        id: Utils.generateId('emoji'),
        type: 'emoji',
        emoji: emoji,
        x: 0.5,
        y: 0.6,
        size: 64,
        rotation: 0,
        opacity: 1.0,
        startTime: 0,
        endTime: State.project.duration,
        animation: 'popIn',
        animationDuration: 0.8
      };

      State.addElement(newEmojiElem);
      Utils.showToast(`Emoji ${emoji} added`, 'success');
    });

    // Emoji size slider
    const slider = document.getElementById('input-emoji-size');
    if (slider) {
      slider.addEventListener('input', (e) => {
        const selected = State.getSelectedElement();
        if (selected && selected.type === 'emoji') {
          State.updateElement(selected.id, { size: parseInt(e.target.value, 10) });
        }
      });
    }
  }

  initShapesPanel() {
    const grid = document.getElementById('shapes-grid');
    if (!grid) return;

    grid.innerHTML = Presets.shapes.map(s => `
      <button class="shape-picker-btn" data-shape="${s.id}">
        <span class="shape-icon">${s.icon}</span>
        <span class="shape-name">${s.name}</span>
      </button>
    `).join('');

    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('.shape-picker-btn');
      if (!btn) return;

      const shapeId = btn.dataset.shape;
      const newShapeElem = {
        id: Utils.generateId('shape'),
        type: 'shape',
        shape: shapeId,
        x: 0.5,
        y: 0.35,
        width: 60,
        height: 60,
        color: '#685B53',
        rotation: 0,
        opacity: 0.8,
        startTime: 0,
        endTime: State.project.duration,
        animation: 'fadeIn',
        animationDuration: 1.0
      };

      State.addElement(newShapeElem);
      Utils.showToast(`Decorative ${shapeId} added`, 'success');
    });

    // Shape color & size
    const colorInput = document.getElementById('input-shape-color');
    const sizeInput = document.getElementById('input-shape-size');
    if (colorInput) {
      colorInput.addEventListener('input', (e) => {
        const selected = State.getSelectedElement();
        if (selected && selected.type === 'shape') {
          State.updateElement(selected.id, { color: e.target.value });
        }
      });
    }
    if (sizeInput) {
      sizeInput.addEventListener('input', (e) => {
        const selected = State.getSelectedElement();
        if (selected && selected.type === 'shape') {
          const val = parseInt(e.target.value, 10);
          State.updateElement(selected.id, { width: val, height: val });
        }
      });
    }
  }

  initHandlePanel() {
    const checkEnable = document.getElementById('check-handle-enable');
    const inputText = document.getElementById('input-handle-text');
    const selectPos = document.getElementById('select-handle-pos');
    const inputColor = document.getElementById('input-handle-color');
    const inputSize = document.getElementById('input-handle-size');
    const checkBadge = document.getElementById('check-handle-badge');

    if (!checkEnable) return;

    const syncHandleUI = () => {
      const handle = State.project.socialHandle || {};
      checkEnable.checked = !!handle.enabled;
      inputText.value = handle.text || '@yourname';
      selectPos.value = handle.positionPreset || 'bottom-center';
      inputColor.value = handle.color || '#5A5049';
      inputSize.value = handle.fontSize || 26;
      checkBadge.checked = !!(handle.backgroundBadge && handle.backgroundBadge.enabled);
    };

    checkEnable.addEventListener('change', (e) => {
      State.updateSocialHandle({ enabled: e.target.checked });
    });

    inputText.addEventListener('input', (e) => {
      State.updateSocialHandle({ text: e.target.value });
    });

    selectPos.addEventListener('change', (e) => {
      State.updateSocialHandle({ positionPreset: e.target.value });
    });

    inputColor.addEventListener('input', (e) => {
      State.updateSocialHandle({ color: e.target.value });
    });

    inputSize.addEventListener('input', (e) => {
      State.updateSocialHandle({ fontSize: parseInt(e.target.value, 10) });
    });

    checkBadge.addEventListener('change', (e) => {
      const current = State.project.socialHandle.backgroundBadge || {};
      State.updateSocialHandle({ backgroundBadge: { ...current, enabled: e.target.checked } });
    });

    State.on('projectLoaded', syncHandleUI);
    syncHandleUI();
  }

  initAudioPanel() {
    const checkEnable = document.getElementById('check-audio-enable');
    const selectBundled = document.getElementById('select-bundled-audio');
    const inputFile = document.getElementById('input-audio-file');
    const inputVolume = document.getElementById('input-audio-volume');
    const checkLoop = document.getElementById('check-audio-loop');
    const btnPreview = document.getElementById('btn-preview-audio');

    if (!checkEnable) return;

    const syncAudioUI = () => {
      const audio = State.project.audio || {};
      checkEnable.checked = !!audio.enabled;
      inputVolume.value = audio.volume !== undefined ? audio.volume : 0.85;
      checkLoop.checked = audio.loop !== undefined ? audio.loop : true;
      if (audio.trackId) selectBundled.value = audio.trackId;
    };

    checkEnable.addEventListener('change', async (e) => {
      await AudioSys.unlockAudioContext();
      State.updateAudio({ enabled: e.target.checked });
      if (!e.target.checked) {
        AudioSys.stop();
      } else {
        await AudioSys.loadTrack(State.project.audio);
        if (State.isPlaying) {
          AudioSys.playAt(State.currentTime);
        }
      }
    });

    selectBundled.addEventListener('change', async (e) => {
      await AudioSys.unlockAudioContext();
      const trackId = e.target.value;
      const bundled = Presets.bundledAudio.find(b => b.id === trackId);
      if (bundled) {
        State.updateAudio({
          enabled: true,
          trackId: bundled.id,
          name: bundled.name,
          sourceType: 'bundled',
          sourceUrl: bundled.url,
          blobId: null
        });
        await AudioSys.loadTrack(State.project.audio);
        if (State.isPlaying) {
          AudioSys.playAt(State.currentTime);
        }
        Utils.showToast(`Selected: ${bundled.name}`, 'info');
      }
    });

    inputFile.addEventListener('change', async (e) => {
      await AudioSys.unlockAudioContext();
      const file = e.target.files[0];
      if (file) {
        await AudioSys.importLocalAudioFile(file);
      }
    });

    inputVolume.addEventListener('input', (e) => {
      const vol = parseFloat(e.target.value);
      State.updateAudio({ volume: vol });
      AudioSys.setVolume(vol);
    });

    checkLoop.addEventListener('change', (e) => {
      State.updateAudio({ loop: e.target.checked });
    });

    btnPreview.addEventListener('click', async () => {
      await AudioSys.unlockAudioContext();
      if (AudioSys.isPlaying) {
        AudioSys.stop();
        btnPreview.innerHTML = `<span>▶ Preview Music</span>`;
      } else {
        await AudioSys.playAt(0);
        btnPreview.innerHTML = `<span>⏹ Stop Music</span>`;
      }
    });

    State.on('projectLoaded', syncAudioUI);
    syncAudioUI();
  }

  initCanvasInteractions() {
    const canvas = this.canvas;

    const getCanvasCoords = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

      // Normalization to canvas internal resolution
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    };

    const handlePointerDown = (e) => {
      const { x, y } = getCanvasCoords(e);
      const hit = this.renderer.hitTest(x, y, canvas.width, canvas.height);

      if (hit) {
        e.preventDefault(); // Prevent page scrolling during drag
        State.selectElement(hit.id);

        const elem = hit.id === 'socialHandle' ? State.project.socialHandle : State.project.elements.find(el => el.id === hit.id);
        if (!elem) return;

        this.canvasDrag = {
          type: hit.handle,
          elemId: hit.id,
          elem,
          startX: x,
          startY: y,
          origX: elem.x,
          origY: elem.y,
          origRot: elem.rotation || 0,
          origFontSize: elem.fontSize || 52,
          origSize: elem.size || elem.width || 60
        };

        window.addEventListener('pointermove', handlePointerMove, { passive: false });
        window.addEventListener('pointerup', handlePointerUp);
      } else {
        // Clicked outside elements -> deselect
        State.selectElement(null);
      }
    };

    const handlePointerMove = (e) => {
      if (!this.canvasDrag) return;
      e.preventDefault();

      const { x, y } = getCanvasCoords(e);
      const drag = this.canvasDrag;
      const elem = drag.elem;

      if (drag.type === 'body') {
        const dx = (x - drag.startX) / canvas.width;
        const dy = (y - drag.startY) / canvas.height;
        elem.x = Utils.clamp(drag.origX + dx, -0.3, 1.3);
        elem.y = Utils.clamp(drag.origY + dy, -0.3, 1.3);
      } else if (drag.type === 'rot') {
        const cx = elem.x * canvas.width;
        const cy = elem.y * canvas.height;
        const angleRad = Math.atan2(y - cy, x - cx);
        const angleDeg = Math.round((angleRad * (180 / Math.PI)) + 90);
        elem.rotation = angleDeg;
      } else if (['nw', 'ne', 'se', 'sw'].includes(drag.type)) {
        // Resize scale
        const cx = elem.x * canvas.width;
        const cy = elem.y * canvas.height;
        const distOrig = Math.hypot(drag.startX - cx, drag.startY - cy);
        const distNow = Math.hypot(x - cx, y - cy);
        const ratio = distNow / Math.max(1, distOrig);

        if (elem.type === 'text') {
          elem.fontSize = Math.round(Utils.clamp(drag.origFontSize * ratio, 18, 140));
        } else if (elem.type === 'emoji') {
          elem.size = Math.round(Utils.clamp(drag.origSize * ratio, 24, 160));
        } else if (elem.type === 'shape') {
          const newDim = Math.round(Utils.clamp(drag.origSize * ratio, 20, 250));
          elem.width = newDim;
          elem.height = newDim;
        }
      }

      this.renderNeeded = true;
    };

    const handlePointerUp = () => {
      if (this.canvasDrag) {
        State.pushUndo(`Move / Transform ${this.canvasDrag.elemId}`);
        this.canvasDrag = null;
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
  }

  resizeCanvas() {
    const ratio = State.project?.aspectRatio || '9:16';
    const { width, height } = Presets.aspectRatios[ratio] || { width: 1080, height: 1920 };

    this.canvas.width = width;
    this.canvas.height = height;

    const wrapper = document.querySelector('.canvas-viewport-wrapper');
    const viewport = document.getElementById('canvas-viewport');

    if (wrapper && viewport) {
      const isMobile = window.innerWidth <= 768;
      const rect = wrapper.getBoundingClientRect();
      const wrapW = rect.width > 0 ? rect.width : (wrapper.clientWidth || 300);
      const wrapH = rect.height > 0 ? rect.height : (wrapper.clientHeight || 400);

      const padX = isMobile ? 24 : 32;
      const padY = isMobile ? 20 : 32;

      let availW = Math.max(60, wrapW - padX);
      let availH = Math.max(60, wrapH - padY);

      if (isMobile) {
        // Slightly scale down on mobile view (85%) so canvas is "little smaller" as requested
        availW = Math.floor(availW * 0.85);
        availH = Math.floor(availH * 0.85);
      }

      const targetAspect = width / height;
      const containerAspect = availW / availH;

      let displayW, displayH;

      if (containerAspect > targetAspect) {
        // Height is limiting factor
        displayH = availH;
        displayW = availH * targetAspect;
      } else {
        // Width is limiting factor
        displayW = availW;
        displayH = availW / targetAspect;
      }

      const finalW = Math.max(60, Math.floor(displayW));
      const finalH = Math.max(60, Math.floor(displayH));

      viewport.style.width = `${finalW}px`;
      viewport.style.height = `${finalH}px`;
      viewport.style.aspectRatio = `${width} / ${height}`;

      this.canvas.style.width = `${finalW}px`;
      this.canvas.style.height = `${finalH}px`;
      this.canvas.style.aspectRatio = `${width} / ${height}`;
    }

    this.renderNeeded = true;
  }

  renderLoop(timestamp) {
    if (this.lastFrameTime === 0) this.lastFrameTime = timestamp;
    const delta = (timestamp - this.lastFrameTime) / 1000;
    this.lastFrameTime = timestamp;

    if (State.isPlaying) {
      let nextTime = State.currentTime + delta;
      if (nextTime >= State.project.duration) {
        nextTime = 0; // Loop playback
        AudioSys.playAt(0);
      }
      State.setTime(nextTime, false);
      this.renderNeeded = true;
    }

    if (this.renderNeeded) {
      this.renderer.renderFrame(State.currentTime, this.canvas, { isExport: false });
      this.renderNeeded = false;
    }

    requestAnimationFrame(this.renderLoop.bind(this));
  }

  initShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Don't trigger shortcuts if focus is inside text input or textarea
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        return;
      }

      // Space: Play / Pause
      if (e.code === 'Space') {
        e.preventDefault();
        State.togglePlay();
        if (State.isPlaying) {
          AudioSys.playAt(State.currentTime);
        } else {
          AudioSys.stop();
        }
        return;
      }

      // Undo: Ctrl/Cmd + Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        State.undo();
        return;
      }

      // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
      if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') || ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
        e.preventDefault();
        State.redo();
        return;
      }

      // Save: Ctrl/Cmd + S
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        Storage.saveProject(State.project);
        State.setSaveStatus('saved');
        Utils.showToast('Project saved!', 'success');
        return;
      }

      // Delete: Delete or Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (State.selectedElementId && State.selectedElementId !== 'socialHandle') {
          e.preventDefault();
          State.removeElement(State.selectedElementId);
          Utils.showToast('Element deleted', 'info');
        }
      }

      // Escape: Deselect
      if (e.key === 'Escape') {
        State.selectElement(null);
        document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
      }
    });
  }

  openTemplatesModal() {
    let modal = document.getElementById('templates-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'templates-modal';
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-card modal-lg">
          <div class="modal-header">
            <h3>Choose a Reel Template</h3>
            <button class="modal-close" id="btn-close-templates">&times;</button>
          </div>
          <div class="modal-body">
            <div class="templates-cards-grid" id="templates-grid"></div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelector('#btn-close-templates').addEventListener('click', () => modal.classList.remove('active'));
    }

    const grid = modal.querySelector('#templates-grid');
    grid.innerHTML = Presets.templates.map(tmpl => `
      <div class="template-card" data-id="${tmpl.id}">
        <div class="template-preview-badge" style="background-color: ${tmpl.background.color || '#F7F1E5'};">
          <span class="preview-emoji">${tmpl.elements.find(e => e.type === 'emoji')?.emoji || '✨'}</span>
        </div>
        <div class="template-info">
          <h5>${tmpl.title}</h5>
          <p>${tmpl.description}</p>
          <span class="template-badge">${tmpl.aspectRatio} • ${tmpl.duration}s</span>
        </div>
      </div>
    `).join('');

    grid.onclick = (e) => {
      const card = e.target.closest('.template-card');
      if (!card) return;
      const tmplId = card.dataset.id;
      State.applyTemplate(tmplId);
      modal.classList.remove('active');
      this.resizeCanvas();
      if (State.project.audio && State.project.audio.enabled) {
        AudioSys.loadTrack(State.project.audio);
      }
      Utils.showToast('Template applied successfully!', 'success');
    };

    modal.classList.add('active');
  }

  async openProjectsModal() {
    let modal = document.getElementById('projects-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'projects-modal';
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-card modal-lg">
          <div class="modal-header">
            <h3>Saved Local Projects</h3>
            <div class="header-actions">
              <button class="btn btn-sm btn-secondary" id="btn-export-project-json">Export File</button>
              <label class="btn btn-sm btn-secondary">
                Import File
                <input type="file" id="input-import-project" accept=".json" style="display:none;" />
              </label>
              <button class="modal-close" id="btn-close-projects">&times;</button>
            </div>
          </div>
          <div class="modal-body">
            <div class="projects-list-container" id="projects-list"></div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      modal.querySelector('#btn-close-projects').addEventListener('click', () => modal.classList.remove('active'));
      modal.querySelector('#btn-export-project-json').addEventListener('click', () => {
        Storage.exportProjectFile(State.project);
      });
      modal.querySelector('#input-import-project').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
          try {
            await Storage.importProjectFile(file);
            modal.classList.remove('active');
          } catch (err) {
            Utils.showToast(`Import failed: ${err.message}`, 'error');
          }
        }
      });
    }

    const listContainer = modal.querySelector('#projects-list');
    const projects = await Storage.getAllProjects();

    if (projects.length === 0) {
      listContainer.innerHTML = `<div class="empty-state">No saved projects found on this device.</div>`;
    } else {
      listContainer.innerHTML = projects.map(p => `
        <div class="project-item-row ${p.id === State.project.id ? 'active-project' : ''}" data-id="${p.id}">
          <div class="project-row-info">
            <span class="project-row-name">${Utils.escapeHtml(p.name || 'Untitled Reel')}</span>
            <span class="project-row-meta">${Utils.escapeHtml(p.aspectRatio)} • ${p.duration}s • Updated ${new Date(p.updatedAt || Date.now()).toLocaleDateString()}</span>
          </div>
          <div class="project-row-actions">
            <button class="btn btn-sm btn-primary btn-open-p" data-id="${p.id}">Open</button>
            <button class="btn btn-sm btn-secondary btn-dup-p" data-id="${p.id}">Duplicate</button>
            <button class="btn btn-sm btn-danger btn-del-p" data-id="${p.id}">Delete</button>
          </div>
        </div>
      `).join('');

      // Row Actions
      listContainer.onclick = async (e) => {
        const openBtn = e.target.closest('.btn-open-p');
        const dupBtn = e.target.closest('.btn-dup-p');
        const delBtn = e.target.closest('.btn-del-p');

        if (openBtn) {
          const proj = await Storage.getProject(openBtn.dataset.id);
          if (proj) {
            State.loadProject(proj);
            modal.classList.remove('active');
            Utils.showToast(`Opened "${proj.name}"`, 'success');
          }
        } else if (dupBtn) {
          const proj = await Storage.getProject(dupBtn.dataset.id);
          if (proj) {
            const dup = Utils.deepClone(proj);
            dup.id = Utils.generateId('proj');
            dup.name = `${dup.name} (Copy)`;
            dup.updatedAt = Date.now();
            await Storage.saveProject(dup);
            this.openProjectsModal(); // Refresh list
            Utils.showToast('Project duplicated', 'info');
          }
        } else if (delBtn) {
          if (confirm('Delete this project permanently from local storage?')) {
            await Storage.deleteProject(delBtn.dataset.id);
            this.openProjectsModal();
            Utils.showToast('Project deleted', 'info');
          }
        }
      };
    }

    modal.classList.add('active');
  }

  initPWA() {
    const offlineIndicator = document.getElementById('offline-indicator');

    const updateNetworkStatus = () => {
      if (offlineIndicator) {
        if (navigator.onLine) {
          offlineIndicator.innerHTML = `<span class="status-dot dot-green"></span> Offline Ready`;
        } else {
          offlineIndicator.innerHTML = `<span class="status-dot dot-orange"></span> Offline Mode`;
        }
      }
    };

    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    updateNetworkStatus();

    // Register Service Worker for true offline capability
    if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('./service-worker.js')
        .then((reg) => {
          console.log('[ServiceWorker] Registered with scope:', reg.scope);
          if (offlineIndicator) {
            offlineIndicator.innerHTML = `<span class="status-dot dot-green"></span> Offline Ready`;
          }
        })
        .catch((err) => {
          console.warn('[ServiceWorker] Registration failed:', err);
        });
    }
  }
}

// Instantiate and start when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  const app = new ReelApp();
  app.init();
  window.ReelApp = app; // For debugging access
});
