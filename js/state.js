/**
 * ReelMaker State Manager
 * Centralized reactive store with Undo/Redo history, event emitters, and element manipulation.
 */

import { Utils } from './utils.js';
import { Presets } from './presets.js';

class StateManager {
  constructor() {
    this.project = null;
    this.selectedElementId = null; // id of selected element, 'background', 'socialHandle', or null
    this.currentTime = 0;
    this.isPlaying = false;
    this.showSafeArea = true;
    this.zoomScale = 'fit';
    this.saveStatus = 'saved'; // 'saved' | 'saving' | 'unsaved'

    // Undo / Redo stacks
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 40;
    this._isPerformingUndoRedo = false;
    this._lastDebouncedAction = null;

    // Listeners
    this.listeners = new Map();

    // Initialize with default template
    this.initDefaultProject();
  }

  generateDefaultProjectName() {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `Reel ${randomNum} by Rmaker`;
  }

  initDefaultProject() {
    const defaultTemplate = Presets.templates[0]; // Cream Doodle Reel
    this.project = {
      id: Utils.generateId('proj'),
      name: this.generateDefaultProjectName(),
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      aspectRatio: defaultTemplate.aspectRatio || '9:16',
      width: Presets.aspectRatios[defaultTemplate.aspectRatio || '9:16'].width,
      height: Presets.aspectRatios[defaultTemplate.aspectRatio || '9:16'].height,
      duration: defaultTemplate.duration || 15,
      frameRate: 30,
      resolution: '1080p',
      background: Utils.deepClone(defaultTemplate.background),
      elements: Utils.deepClone(defaultTemplate.elements),
      socialHandle: Utils.deepClone(defaultTemplate.socialHandle),
      audio: Utils.deepClone(defaultTemplate.audio)
    };

    this.undoStack = [];
    this.redoStack = [];
    this.saveStatus = 'saved';
  }

  // Event Subscription System
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.listeners.get(event).delete(callback);
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      for (const cb of this.listeners.get(event)) {
        try {
          cb(data);
        } catch (e) {
          console.error(`Error in event listener for ${event}:`, e);
        }
      }
    }
  }

  // Undo / Redo Management
  pushUndo(actionDescription = 'Edit') {
    if (this._isPerformingUndoRedo) return;

    // Snapshot current project
    const snapshot = Utils.deepClone(this.project);
    this.undoStack.push({ snapshot, description: actionDescription });

    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }

    this.redoStack = []; // Clear redo stack on new edit
    this.setSaveStatus('unsaved');
    this.emit('historyChange', { canUndo: this.canUndo(), canRedo: this.canRedo() });
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    if (!this.canUndo()) return;
    this._isPerformingUndoRedo = true;

    const currentSnapshot = Utils.deepClone(this.project);
    this.redoStack.push({ snapshot: currentSnapshot });

    const previous = this.undoStack.pop();
    this.project = Utils.deepClone(previous.snapshot);

    this._isPerformingUndoRedo = false;
    this.emit('projectChange', { project: this.project, type: 'undo' });
    this.emit('historyChange', { canUndo: this.canUndo(), canRedo: this.canRedo() });
    this.emit('stateRenderNeeded');
  }

  redo() {
    if (!this.canRedo()) return;
    this._isPerformingUndoRedo = true;

    const currentSnapshot = Utils.deepClone(this.project);
    this.undoStack.push({ snapshot: currentSnapshot });

    const next = this.redoStack.pop();
    this.project = Utils.deepClone(next.snapshot);

    this._isPerformingUndoRedo = false;
    this.emit('projectChange', { project: this.project, type: 'redo' });
    this.emit('historyChange', { canUndo: this.canUndo(), canRedo: this.canRedo() });
    this.emit('stateRenderNeeded');
  }

  setSaveStatus(status) {
    if (this.saveStatus !== status) {
      this.saveStatus = status;
      this.emit('saveStatusChange', status);
    }
  }

  // Project Mutations
  setProjectName(name) {
    if (!name || name === this.project.name) return;
    this.pushUndo('Rename project');
    this.project.name = name;
    this.project.updatedAt = Date.now();
    this.emit('projectChange', { project: this.project, type: 'rename' });
  }

  setAspectRatio(ratio) {
    if (!Presets.aspectRatios[ratio] || this.project.aspectRatio === ratio) return;
    this.pushUndo(`Change aspect ratio to ${ratio}`);
    this.project.aspectRatio = ratio;
    this.project.width = Presets.aspectRatios[ratio].width;
    this.project.height = Presets.aspectRatios[ratio].height;
    this.project.updatedAt = Date.now();
    this.emit('aspectRatioChange', ratio);
    this.emit('projectChange', { project: this.project, type: 'aspectRatio' });
    this.emit('stateRenderNeeded');
  }

  setDuration(duration) {
    const clamped = Utils.clamp(Number(duration), 1, 180);
    if (clamped === this.project.duration) return;
    this.pushUndo(`Change duration to ${clamped}s`);
    this.project.duration = clamped;

    // Adjust elements if their end time exceeds the new duration
    for (const elem of this.project.elements) {
      if (elem.endTime > clamped) {
        elem.endTime = clamped;
        if (elem.startTime >= clamped) {
          elem.startTime = Math.max(0, clamped - 2);
        }
      }
    }

    if (this.project.socialHandle && this.project.socialHandle.endTime > clamped) {
      this.project.socialHandle.endTime = clamped;
    }

    if (this.currentTime > clamped) {
      this.setTime(clamped);
    }

    this.project.updatedAt = Date.now();
    this.emit('durationChange', clamped);
    this.emit('projectChange', { project: this.project, type: 'duration' });
    this.emit('stateRenderNeeded');
  }

  setTime(time, notifyAudio = true) {
    const clamped = Utils.clamp(time, 0, this.project.duration);
    if (Math.abs(this.currentTime - clamped) > 0.001) {
      this.currentTime = clamped;
      this.emit('timeChange', { time: this.currentTime, notifyAudio });
      this.emit('stateRenderNeeded');
    }
  }

  setIsPlaying(playing) {
    if (this.isPlaying !== playing) {
      this.isPlaying = playing;
      this.emit('playbackChange', this.isPlaying);
    }
  }

  togglePlay() {
    this.setIsPlaying(!this.isPlaying);
  }

  // Selection
  selectElement(id) {
    this.selectedElementId = id;
    this.emit('selectionChange', this.selectedElementId);
    this.emit('stateRenderNeeded');
  }

  getSelectedElement() {
    if (!this.selectedElementId) return null;
    if (this.selectedElementId === 'socialHandle') {
      return this.project.socialHandle;
    }
    return this.project.elements.find(e => e.id === this.selectedElementId) || null;
  }

  // Element Actions
  addElement(element, recordUndo = true) {
    if (recordUndo) this.pushUndo(`Add ${element.type}`);
    this.project.elements.push(element);
    this.project.updatedAt = Date.now();
    this.selectElement(element.id);
    this.emit('projectChange', { project: this.project, type: 'addElement', element });
    this.emit('stateRenderNeeded');
  }

  updateElement(id, partialUpdates, recordUndo = true) {
    const elem = this.project.elements.find(e => e.id === id);
    if (!elem) return;

    if (recordUndo) {
      this.pushUndo(`Update ${elem.type}`);
    }

    Object.assign(elem, partialUpdates);
    this.project.updatedAt = Date.now();
    this.emit('elementUpdate', { id, element: elem, partial: partialUpdates });
    this.emit('projectChange', { project: this.project, type: 'updateElement', element: elem });
    this.emit('stateRenderNeeded');
  }

  removeElement(id) {
    const index = this.project.elements.findIndex(e => e.id === id);
    if (index === -1) return;

    const removed = this.project.elements[index];
    this.pushUndo(`Delete ${removed.type}`);
    this.project.elements.splice(index, 1);

    if (this.selectedElementId === id) {
      this.selectElement(null);
    }

    this.project.updatedAt = Date.now();
    this.emit('projectChange', { project: this.project, type: 'removeElement', id });
    this.emit('stateRenderNeeded');
  }

  duplicateElement(id) {
    const elem = this.project.elements.find(e => e.id === id);
    if (!elem) return;

    this.pushUndo(`Duplicate ${elem.type}`);
    const clone = Utils.deepClone(elem);
    clone.id = Utils.generateId(elem.type);
    // Slight offset so user can see it
    clone.x = Utils.clamp(clone.x + 0.04, 0.1, 0.9);
    clone.y = Utils.clamp(clone.y + 0.04, 0.1, 0.9);

    this.project.elements.push(clone);
    this.project.updatedAt = Date.now();
    this.selectElement(clone.id);
    this.emit('projectChange', { project: this.project, type: 'duplicateElement', element: clone });
    this.emit('stateRenderNeeded');
  }

  updateBackground(partialUpdates, recordUndo = true) {
    if (recordUndo) this.pushUndo('Update Background');
    Object.assign(this.project.background, partialUpdates);
    this.project.updatedAt = Date.now();
    this.emit('backgroundUpdate', this.project.background);
    this.emit('projectChange', { project: this.project, type: 'updateBackground' });
    this.emit('stateRenderNeeded');
  }

  updateSocialHandle(partialUpdates, recordUndo = true) {
    if (recordUndo) this.pushUndo('Update Social Handle');
    Object.assign(this.project.socialHandle, partialUpdates);
    this.project.updatedAt = Date.now();
    this.emit('socialHandleUpdate', this.project.socialHandle);
    this.emit('projectChange', { project: this.project, type: 'updateSocialHandle' });
    this.emit('stateRenderNeeded');
  }

  updateAudio(partialUpdates, recordUndo = true) {
    if (recordUndo) this.pushUndo('Update Audio');
    Object.assign(this.project.audio, partialUpdates);
    this.project.updatedAt = Date.now();
    this.emit('audioUpdate', this.project.audio);
    this.emit('projectChange', { project: this.project, type: 'updateAudio' });
    this.emit('stateRenderNeeded');
  }

  loadProject(projectData) {
    this.project = Utils.deepClone(projectData);
    if (this.project && this.project.socialHandle && (this.project.socialHandle.text === '@yourname' || this.project.socialHandle.text === '@yourhandle' || this.project.socialHandle.text === '@ahadul.com' || this.project.socialHandle.text.startsWith('@'))) {
      this.project.socialHandle.text = 'ahadul.com';
    }
    this.selectedElementId = null;
    this.currentTime = 0;
    this.isPlaying = false;
    this.undoStack = [];
    this.redoStack = [];
    this.saveStatus = 'saved';

    this.emit('projectLoaded', this.project);
    this.emit('projectChange', { project: this.project, type: 'load' });
    this.emit('historyChange', { canUndo: false, canRedo: false });
    this.emit('stateRenderNeeded');
  }

  applyTemplate(templateId) {
    const template = Presets.templates.find(t => t.id === templateId) || Presets.templates[0];
    this.pushUndo(`Apply Template: ${template.title}`);

    this.project.name = template.title || 'Reel Project';
    this.project.aspectRatio = template.aspectRatio || '9:16';
    this.project.width = Presets.aspectRatios[this.project.aspectRatio].width;
    this.project.height = Presets.aspectRatios[this.project.aspectRatio].height;
    this.project.duration = template.duration || 15;
    this.project.background = Utils.deepClone(template.background);
    this.project.elements = Utils.deepClone(template.elements);
    this.project.socialHandle = Utils.deepClone(template.socialHandle);
    if (this.project.socialHandle) {
      this.project.socialHandle.text = 'ahadul.com';
    }
    this.project.audio = Utils.deepClone(template.audio);
    this.project.updatedAt = Date.now();

    this.currentTime = 0;
    this.selectElement(null);
    this.emit('durationChange', this.project.duration);
    this.emit('projectLoaded', this.project);
    this.emit('projectChange', { project: this.project, type: 'template' });
    this.emit('stateRenderNeeded');
  }
}

export const State = new StateManager();
