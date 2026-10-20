/**
 * ReelMaker IndexedDB Project Storage
 * Handles robust offline persistence for project metadata, binary blobs (audio/images),
 * autosave debouncing, and project file import/export.
 */

import { Utils } from './utils.js';
import { State } from './state.js';
import { Presets } from './presets.js';

class ProjectStorage {
  constructor() {
    this.dbName = 'ReelMakerDB';
    this.dbVersion = 1;
    this.db = null;
    this.isInitialized = false;

    // Debounced autosave
    this.debouncedSave = Utils.debounce(() => this.autosave(), 1500);
  }

  async init() {
    if (this.isInitialized && this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('projects')) {
          const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
          projectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs', { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        this.isInitialized = true;
        this.setupAutosave();
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB open error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  setupAutosave() {
    State.on('projectChange', () => {
      State.setSaveStatus('unsaved');
      this.debouncedSave();
    });
  }

  async autosave() {
    if (!this.db || !State.project) return;
    try {
      State.setSaveStatus('saving');
      await this.saveProject(State.project);
      State.setSaveStatus('saved');
    } catch (err) {
      console.warn('Autosave failed:', err);
      State.setSaveStatus('unsaved');
    }
  }

  async saveProject(project) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['projects'], 'readwrite');
      const store = tx.objectStore('projects');
      const projectCopy = Utils.deepClone(project);
      projectCopy.updatedAt = Date.now();

      const request = store.put(projectCopy);
      request.onsuccess = () => resolve(projectCopy);
      request.onerror = () => reject(request.error);
    });
  }

  async getProject(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['projects'], 'readonly');
      const store = tx.objectStore('projects');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllProjects() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['projects'], 'readonly');
      const store = tx.objectStore('projects');
      const index = store.index('updatedAt');
      const request = index.getAll();

      request.onsuccess = () => {
        const results = request.result || [];
        // Sort newest first
        results.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteProject(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['projects'], 'readwrite');
      const store = tx.objectStore('projects');
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async saveBlob(id, blobData) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['blobs'], 'readwrite');
      const store = tx.objectStore('blobs');
      const request = store.put({ id, data: blobData, timestamp: Date.now() });
      request.onsuccess = () => resolve(id);
      request.onerror = () => reject(request.error);
    });
  }

  async getBlob(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['blobs'], 'readonly');
      const store = tx.objectStore('blobs');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result ? request.result.data : null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Exports portable project file (.json)
   */
  exportProjectFile(project) {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(project, null, 2));
    const downloadAnchor = document.createElement('a');
    const safeName = (project.name || 'reel-project').replace(/[^a-z0-9_\-\u0980-\u09FF]/gi, '_');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${safeName}.reel.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    Utils.showToast('Project file exported successfully!', 'success');
  }

  /**
   * Deeply sanitizes an object to eliminate prototype pollution vectors.
   */
  sanitizeDeep(obj, depth = 0) {
    if (depth > 20 || !obj || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeDeep(item, depth + 1));
    }
    const safeObj = {};
    for (const key of Object.keys(obj)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }
      safeObj[key] = this.sanitizeDeep(obj[key], depth + 1);
    }
    return safeObj;
  }

  /**
   * Validates and sanitizes a parsed project object to guarantee structural and security integrity.
   */
  validateAndSanitizeProject(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Project must be a valid JSON object');
    }

    const clean = this.sanitizeDeep(raw);

    // Validate aspect ratio
    const validRatios = ['9:16', '1:1', '4:5'];
    const aspectRatio = validRatios.includes(clean.aspectRatio) ? clean.aspectRatio : '9:16';

    // Validate duration
    let duration = Number(clean.duration);
    if (!Number.isFinite(duration) || duration < 1 || duration > 180) {
      duration = 15;
    }

    // Validate elements
    const validElements = [];
    if (Array.isArray(clean.elements)) {
      for (const elem of clean.elements) {
        if (!elem || typeof elem !== 'object') continue;
        const validTypes = ['text', 'emoji', 'shape', 'socialHandle'];
        if (!validTypes.includes(elem.type)) continue;

        // Clean & sanitize ID
        const safeId = typeof elem.id === 'string' && /^[a-zA-Z0-9_\-]+$/.test(elem.id)
          ? elem.id
          : Utils.generateId(elem.type);

        const safeElem = {
          id: safeId,
          type: elem.type,
          startTime: Utils.clamp(Number.isFinite(Number(elem.startTime)) ? Number(elem.startTime) : 0, 0, duration),
          endTime: Utils.clamp(Number.isFinite(Number(elem.endTime)) ? Number(elem.endTime) : duration, 0.1, duration),
          x: Utils.clamp(Number.isFinite(Number(elem.x)) ? Number(elem.x) : 0.5, -1, 2),
          y: Utils.clamp(Number.isFinite(Number(elem.y)) ? Number(elem.y) : 0.5, -1, 2),
          scale: Utils.clamp(Number.isFinite(Number(elem.scale)) ? Number(elem.scale) : 1, 0.1, 10),
          rotation: Number.isFinite(Number(elem.rotation)) ? Number(elem.rotation) % 360 : 0,
          opacity: Utils.clamp(Number.isFinite(Number(elem.opacity)) ? Number(elem.opacity) : 1, 0, 1),
          animation: typeof elem.animation === 'string' ? elem.animation.slice(0, 50) : 'none',
          animationDuration: Utils.clamp(Number.isFinite(Number(elem.animationDuration)) ? Number(elem.animationDuration) : 0.8, 0.1, 5)
        };

        if (elem.type === 'text') {
          safeElem.text = String(elem.text || '').slice(0, 5000);
          safeElem.fontSize = Utils.clamp(Number(elem.fontSize) || 48, 8, 200);
          safeElem.fontFamily = String(elem.fontFamily || 'Hind Siliguri').slice(0, 80);
          safeElem.fontWeight = String(elem.fontWeight || 'normal').slice(0, 20);
          safeElem.fontStyle = String(elem.fontStyle || 'normal').slice(0, 20);
          safeElem.color = String(elem.color || '#2D2926').slice(0, 30);
          safeElem.textAlign = ['left', 'center', 'right'].includes(elem.textAlign || elem.align) ? (elem.textAlign || elem.align) : 'center';
          safeElem.lineHeight = Utils.clamp(Number(elem.lineHeight) || 1.45, 0.8, 3.0);
          safeElem.letterSpacing = Utils.clamp(Number(elem.letterSpacing) || 0, -5, 20);
          safeElem.width = Utils.clamp(Number.isFinite(Number(elem.width)) ? Number(elem.width) : 0.82, 0.1, 1.0);
          
          if (elem.shadow && typeof elem.shadow === 'object') {
            safeElem.shadow = {
              color: String(elem.shadow.color || 'rgba(0,0,0,0.1)').slice(0, 40),
              blur: Utils.clamp(Number(elem.shadow.blur) || 0, 0, 50),
              offsetX: Utils.clamp(Number(elem.shadow.offsetX) || 0, -50, 50),
              offsetY: Utils.clamp(Number(elem.shadow.offsetY) || 0, -50, 50)
            };
          } else {
            safeElem.shadow = { color: 'rgba(0,0,0,0)', blur: 0, offsetX: 0, offsetY: 0 };
          }

          if (elem.stroke && typeof elem.stroke === 'object') {
            safeElem.stroke = {
              color: String(elem.stroke.color || '#ffffff').slice(0, 30),
              width: Utils.clamp(Number(elem.stroke.width) || 0, 0, 30)
            };
          } else {
            safeElem.stroke = { color: '#ffffff', width: 0 };
          }

          const badge = elem.backgroundBadge || {};
          safeElem.backgroundBadge = {
            enabled: !!badge.enabled,
            color: String(badge.color || 'rgba(255,255,255,0.7)').slice(0, 40),
            padding: Utils.clamp(Number(badge.padding) || 14, 0, 60),
            borderRadius: Utils.clamp(Number(badge.borderRadius) || 12, 0, 60)
          };
        } else if (elem.type === 'emoji') {
          safeElem.emoji = String(elem.emoji || '✨').slice(0, 10);
          safeElem.size = Utils.clamp(Number(elem.size) || 64, 16, 300);
        } else if (elem.type === 'shape') {
          safeElem.shape = String(elem.shape || 'quoteMarks').slice(0, 50);
          safeElem.width = Utils.clamp(Number(elem.width || elem.size) || 50, 10, 500);
          safeElem.height = Utils.clamp(Number(elem.height || elem.size) || 50, 10, 500);
          safeElem.color = String(elem.color || '#685B53').slice(0, 30);
          safeElem.opacity = Utils.clamp(Number.isFinite(Number(elem.opacity)) ? Number(elem.opacity) : 0.8, 0, 1);
        }

        validElements.push(safeElem);
      }
    }

    // Sanitize background
    const bg = clean.background && typeof clean.background === 'object' ? clean.background : {};
    let safeImageSrc = null;
    if (typeof bg.imageSrc === 'string') {
      if (bg.imageSrc.startsWith('data:image/') || bg.imageSrc.startsWith('blob:') || bg.imageSrc.startsWith('./assets/') || bg.imageSrc.startsWith('assets/')) {
        safeImageSrc = bg.imageSrc;
      }
    }

    const safeBg = {
      type: typeof bg.type === 'string' ? bg.type.slice(0, 50) : 'cream-paper',
      color: typeof bg.color === 'string' ? bg.color.slice(0, 30) : '#F7F1E5',
      gradient: Array.isArray(bg.gradient) ? bg.gradient.slice(0, 5).map(c => String(c).slice(0, 30)) : null,
      gradientAngle: Number.isFinite(Number(bg.gradientAngle)) ? Number(bg.gradientAngle) % 360 : 135,
      pattern: typeof bg.pattern === 'string' ? bg.pattern.slice(0, 60) : 'none',
      patternColor: typeof bg.patternColor === 'string' ? bg.patternColor.slice(0, 30) : '#685B53',
      patternOpacity: Utils.clamp(Number.isFinite(Number(bg.patternOpacity)) ? Number(bg.patternOpacity) : 0.35, 0, 1),
      patternScale: Utils.clamp(Number.isFinite(Number(bg.patternScale)) ? Number(bg.patternScale) : 1.0, 0.2, 5),
      patternBlend: typeof bg.patternBlend === 'string' ? bg.patternBlend.slice(0, 30) : 'multiply',
      patternRotation: Number.isFinite(Number(bg.patternRotation)) ? Number(bg.patternRotation) % 360 : 0,
      imageSrc: safeImageSrc,
      imageFit: ['cover', 'contain'].includes(bg.imageFit) ? bg.imageFit : 'cover',
      blur: Utils.clamp(Number.isFinite(Number(bg.blur)) ? Number(bg.blur) : 0, 0, 50),
      overlayOpacity: Utils.clamp(Number.isFinite(Number(bg.overlayOpacity)) ? Number(bg.overlayOpacity) : 0, 0, 1),
      overlayColor: typeof bg.overlayColor === 'string' ? bg.overlayColor.slice(0, 30) : '#000000'
    };

    // Sanitize audio
    const audio = clean.audio && typeof clean.audio === 'object' ? clean.audio : {};
    let safeAudioUrl = null;
    if (typeof audio.sourceUrl === 'string') {
      if (audio.sourceUrl.startsWith('assets/music/') || audio.sourceUrl.startsWith('./assets/music/')) {
        safeAudioUrl = audio.sourceUrl;
      }
    }

    const safeAudio = {
      enabled: !!audio.enabled,
      trackId: typeof audio.trackId === 'string' ? audio.trackId.slice(0, 60) : 'lofi-peace',
      name: typeof audio.name === 'string' ? audio.name.slice(0, 80) : 'Audio Track',
      sourceType: audio.sourceType === 'local' ? 'local' : 'bundled',
      sourceUrl: safeAudioUrl,
      blobId: typeof audio.blobId === 'string' ? audio.blobId.slice(0, 60) : null,
      volume: Utils.clamp(Number.isFinite(Number(audio.volume)) ? Number(audio.volume) : 0.85, 0, 1),
      muted: !!audio.muted,
      trimStart: Utils.clamp(Number.isFinite(Number(audio.trimStart)) ? Number(audio.trimStart) : 0, 0, duration),
      trimEnd: Utils.clamp(Number.isFinite(Number(audio.trimEnd)) ? Number(audio.trimEnd) : duration, 0.1, duration),
      loop: audio.loop !== undefined ? !!audio.loop : true
    };

    // Sanitize social handle
    const social = clean.socialHandle && typeof clean.socialHandle === 'object' ? clean.socialHandle : {};
    const safeSocial = {
      enabled: !!social.enabled,
      text: typeof (social.text || social.handle) === 'string' ? String(social.text || social.handle).slice(0, 60) : 'ahadul.com',
      platform: ['tiktok', 'instagram', 'facebook', 'youtube', 'none', 'generic'].includes(social.platform) ? social.platform : 'tiktok',
      positionPreset: ['bottom-center', 'bottom-left', 'bottom-right'].includes(social.positionPreset) ? social.positionPreset : 'bottom-center',
      x: Utils.clamp(Number.isFinite(Number(social.x)) ? Number(social.x) : 0.5, 0, 1),
      y: Utils.clamp(Number.isFinite(Number(social.y)) ? Number(social.y) : 0.88, 0, 1),
      fontFamily: String(social.fontFamily || 'Outfit').slice(0, 50),
      fontSize: Utils.clamp(Number(social.fontSize) || 26, 10, 60),
      color: typeof social.color === 'string' ? social.color.slice(0, 30) : '#685B53',
      backgroundBadge: {
        enabled: !!(social.backgroundBadge && social.backgroundBadge.enabled),
        color: String((social.backgroundBadge && social.backgroundBadge.color) || 'rgba(255, 255, 255, 0.65)').slice(0, 40),
        padding: Utils.clamp(Number(social.backgroundBadge && social.backgroundBadge.padding) || 10, 0, 40),
        borderRadius: Utils.clamp(Number(social.backgroundBadge && social.backgroundBadge.borderRadius) || 20, 0, 40)
      },
      opacity: Utils.clamp(Number.isFinite(Number(social.opacity)) ? Number(social.opacity) : 0.85, 0, 1),
      startTime: 0,
      endTime: duration,
      alwaysVisible: true
    };

    const width = Presets.aspectRatios[aspectRatio]?.width || 1080;
    const height = Presets.aspectRatios[aspectRatio]?.height || 1920;

    return {
      id: Utils.generateId('proj_import'),
      name: `${String(clean.name || 'Imported Project').slice(0, 80)} (Copy)`,
      aspectRatio,
      width,
      height,
      duration,
      background: safeBg,
      elements: validElements,
      audio: safeAudio,
      socialHandle: safeSocial,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  /**
   * Imports and validates project file
   */
  async importProjectFile(file) {
    if (!file) throw new Error('No file selected');
    if (file.size > 10 * 1024 * 1024) throw new Error('Project file too large (max 10MB)');
    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text, (key, value) => {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          return undefined;
        }
        return value;
      });
    } catch (e) {
      throw new Error('Invalid JSON file format');
    }

    const validatedProject = this.validateAndSanitizeProject(parsed);

    await this.saveProject(validatedProject);
    State.loadProject(validatedProject);
    Utils.showToast('Project imported successfully!', 'success');
    return validatedProject;
  }
}

export const Storage = (typeof window !== 'undefined' && window.StorageInstance) ? window.StorageInstance : new ProjectStorage();
if (typeof window !== 'undefined') {
  window.StorageInstance = Storage;
}
