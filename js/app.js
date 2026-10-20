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
    this.State = State;
    this.Exporter = Exporter;
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
      const proj = savedProjects[0];
      let needsSave = false;
      if (proj && (!proj.name || proj.name === 'আমার প্রথম রিল (My First Reel)' || proj.name === 'আমার প্রথম রিল' || proj.name === 'Untitled Reel')) {
        proj.name = State.generateDefaultProjectName();
        needsSave = true;
      }
      if (proj && proj.socialHandle && (proj.socialHandle.text === '@yourname' || proj.socialHandle.text === '@yourhandle' || proj.socialHandle.text === '@ahadul.com' || proj.socialHandle.text.startsWith('@'))) {
        proj.socialHandle.text = 'ahadul.com';
        needsSave = true;
      }
      if (needsSave) {
        await Storage.saveProject(proj);
      }
      State.loadProject(proj);
    } else {
      State.initDefaultProject();
      await Storage.saveProject(State.project);
    }

    // Initialize Submodules
    this.initTimeline();
    this.initEditors();
    this.initToolbar();
    this.initLeftTools();
    this.setupLayerSelectionSync();
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

    // Start render loop with immediate synchronous paint fallback for iOS Safari rAF throttling
    State.on('stateRenderNeeded', () => {
      this.renderNeeded = true;
      if (this.renderer && this.canvas) {
        this.renderer.renderFrame(State.currentTime, this.canvas, { isExport: false });
      }
    });
    requestAnimationFrame(this.renderLoop.bind(this));

    Utils.showToast('ReelMaker ready! (Offline capable)', 'success', 3000);
  }

  setupGlobalAudioSync() {
    // Listen to playback state changes globally
    State.on('playbackChange', async (isPlaying) => {
      if (isPlaying) {
        try {
          await AudioSys.unlockAudioContext();
          if (AudioSys.ctx && (AudioSys.ctx.state === 'suspended' || AudioSys.ctx.state === 'interrupted')) {
            await AudioSys.ctx.resume();
          }
        } catch (e) {}
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
    if (btnUndo) btnUndo.addEventListener('click', () => State.undo());
    if (btnRedo) btnRedo.addEventListener('click', () => State.redo());

    State.on('historyChange', ({ canUndo, canRedo }) => {
      if (btnUndo) btnUndo.disabled = !canUndo;
      if (btnRedo) btnRedo.disabled = !canRedo;
    });

    // Project Title
    inputTitle.value = State.project.name || 'Untitled Reel';
    inputTitle.addEventListener('change', (e) => {
      State.setProjectName(e.target.value.trim() || 'Untitled Reel');
    });

    // Top Right Save & Project Menu
    const projectMenuContainer = document.getElementById('project-menu-container');
    const btnProjectMenu = document.getElementById('btn-project-menu');
    const menuSaveStatus = document.getElementById('menu-save-status');

    const toggleProjectMenu = (open) => {
      if (!projectMenuContainer) return;
      const willOpen = open !== undefined ? open : !projectMenuContainer.classList.contains('open');
      projectMenuContainer.classList.toggle('open', willOpen);
      if (btnProjectMenu) btnProjectMenu.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    };

    if (btnProjectMenu) {
      btnProjectMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleProjectMenu();
      });
    }

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (projectMenuContainer && !projectMenuContainer.contains(e.target)) {
        projectMenuContainer.classList.remove('open');
        if (btnProjectMenu) btnProjectMenu.setAttribute('aria-expanded', 'false');
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && projectMenuContainer && projectMenuContainer.classList.contains('open')) {
        projectMenuContainer.classList.remove('open');
        if (btnProjectMenu) btnProjectMenu.setAttribute('aria-expanded', 'false');
      }
    });

    // Menu Action: Save Project
    const menuSave = document.getElementById('menu-item-save');
    const handleSaveProject = async () => {
      toggleProjectMenu(false);
      await Storage.saveProject(State.project);
      State.setSaveStatus('saved');
      Utils.showToast('Project saved to local device!', 'success');
    };
    if (menuSave) menuSave.addEventListener('click', handleSaveProject);

    // Menu Action: New Project
    const menuNew = document.getElementById('menu-item-new');
    if (menuNew) {
      menuNew.addEventListener('click', () => {
        toggleProjectMenu(false);
        if (confirm('Create a new project? Any unsaved edits will be lost.')) {
          State.initDefaultProject();
          this.resizeCanvas();
          inputTitle.value = State.project.name;
          this.timeline.render();
          Utils.showToast('New project created', 'info');
        }
      });
    }

    // Menu Action: Open Saved Projects
    const menuOpen = document.getElementById('menu-item-open');
    if (menuOpen) {
      menuOpen.addEventListener('click', () => {
        toggleProjectMenu(false);
        this.openProjectsModal();
      });
    }

    // Menu Action: Import Project File
    const menuInputImport = document.getElementById('menu-input-import-file');
    if (menuInputImport) {
      menuInputImport.addEventListener('change', async (e) => {
        toggleProjectMenu(false);
        const file = e.target.files[0];
        if (file) {
          try {
            await Storage.importProjectFile(file);
          } catch (err) {
            Utils.showToast(`Import failed: ${err.message}`, 'error');
          }
        }
        e.target.value = '';
      });
    }

    // Menu Action: Export Project JSON
    const menuExportJson = document.getElementById('menu-item-export-json');
    if (menuExportJson) {
      menuExportJson.addEventListener('click', () => {
        toggleProjectMenu(false);
        Storage.exportProjectFile(State.project);
      });
    }

    // Menu Action: Export Video (MP4)
    const menuExportVideo = document.getElementById('menu-item-export-video');
    if (menuExportVideo) {
      menuExportVideo.addEventListener('click', () => {
        toggleProjectMenu(false);
        Exporter.openSettings();
      });
    }

    // Backward compatibility for keyboard shortcut Ctrl+S
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveProject();
      }
    });

    State.on('saveStatusChange', (status) => {
      if (status === 'saved') {
        if (saveBadge) saveBadge.innerHTML = `<span class="status-dot dot-green"></span> Saved`;
        if (menuSaveStatus) menuSaveStatus.innerHTML = `<span class="status-dot dot-green"></span> Saved locally`;
      } else if (status === 'saving') {
        if (saveBadge) saveBadge.innerHTML = `<span class="status-dot dot-yellow"></span> Saving...`;
        if (menuSaveStatus) menuSaveStatus.innerHTML = `<span class="status-dot dot-yellow"></span> Saving...`;
      } else {
        if (saveBadge) saveBadge.innerHTML = `<span class="status-dot dot-gray"></span> Unsaved`;
        if (menuSaveStatus) menuSaveStatus.innerHTML = `<span class="status-dot dot-gray"></span> Unsaved changes`;
      }
    });

    // Safe Area Toggle
    btnSafeArea.addEventListener('click', () => {
      State.showSafeArea = !State.showSafeArea;
      btnSafeArea.classList.toggle('active', State.showSafeArea);
      this.renderNeeded = true;
    });

    // Responsive Top Title Sync
    State.on('projectLoaded', (proj) => {
      inputTitle.value = proj.name || 'Reel Project';
      ratioBtns.forEach(b => b.classList.toggle('active', b.dataset.ratio === proj.aspectRatio));
      this.resizeCanvas();
      this.renderNeeded = true;
      if (proj.audio && proj.audio.enabled) {
        AudioSys.loadTrack(proj.audio);
      }
    });
  }

  closeMobileDrawer() {
    const drawer = document.getElementById('tool-panels-drawer');
    const backdrop = document.getElementById('tool-drawer-backdrop');
    const toolButtons = document.querySelectorAll('.sidebar-nav-btn');
    if (drawer) drawer.classList.remove('mobile-open');
    if (backdrop) backdrop.classList.remove('mobile-open');
    toolButtons.forEach(b => b.classList.remove('active'));
    const ws = document.querySelector('.app-workspace');
    if (ws) ws.classList.remove('drawer-open');
    document.getElementById('app-container')?.classList.remove('drawer-open');
    this.resizeCanvas();
    setTimeout(() => this.resizeCanvas(), 50);
  }

  openToolTab(tool) {
    const toolButtons = document.querySelectorAll('.sidebar-nav-btn');
    const panels = document.querySelectorAll('.tool-panel-tab');
    const drawer = document.getElementById('tool-panels-drawer');
    const backdrop = document.getElementById('tool-drawer-backdrop');
    const drawerTitle = document.getElementById('drawer-active-title');

    const toolTitles = {
      text: 'Text & Typography',
      emoji: 'Emoji Stickers',
      background: 'Backdrop & Patterns',
      shapes: 'Decorations & Shapes',
      handle: 'Creator Branding Handle',
      audio: 'Audio & Music'
    };

    if (tool === 'templates') {
      this.closeMobileDrawer();
      this.openTemplatesModal();
      return;
    }

    toolButtons.forEach(b => {
      b.classList.toggle('active', b.dataset.tool === tool);
    });

    panels.forEach(p => {
      p.classList.toggle('active', p.id === `tab-${tool}`);
    });

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

    // Synchronize UI for specific tabs
    if (tool === 'emoji') {
      this.syncEmojiUI();
    } else if (tool === 'shapes') {
      this.syncShapeUI();
    } else if (tool === 'handle') {
      if (this.syncHandleUI) this.syncHandleUI();
    } else if (tool === 'audio') {
      if (this.syncAudioUI) this.syncAudioUI();
    } else if (tool === 'text') {
      if (this.textEditor) {
        this.textEditor.loadSelectedElement(State.selectedElementId);
      }
    }
  }

  initLeftTools() {
    const toolButtons = document.querySelectorAll('.sidebar-nav-btn');
    const drawer = document.getElementById('tool-panels-drawer');
    const backdrop = document.getElementById('tool-drawer-backdrop');
    const closeBtn = document.getElementById('btn-close-tool-drawer');

    toolButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        if (tool === 'templates') {
          this.closeMobileDrawer();
          this.openTemplatesModal();
          return;
        }

        const isAlreadyActive = btn.classList.contains('active') && drawer && drawer.classList.contains('mobile-open');
        if (isAlreadyActive && window.innerWidth <= 768) {
          this.closeMobileDrawer();
          return;
        }

        this.openToolTab(tool);
      });
    });

    if (closeBtn) closeBtn.addEventListener('click', () => this.closeMobileDrawer());
    if (backdrop) backdrop.addEventListener('click', () => this.closeMobileDrawer());

    const dragPill = document.querySelector('.drawer-drag-pill');
    if (dragPill) dragPill.addEventListener('click', () => this.closeMobileDrawer());
  }

  setupLayerSelectionSync() {
    // Whenever any element/track is selected, auto-open the corresponding tool panel
    State.on('selectionChange', (id) => {
      if (!id) return;

      if (id === 'audio') {
        this.openToolTab('audio');
      } else if (id === 'socialHandle') {
        this.openToolTab('handle');
      } else {
        const elem = State.project.elements.find(e => e.id === id);
        if (!elem) return;

        if (elem.type === 'text') {
          this.openToolTab('text');
        } else if (elem.type === 'emoji') {
          this.openToolTab('emoji');
          this.syncEmojiUI(elem);
        } else if (elem.type === 'shape') {
          this.openToolTab('shapes');
          this.syncShapeUI(elem);
        }
      }
    });

    // When project elements are modified, keep the active top panel in sync and auto-hide empty cards
    State.on('projectChange', () => {
      this.syncEmojiUI();
      this.syncShapeUI();
      if (this.syncAudioUI) this.syncAudioUI();
    });
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
      State.selectElement(newEmojiElem.id);
      this.syncEmojiUI(newEmojiElem);
      Utils.showToast(`Emoji ${emoji} added`, 'success');
    });

    // Top Selected Emoji Size slider
    const slider = document.getElementById('input-emoji-size');
    const valBadge = document.getElementById('val-emoji-size');
    if (slider) {
      slider.addEventListener('input', (e) => {
        const sz = parseInt(e.target.value, 10);
        if (valBadge) valBadge.textContent = `${sz}px`;
        const selected = State.getSelectedElement();
        if (selected && selected.type === 'emoji') {
          State.updateElement(selected.id, { size: sz });
        } else {
          const firstEmoji = State.project.elements.find(el => el.type === 'emoji');
          if (firstEmoji) {
            State.selectElement(firstEmoji.id);
            State.updateElement(firstEmoji.id, { size: sz });
          }
        }
      });
    }

    // Top Delete Emoji Layer button (exclusive to emoji & shapes)
    const deleteBtn = document.getElementById('btn-delete-emoji-layer');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        let selected = State.getSelectedElement();
        if (!selected || selected.type !== 'emoji') {
          selected = State.project.elements.find(e => e.type === 'emoji');
        }
        if (selected && selected.type === 'emoji') {
          const emojiIcon = selected.emoji || 'Emoji';
          State.removeElement(selected.id);
          Utils.showToast(`${emojiIcon} layer deleted`, 'info');
          this.syncEmojiUI();
        }
      });
    }

    this.syncEmojiUI();
  }

  syncEmojiUI(elem = null) {
    const card = document.getElementById('selected-emoji-card');
    if (!card) return;

    const emojiElems = State.project.elements.filter(e => e.type === 'emoji');
    if (emojiElems.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';

    if (!elem || elem.type !== 'emoji') {
      const selected = State.getSelectedElement();
      if (selected && selected.type === 'emoji') {
        elem = selected;
      } else {
        elem = emojiElems[0];
      }
    }

    const preview = document.getElementById('preview-selected-emoji');
    const slider = document.getElementById('input-emoji-size');
    const valBadge = document.getElementById('val-emoji-size');
    const deleteBtn = document.getElementById('btn-delete-emoji-layer');

    card.style.opacity = '1.0';
    card.style.pointerEvents = 'auto';
    if (preview) preview.textContent = elem.emoji || '✨';
    const sz = elem.size || 64;
    if (slider) slider.value = sz;
    if (valBadge) valBadge.textContent = `${sz}px`;
    if (deleteBtn) deleteBtn.disabled = false;
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
      State.selectElement(newShapeElem.id);
      this.syncShapeUI(newShapeElem);
      Utils.showToast(`Decorative ${shapeId} added`, 'success');
    });

    // Top Shape Color & Size controls
    const colorInput = document.getElementById('input-shape-color');
    const colorVal = document.getElementById('val-shape-color');
    const sizeInput = document.getElementById('input-shape-size');
    const sizeVal = document.getElementById('val-shape-size');
    const deleteBtn = document.getElementById('btn-delete-shape-layer');

    if (colorInput) {
      colorInput.addEventListener('input', (e) => {
        const col = e.target.value;
        if (colorVal) colorVal.textContent = col.toUpperCase();
        const selected = State.getSelectedElement();
        if (selected && selected.type === 'shape') {
          State.updateElement(selected.id, { color: col });
        } else {
          const firstShape = State.project.elements.find(el => el.type === 'shape');
          if (firstShape) {
            State.selectElement(firstShape.id);
            State.updateElement(firstShape.id, { color: col });
          }
        }
      });
    }

    if (sizeInput) {
      sizeInput.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (sizeVal) sizeVal.textContent = `${val}px`;
        const selected = State.getSelectedElement();
        if (selected && selected.type === 'shape') {
          State.updateElement(selected.id, { width: val, height: val });
        } else {
          const firstShape = State.project.elements.find(el => el.type === 'shape');
          if (firstShape) {
            State.selectElement(firstShape.id);
            State.updateElement(firstShape.id, { width: val, height: val });
          }
        }
      });
    }

    // Top Delete Shape Layer button (exclusive to emoji & shapes)
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        let selected = State.getSelectedElement();
        if (!selected || selected.type !== 'shape') {
          selected = State.project.elements.find(e => e.type === 'shape');
        }
        if (selected && selected.type === 'shape') {
          State.removeElement(selected.id);
          Utils.showToast('Decoration layer deleted', 'info');
          this.syncShapeUI();
        }
      });
    }

    this.syncShapeUI();
  }

  syncShapeUI(elem = null) {
    const card = document.getElementById('selected-shape-card');
    if (!card) return;

    const shapeElems = State.project.elements.filter(e => e.type === 'shape');
    if (shapeElems.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';

    if (!elem || elem.type !== 'shape') {
      const selected = State.getSelectedElement();
      if (selected && selected.type === 'shape') {
        elem = selected;
      } else {
        elem = shapeElems[0];
      }
    }

    const label = document.getElementById('label-selected-shape');
    const colorInput = document.getElementById('input-shape-color');
    const colorVal = document.getElementById('val-shape-color');
    const sizeInput = document.getElementById('input-shape-size');
    const sizeVal = document.getElementById('val-shape-size');
    const deleteBtn = document.getElementById('btn-delete-shape-layer');

    card.style.opacity = '1.0';
    card.style.pointerEvents = 'auto';

    const shapePreset = Presets.shapes.find(s => s.id === elem.shape);
    const name = shapePreset ? shapePreset.name : (elem.shape || 'Decoration');
    if (label) label.textContent = name;

    const col = elem.color || '#685B53';
    if (colorInput) colorInput.value = col;
    if (colorVal) colorVal.textContent = col.toUpperCase();

    const sz = elem.width || 60;
    if (sizeInput) sizeInput.value = sz;
    if (sizeVal) sizeVal.textContent = `${sz}px`;

    if (deleteBtn) deleteBtn.disabled = false;
  }

  initHandlePanel() {
    const checkEnable = document.getElementById('check-handle-enable');
    const inputText = document.getElementById('input-handle-text');
    const selectPos = document.getElementById('select-handle-pos');
    const inputColor = document.getElementById('input-handle-color');
    const inputSize = document.getElementById('input-handle-size');
    const checkBadge = document.getElementById('check-handle-badge');

    if (!checkEnable) return;

    this.syncHandleUI = () => {
      const handle = State.project.socialHandle || {};
      checkEnable.checked = !!handle.enabled;
      inputText.value = handle.text || 'ahadul.com';
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

    State.on('projectLoaded', () => this.syncHandleUI());
    this.syncHandleUI();
  }

  initAudioPanel() {
    const checkEnable = document.getElementById('check-audio-enable');
    const selectBundled = document.getElementById('select-bundled-audio');
    const inputFile = document.getElementById('input-audio-file');
    const inputVolume = document.getElementById('input-audio-volume');
    const checkLoop = document.getElementById('check-audio-loop');
    const btnPreview = document.getElementById('btn-preview-audio');

    const importedCard = document.getElementById('imported-audio-card');
    const labelImportedName = document.getElementById('label-imported-audio-name');
    const badgeImportedType = document.getElementById('badge-imported-audio-type');
    const btnRemoveImported = document.getElementById('btn-remove-imported-audio');

    if (!checkEnable) return;

    this.syncAudioUI = () => {
      const audio = State.project.audio || {};
      checkEnable.checked = !!audio.enabled;
      inputVolume.value = audio.volume !== undefined ? audio.volume : 0.85;
      checkLoop.checked = audio.loop !== undefined ? audio.loop : true;

      const isImported = audio.sourceType === 'local' || !!audio.blobId;
      if (importedCard) {
        if (isImported && audio.name) {
          importedCard.style.display = 'block';
          if (labelImportedName) {
            labelImportedName.textContent = audio.name;
          }
          if (badgeImportedType) {
            badgeImportedType.textContent = 'Imported File';
          }
        } else {
          importedCard.style.display = 'none';
        }
      }

      if (!isImported && audio.trackId && selectBundled) {
        selectBundled.value = audio.trackId;
      }
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
      this.syncAudioUI();
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
        this.syncAudioUI();
      }
    });

    const labelImportAudio = document.getElementById('label-import-audio');
    if (labelImportAudio && inputFile) {
      const triggerFilePicker = (e) => {
        if (e.target !== inputFile) {
          e.preventDefault();
          inputFile.click();
        }
      };
      labelImportAudio.addEventListener('click', triggerFilePicker);
      labelImportAudio.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputFile.click();
        }
      });
    }

    inputFile.addEventListener('change', async (e) => {
      try {
        await AudioSys.unlockAudioContext();
        const file = e.target.files && e.target.files[0];
        if (file) {
          await AudioSys.importLocalAudioFile(file);
          this.syncAudioUI();
        }
      } catch (importErr) {
        console.warn('Audio input error:', importErr);
        Utils.showToast(`Import error: ${importErr.message || importErr}`, 'error');
      } finally {
        inputFile.value = '';
      }
    });

    if (btnRemoveImported) {
      btnRemoveImported.addEventListener('click', async () => {
        const bundled = Presets.bundledAudio[0];
        if (bundled) {
          State.updateAudio({
            enabled: true,
            trackId: bundled.id,
            name: bundled.name,
            sourceType: 'bundled',
            sourceUrl: bundled.url,
            blobId: null
          });
          this.syncAudioUI();
          Utils.showToast(`Reverted to bundled music: ${bundled.name}`, 'info');
          try {
            await AudioSys.unlockAudioContext();
            await AudioSys.loadTrack(State.project.audio);
            if (State.isPlaying) {
              AudioSys.playAt(State.currentTime);
            }
          } catch (e) {}
        }
      });
    }

    inputVolume.addEventListener('input', (e) => {
      const vol = parseFloat(e.target.value);
      State.updateAudio({ volume: vol });
      AudioSys.setVolume(vol);
    });

    checkLoop.addEventListener('change', (e) => {
      State.updateAudio({ loop: e.target.checked });
    });

    const unlockPreviewDirect = () => {
      try {
        AudioSys.unlockAudioContext();
        if (AudioSys.ctx && (AudioSys.ctx.state === 'suspended' || AudioSys.ctx.state === 'interrupted')) {
          AudioSys.ctx.resume().catch(() => {});
        }
      } catch (e) {}
    };

    btnPreview.addEventListener('pointerdown', unlockPreviewDirect, { passive: true });

    btnPreview.addEventListener('click', async () => {
      unlockPreviewDirect();
      await AudioSys.unlockAudioContext();
      if (AudioSys.ctx && (AudioSys.ctx.state === 'suspended' || AudioSys.ctx.state === 'interrupted')) {
        await AudioSys.ctx.resume();
      }
      if (AudioSys.isPlaying) {
        AudioSys.stop();
        btnPreview.innerHTML = `<span>▶ Preview Music</span>`;
      } else {
        await AudioSys.playAt(0);
        btnPreview.innerHTML = `<span>⏹ Stop Music</span>`;
      }
    });

    State.on('projectLoaded', () => this.syncAudioUI());
    State.on('audioUpdate', () => this.syncAudioUI());
    this.syncAudioUI();
  }

  initCanvasInteractions() {
    const canvas = this.canvas;

    const getCanvasCoords = (e) => {
      const rect = canvas.getBoundingClientRect();
      let clientX = e.clientX;
      let clientY = e.clientY;

      if (clientX === undefined && e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if (clientX === undefined && e.changedTouches && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
      }

      // Normalization to canvas internal resolution
      const scaleX = rect.width ? canvas.width / rect.width : 1;
      const scaleY = rect.height ? canvas.height / rect.height : 1;

      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    };

    let activePointerId = null;

    const handlePointerDown = (e) => {
      const { x, y } = getCanvasCoords(e);
      const hit = this.renderer.hitTest(x, y, canvas.width, canvas.height);

      if (hit) {
        e.preventDefault(); // Prevent page scrolling during drag
        activePointerId = e.pointerId;
        if (canvas.setPointerCapture && e.pointerId !== undefined) {
          try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
        }

        State.selectElement(hit.id);

        const elem = hit.id === 'socialHandle' ? State.project.socialHandle : State.project.elements.find(el => el.id === hit.id);
        if (!elem) return;

        // Record undo snapshot prior to transformation
        State.pushUndo(`Move / Transform ${hit.id}`);

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
        window.addEventListener('pointercancel', handlePointerUp);
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
        if (elem.positionPreset) {
          elem.positionPreset = 'custom';
        }
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
          elem.size = Math.round(Utils.clamp(drag.origSize * ratio, 24, 180));
          if (this.activeToolTab === 'emoji') this.syncEmojiUI(elem);
        } else if (elem.type === 'shape') {
          const newDim = Math.round(Utils.clamp(drag.origSize * ratio, 20, 300));
          elem.width = newDim;
          elem.height = newDim;
          if (this.activeToolTab === 'shapes') this.syncShapeUI(elem);
        }
      }

      this.renderNeeded = true;
    };

    const handlePointerUp = (e) => {
      if (this.canvasDrag) {
        this.canvasDrag = null;
        State.setSaveStatus('unsaved');
        State.emit('projectChange', { project: State.project });
        State.emit('stateRenderNeeded');
      }
      if (activePointerId !== null && canvas.releasePointerCapture) {
        try { canvas.releasePointerCapture(activePointerId); } catch (err) {}
        activePointerId = null;
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
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
      listContainer.innerHTML = projects.map(p => {
        const safeId = Utils.escapeHtml(p.id);
        const isActive = p.id === State.project.id ? 'active-project' : '';
        return `
        <div class="project-item-row ${isActive}" data-id="${safeId}">
          <div class="project-row-info">
            <span class="project-row-name">${Utils.escapeHtml(p.name || 'Untitled Reel')}</span>
            <span class="project-row-meta">${Utils.escapeHtml(p.aspectRatio)} • ${Number(p.duration) || 15}s • Updated ${new Date(p.updatedAt || Date.now()).toLocaleDateString()}</span>
          </div>
          <div class="project-row-actions">
            <button class="btn btn-sm btn-primary btn-open-p" data-id="${safeId}">Open</button>
            <button class="btn btn-sm btn-secondary btn-dup-p" data-id="${safeId}">Duplicate</button>
            <button class="btn btn-sm btn-danger btn-del-p" data-id="${safeId}">Delete</button>
          </div>
        </div>
      `;
      }).join('');

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
          // Prompt immediate check for latest worker version (ensures iOS Safari / PWA receives updates)
          reg.update().catch(() => {});
        })
        .catch((err) => {
          console.warn('[ServiceWorker] Registration failed:', err);
        });

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }
  }
}

// Instantiate and start when DOM is ready
window.addEventListener('DOMContentLoaded', async () => {
  const app = new ReelApp();
  window.ReelApp = app; // For debugging access
  window.State = State;
  window.Utils = Utils;
  try {
    await app.init();
    console.log('[ReelApp] init completed successfully!');
  } catch (err) {
    console.error('[ReelApp] init ERROR:', err);
  }
});
