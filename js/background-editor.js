/**
 * ReelMaker Background Editor Panel
 * Manages background color presets, multi-color gradients, custom local image uploads,
 * doodle pattern selection, opacity, scale, rotation, and blend modes.
 */

import { Utils } from './utils.js';
import { State } from './state.js';
import { Presets } from './presets.js';

export class BackgroundEditor {
  constructor(panelContainer) {
    this.container = panelContainer;
    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="panel-section-header">
        <h4>Canvas Background</h4>
      </div>

      <div class="panel-body">
        <!-- Quick Preset Swatches -->
        <div class="form-group">
          <label>Background Presets:</label>
          <div class="preset-swatches-grid" id="bg-swatches-grid">
            ${Presets.backgroundPresets.map(preset => {
              const bgStyle = preset.gradient
                ? `background: linear-gradient(135deg, ${preset.gradient[0]}, ${preset.gradient[1]});`
                : `background-color: ${preset.color};`;
              return `
                <button class="bg-swatch-card" data-id="${preset.id}" style="${bgStyle}" title="${preset.name}">
                  <span class="swatch-label">${preset.name}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Background Mode (Color vs Gradient vs Image) -->
        <div class="form-group">
          <label for="input-bg-color">Solid Color:</label>
          <div class="color-picker-wrapper">
            <input type="color" id="input-bg-color" value="#F7F1E5" />
            <span id="bg-color-hex">#F7F1E5</span>
          </div>
        </div>

        <!-- Doodle Pattern Accordion -->
        <details class="control-accordion" open>
          <summary>Doodle Pattern & Texture</summary>
          <div class="accordion-content">
            <div class="form-group">
              <label for="select-pattern">Pattern Overlay:</label>
              <select id="select-pattern" class="form-select">
                ${Presets.patterns.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
              </select>
            </div>

            <div class="form-row">
              <div class="form-group flex-1">
                <label for="input-pattern-opacity">Opacity:</label>
                <input type="range" id="input-pattern-opacity" min="0.05" max="1.0" step="0.05" value="0.35" />
              </div>
              <div class="form-group flex-1">
                <label for="input-pattern-scale">Scale:</label>
                <input type="range" id="input-pattern-scale" min="0.5" max="2.5" step="0.1" value="1.0" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group flex-1">
                <label for="select-pattern-blend">Blend Mode:</label>
                <select id="select-pattern-blend" class="form-select">
                  <option value="multiply" selected>Multiply</option>
                  <option value="source-over">Normal</option>
                  <option value="screen">Screen (Light)</option>
                  <option value="overlay">Overlay</option>
                </select>
              </div>
              <div class="form-group flex-1">
                <label for="input-pattern-rotation">Rotation:</label>
                <input type="range" id="input-pattern-rotation" min="0" max="360" step="5" value="0" />
              </div>
            </div>
          </div>
        </details>

        <!-- Custom Image Background Accordion -->
        <details class="control-accordion">
          <summary>Custom Local Image Background</summary>
          <div class="accordion-content">
            <div class="form-group">
              <label class="file-drop-zone" id="bg-drop-zone">
                <input type="file" id="input-bg-image-file" accept="image/*" style="display:none;" />
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <span>Click to Upload Local Image</span>
              </label>
            </div>

            <div id="image-adjustments-box" style="display: none;">
              <div class="form-row">
                <div class="form-group flex-1">
                  <label for="select-image-fit">Fit:</label>
                  <select id="select-image-fit" class="form-select">
                    <option value="cover" selected>Cover</option>
                    <option value="contain">Contain</option>
                  </select>
                </div>
                <div class="form-group flex-1">
                  <label for="input-image-blur">Blur (px):</label>
                  <input type="range" id="input-image-blur" min="0" max="20" step="1" value="0" />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group flex-1">
                  <label for="input-image-tint">Tint Color:</label>
                  <input type="color" id="input-image-tint" value="#000000" />
                </div>
                <div class="form-group flex-1">
                  <label for="input-image-tint-opacity">Tint Opacity:</label>
                  <input type="range" id="input-image-tint-opacity" min="0" max="0.9" step="0.05" value="0" />
                </div>
              </div>

              <button class="btn btn-sm btn-danger btn-block" id="btn-remove-bg-image">Remove Image</button>
            </div>
          </div>
        </details>
      </div>
    `;

    this.inputBgColor = this.container.querySelector('#input-bg-color');
    this.bgColorHex = this.container.querySelector('#bg-color-hex');
    this.selectPattern = this.container.querySelector('#select-pattern');
    this.inputPatternOpacity = this.container.querySelector('#input-pattern-opacity');
    this.inputPatternScale = this.container.querySelector('#input-pattern-scale');
    this.selectPatternBlend = this.container.querySelector('#select-pattern-blend');
    this.inputPatternRotation = this.container.querySelector('#input-pattern-rotation');

    // Image
    this.inputBgImageFile = this.container.querySelector('#input-bg-image-file');
    this.imageAdjustments = this.container.querySelector('#image-adjustments-box');
    this.selectImageFit = this.container.querySelector('#select-image-fit');
    this.inputImageBlur = this.container.querySelector('#input-image-blur');
    this.inputImageTint = this.container.querySelector('#input-image-tint');
    this.inputImageTintOpacity = this.container.querySelector('#input-image-tint-opacity');
    this.btnRemoveImage = this.container.querySelector('#btn-remove-bg-image');
  }

  bindEvents() {
    // Preset Swatches
    const swatchBtns = this.container.querySelectorAll('.bg-swatch-card');
    swatchBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = Presets.backgroundPresets.find(p => p.id === btn.dataset.id);
        if (!preset) return;

        const updates = {
          type: preset.id,
          color: preset.color || '#F7F1E5',
          pattern: preset.pattern !== undefined ? preset.pattern : 'doodle-hearts',
          patternOpacity: preset.patternOpacity !== undefined ? preset.patternOpacity : 0.35,
          gradient: preset.gradient || null
        };

        State.updateBackground(updates);
        this.syncUI(State.project.background);

        // Also suggest text color if specified in preset
        if (preset.textColor) {
          const firstText = State.project.elements.find(e => e.type === 'text');
          if (firstText) {
            State.updateElement(firstText.id, { color: preset.textColor });
          }
        }
      });
    });

    // Solid Color
    this.inputBgColor.addEventListener('input', (e) => {
      this.bgColorHex.textContent = e.target.value.toUpperCase();
      State.updateBackground({ color: e.target.value, gradient: null });
    });

    // Patterns
    this.selectPattern.addEventListener('change', (e) => {
      State.updateBackground({ pattern: e.target.value });
    });
    this.inputPatternOpacity.addEventListener('input', (e) => {
      State.updateBackground({ patternOpacity: parseFloat(e.target.value) });
    });
    this.inputPatternScale.addEventListener('input', (e) => {
      State.updateBackground({ patternScale: parseFloat(e.target.value) });
    });
    this.selectPatternBlend.addEventListener('change', (e) => {
      State.updateBackground({ patternBlend: e.target.value });
    });
    this.inputPatternRotation.addEventListener('input', (e) => {
      State.updateBackground({ patternRotation: parseInt(e.target.value, 10) });
    });

    // Image Upload
    this.inputBgImageFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) {
        Utils.showToast('Image file too large (max 20MB)', 'error');
        return;
      }
      if (file.type && !file.type.startsWith('image/')) {
        Utils.showToast('Please select a valid image file (PNG, JPG, SVG, etc.)', 'error');
        return;
      }

      const dataUrl = await Utils.readFileAsDataURL(file);
      State.updateBackground({
        imageSrc: dataUrl,
        imageFit: 'cover',
        blur: 0,
        overlayOpacity: 0.2,
        overlayColor: '#000000'
      });
      this.syncUI(State.project.background);
      Utils.showToast('Background image loaded!', 'success');
    });

    // Image Adjustments
    this.selectImageFit.addEventListener('change', (e) => {
      State.updateBackground({ imageFit: e.target.value });
    });
    this.inputImageBlur.addEventListener('input', (e) => {
      State.updateBackground({ blur: parseInt(e.target.value, 10) });
    });
    this.inputImageTint.addEventListener('input', (e) => {
      State.updateBackground({ overlayColor: e.target.value });
    });
    this.inputImageTintOpacity.addEventListener('input', (e) => {
      State.updateBackground({ overlayOpacity: parseFloat(e.target.value) });
    });

    // Remove Image
    this.btnRemoveImage.addEventListener('click', () => {
      State.updateBackground({ imageSrc: null });
      this.syncUI(State.project.background);
      Utils.showToast('Background image removed', 'info');
    });

    // React to state changes
    State.on('projectLoaded', (proj) => this.syncUI(proj.background));
    State.on('backgroundUpdate', (bg) => this.syncUI(bg));

    if (State.project && State.project.background) {
      this.syncUI(State.project.background);
    }
  }

  syncUI(bg) {
    if (!bg) return;
    this.inputBgColor.value = bg.color || '#F7F1E5';
    this.bgColorHex.textContent = (bg.color || '#F7F1E5').toUpperCase();
    this.selectPattern.value = bg.pattern || 'none';
    this.inputPatternOpacity.value = bg.patternOpacity !== undefined ? bg.patternOpacity : 0.35;
    this.inputPatternScale.value = bg.patternScale !== undefined ? bg.patternScale : 1.0;
    this.selectPatternBlend.value = bg.patternBlend || 'multiply';
    this.inputPatternRotation.value = bg.patternRotation || 0;

    // Image view
    if (bg.imageSrc) {
      this.imageAdjustments.style.display = 'block';
      this.selectImageFit.value = bg.imageFit || 'cover';
      this.inputImageBlur.value = bg.blur || 0;
      this.inputImageTint.value = bg.overlayColor || '#000000';
      this.inputImageTintOpacity.value = bg.overlayOpacity || 0;
    } else {
      this.imageAdjustments.style.display = 'none';
    }
  }
}
