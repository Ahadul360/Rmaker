/**
 * ReelMaker IndexedDB Project Storage
 * Handles robust offline persistence for project metadata, binary blobs (audio/images),
 * autosave debouncing, and project file import/export.
 */

import { Utils } from './utils.js';
import { State } from './state.js';

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
   * Imports and validates project file
   */
  async importProjectFile(file) {
    if (!file) throw new Error('No file selected');
    if (file.size > 10 * 1024 * 1024) throw new Error('Project file too large (max 10MB)');
    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error('Invalid JSON file format');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.elements) || !parsed.aspectRatio) {
      throw new Error('Invalid ReelMaker project file schema');
    }

    // Prototype pollution prevention
    delete parsed.__proto__;
    delete parsed.constructor;
    delete parsed.prototype;

    // Refresh ID so it doesn't overwrite if re-imported
    parsed.id = Utils.generateId('proj_import');
    parsed.updatedAt = Date.now();
    parsed.name = `${String(parsed.name || 'Imported Project').slice(0, 80)} (Copy)`;

    await this.saveProject(parsed);
    State.loadProject(parsed);
    Utils.showToast('Project imported successfully!', 'success');
    return parsed;
  }
}

export const Storage = new ProjectStorage();
