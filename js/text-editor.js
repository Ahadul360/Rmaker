/**
 * ReelMaker Text Editor Panel
 * Manages typography properties, Bengali font selection, quick quotes, shadows,
 * strokes, background badges, and typewriter animation configurations.
 */

import { Utils } from './utils.js';
import { State } from './state.js';
import { Presets } from './presets.js';

export class TextEditor {
  constructor(panelContainer) {
    this.container = panelContainer;
    this.activeElement = null;
    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="panel-section-header">
        <h4>Typography & Text</h4>
        <div class="header-actions">
          <button id="btn-add-text" class="btn btn-sm btn-primary" title="Add Text Layer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>Add Text</span>
          </button>
        </div>
      </div>

      <div id="text-controls" class="panel-body">
        <!-- Quick Bengali Quotes Selector -->
        <div class="form-group">
          <label>Quick Bengali Quotes:</label>
          <select id="select-quick-quote" class="form-select">
            <option value="">-- Choose a Poetic Quote --</option>
            ${Presets.quickBengaliQuotes.map((q, idx) => `
              <option value="${idx}">${q.split('\n')[0]}...</option>
            `).join('')}
          </select>
        </div>

        <!-- Text Content -->
        <div class="form-group">
          <label for="input-text-content">Text Content:</label>
          <textarea id="input-text-content" class="form-textarea" rows="3" placeholder="Type quote or status here..."></textarea>
        </div>

        <!-- Font Family & Size -->
        <div class="form-row">
          <div class="form-group flex-2">
            <label for="select-font-family">Font Family:</label>
            <select id="select-font-family" class="form-select">
              ${Presets.fonts.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group flex-1">
            <label for="input-font-size">Size (px):</label>
            <input type="number" id="input-font-size" class="form-input" min="16" max="140" value="52" />
          </div>
        </div>

        <!-- Alignment & Style Buttons -->
        <div class="form-row">
          <div class="form-group flex-1">
            <label>Alignment:</label>
            <div class="btn-group" id="btn-group-align">
              <button class="btn-tool" data-align="left" title="Left">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="15" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>
              </button>
              <button class="btn-tool active" data-align="center" title="Center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="18" y1="14" x2="6" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>
              </button>
              <button class="btn-tool" data-align="right" title="Right">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="9" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/></svg>
              </button>
            </div>
          </div>
          <div class="form-group flex-1">
            <label>Formatting:</label>
            <div class="btn-group">
              <button class="btn-tool" id="btn-toggle-bold" title="Bold"><strong>B</strong></button>
              <button class="btn-tool" id="btn-toggle-italic" title="Italic"><em>I</em></button>
            </div>
          </div>
        </div>

        <!-- Color & Opacity -->
        <div class="form-row">
          <div class="form-group flex-1">
            <label for="input-text-color">Color:</label>
            <div class="color-picker-wrapper">
              <input type="color" id="input-text-color" value="#2C2724" />
              <span id="text-color-hex">#2C2724</span>
            </div>
          </div>
          <div class="form-group flex-1">
            <label for="input-text-opacity">Opacity:</label>
            <input type="range" id="input-text-opacity" min="0.1" max="1.0" step="0.05" value="1.0" />
          </div>
        </div>

        <!-- Line Spacing & Box Width -->
        <div class="form-row">
          <div class="form-group flex-1">
            <label for="input-line-height">Line Height:</label>
            <input type="range" id="input-line-height" min="1.0" max="2.2" step="0.05" value="1.45" />
          </div>
          <div class="form-group flex-1">
            <label for="input-box-width">Wrap Width:</label>
            <input type="range" id="input-box-width" min="0.4" max="0.95" step="0.05" value="0.8" />
          </div>
        </div>

        <!-- Background Badge Accordion -->
        <details class="control-accordion">
          <summary>Background Badge Box</summary>
          <div class="accordion-content">
            <div class="form-group checkbox-group">
              <label>
                <input type="checkbox" id="check-badge-enable" />
                <span>Enable Background Badge</span>
              </label>
            </div>
            <div class="form-row">
              <div class="form-group flex-1">
                <label for="input-badge-color">Badge Color:</label>
                <input type="color" id="input-badge-color" value="#FFFFFF" />
              </div>
              <div class="form-group flex-1">
                <label for="input-badge-radius">Corner Radius:</label>
                <input type="range" id="input-badge-radius" min="0" max="30" value="12" />
              </div>
            </div>
            <div class="form-group">
              <label for="input-badge-padding">Padding (px):</label>
              <input type="range" id="input-badge-padding" min="4" max="32" value="16" />
            </div>
          </div>
        </details>

        <!-- Shadow & Stroke Accordion -->
        <details class="control-accordion">
          <summary>Shadow & Stroke Outline</summary>
          <div class="accordion-content">
            <div class="form-row">
              <div class="form-group flex-1">
                <label for="input-shadow-blur">Shadow Blur:</label>
                <input type="range" id="input-shadow-blur" min="0" max="30" value="4" />
              </div>
              <div class="form-group flex-1">
                <label for="input-shadow-color">Shadow Color:</label>
                <input type="color" id="input-shadow-color" value="#000000" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group flex-1">
                <label for="input-stroke-width">Stroke Width:</label>
                <input type="range" id="input-stroke-width" min="0" max="10" value="0" />
              </div>
              <div class="form-group flex-1">
                <label for="input-stroke-color">Stroke Color:</label>
                <input type="color" id="input-stroke-color" value="#FFFFFF" />
              </div>
            </div>
          </div>
        </details>

        <!-- Animation Preset -->
        <div class="form-row">
          <div class="form-group flex-2">
            <label for="select-text-animation">Animation:</label>
            <select id="select-text-animation" class="form-select">
              ${Presets.animations.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group flex-1">
            <label for="input-anim-duration">Duration:</label>
            <input type="number" id="input-anim-duration" class="form-input" min="0.2" max="5.0" step="0.2" value="1.0" />
          </div>
        </div>

        <!-- Layer Actions -->
        <div class="layer-actions-row">
          <button id="btn-duplicate-text" class="btn btn-secondary flex-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span>Duplicate Text Layer</span>
          </button>
        </div>
      </div>
    `;

    this.textControls = this.container.querySelector('#text-controls');
    this.inputText = this.container.querySelector('#input-text-content');
    this.selectFont = this.container.querySelector('#select-font-family');
    this.inputSize = this.container.querySelector('#input-font-size');
    this.inputColor = this.container.querySelector('#input-text-color');
    this.colorHex = this.container.querySelector('#text-color-hex');
    this.inputOpacity = this.container.querySelector('#input-text-opacity');
    this.inputLineHeight = this.container.querySelector('#input-line-height');
    this.inputBoxWidth = this.container.querySelector('#input-box-width');
    this.selectAnim = this.container.querySelector('#select-text-animation');
    this.inputAnimDuration = this.container.querySelector('#input-anim-duration');
    this.selectQuickQuote = this.container.querySelector('#select-quick-quote');

    // Badge
    this.checkBadge = this.container.querySelector('#check-badge-enable');
    this.inputBadgeColor = this.container.querySelector('#input-badge-color');
    this.inputBadgeRadius = this.container.querySelector('#input-badge-radius');
    this.inputBadgePadding = this.container.querySelector('#input-badge-padding');

    // Shadow & Stroke
    this.inputShadowBlur = this.container.querySelector('#input-shadow-blur');
    this.inputShadowColor = this.container.querySelector('#input-shadow-color');
    this.inputStrokeWidth = this.container.querySelector('#input-stroke-width');
    this.inputStrokeColor = this.container.querySelector('#input-stroke-color');

    // Buttons
    this.btnBold = this.container.querySelector('#btn-toggle-bold');
    this.btnItalic = this.container.querySelector('#btn-toggle-italic');
    this.btnDuplicate = this.container.querySelector('#btn-duplicate-text');
    this.btnDelete = this.container.querySelector('#btn-delete-text');
  }

  bindEvents() {
    // Add text button
    this.container.querySelector('#btn-add-text').addEventListener('click', () => {
      const newElem = {
        id: Utils.generateId('text'),
        type: 'text',
        text: 'নতুন একটি অনুভূতি...',
        x: 0.5,
        y: 0.5,
        width: 0.8,
        fontFamily: 'Hind Siliguri',
        fontSize: 52,
        fontWeight: 'bold',
        fontStyle: 'normal',
        textAlign: 'center',
        color: '#2C2724',
        opacity: 1.0,
        lineHeight: 1.45,
        letterSpacing: 0,
        rotation: 0,
        shadow: { color: 'rgba(0,0,0,0.1)', blur: 4, offsetX: 0, offsetY: 2 },
        stroke: { color: '#ffffff', width: 0 },
        backgroundBadge: { enabled: false, color: 'rgba(255,255,255,0.7)', padding: 14, borderRadius: 12 },
        startTime: 0,
        endTime: State.project.duration,
        animation: 'fadeIn',
        animationDuration: 1.0
      };
      State.addElement(newElem);
      Utils.showToast('Text layer added', 'success');
    });

    // Quick Quote select
    this.selectQuickQuote.addEventListener('change', (e) => {
      const idx = e.target.value;
      if (idx !== '' && Presets.quickBengaliQuotes[idx]) {
        const quote = Presets.quickBengaliQuotes[idx];
        this.inputText.value = quote;
        this.updateActiveElement({ text: quote });
      }
    });

    // Text content
    this.inputText.addEventListener('input', (e) => {
      this.updateActiveElement({ text: e.target.value }, false);
    });

    // Font Family
    this.selectFont.addEventListener('change', async (e) => {
      const font = e.target.value;
      await Utils.loadFont(font);
      this.updateActiveElement({ fontFamily: font });
    });

    // Font Size
    this.inputSize.addEventListener('input', (e) => {
      this.updateActiveElement({ fontSize: parseInt(e.target.value, 10) || 40 });
    });

    // Text Color
    this.inputColor.addEventListener('input', (e) => {
      this.colorHex.textContent = e.target.value.toUpperCase();
      this.updateActiveElement({ color: e.target.value });
    });

    // Opacity
    this.inputOpacity.addEventListener('input', (e) => {
      this.updateActiveElement({ opacity: parseFloat(e.target.value) });
    });

    // Line Height
    this.inputLineHeight.addEventListener('input', (e) => {
      this.updateActiveElement({ lineHeight: parseFloat(e.target.value) });
    });

    // Box Width
    this.inputBoxWidth.addEventListener('input', (e) => {
      this.updateActiveElement({ width: parseFloat(e.target.value) });
    });

    // Alignment
    const alignBtns = this.container.querySelectorAll('#btn-group-align button');
    alignBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        alignBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const align = btn.dataset.align;
        this.inputText.style.textAlign = align;
        this.updateActiveElement({ textAlign: align });
      });
    });

    // Bold & Italic
    this.btnBold.addEventListener('click', () => {
      const isBold = this.btnBold.classList.toggle('active');
      this.updateActiveElement({ fontWeight: isBold ? 'bold' : 'normal' });
    });

    this.btnItalic.addEventListener('click', () => {
      const isItalic = this.btnItalic.classList.toggle('active');
      this.updateActiveElement({ fontStyle: isItalic ? 'italic' : 'normal' });
    });

    // Badge controls
    this.checkBadge.addEventListener('change', (e) => {
      this.updateActiveBadge({ enabled: e.target.checked });
    });
    this.inputBadgeColor.addEventListener('input', (e) => {
      this.updateActiveBadge({ color: e.target.value });
    });
    this.inputBadgeRadius.addEventListener('input', (e) => {
      this.updateActiveBadge({ borderRadius: parseInt(e.target.value, 10) });
    });
    this.inputBadgePadding.addEventListener('input', (e) => {
      this.updateActiveBadge({ padding: parseInt(e.target.value, 10) });
    });

    // Shadow controls
    this.inputShadowBlur.addEventListener('input', (e) => {
      this.updateActiveElement({
        shadow: {
          blur: parseInt(e.target.value, 10),
          color: this.inputShadowColor.value,
          offsetX: 0,
          offsetY: 2
        }
      });
    });

    // Stroke controls
    this.inputStrokeWidth.addEventListener('input', (e) => {
      this.updateActiveElement({
        stroke: {
          width: parseInt(e.target.value, 10),
          color: this.inputStrokeColor.value
        }
      });
    });

    // Animation
    this.selectAnim.addEventListener('change', (e) => {
      this.updateActiveElement({ animation: e.target.value });
    });
    this.inputAnimDuration.addEventListener('input', (e) => {
      this.updateActiveElement({ animationDuration: parseFloat(e.target.value) || 1.0 });
    });

    // Duplicate & Delete
    this.btnDuplicate.addEventListener('click', () => {
      if (this.activeElement) State.duplicateElement(this.activeElement.id);
    });

    if (this.btnDelete) {
      this.btnDelete.addEventListener('click', () => {
        if (this.activeElement) State.removeElement(this.activeElement.id);
      });
    }

    // React to selection changes
    State.on('selectionChange', (id) => this.loadSelectedElement(id));
    State.on('projectChange', () => {
      if (this.activeElement) {
        const found = State.project.elements.find(e => e.id === this.activeElement.id);
        if (found) this.syncUI(found);
      }
    });

    // Initial load
    this.loadSelectedElement(State.selectedElementId);
  }

  loadSelectedElement(id) {
    const elem = State.project.elements.find(e => e.id === id);
    if (elem && elem.type === 'text') {
      this.activeElement = elem;
      this.textControls.style.opacity = '1.0';
      this.textControls.style.pointerEvents = 'auto';
      this.syncUI(elem);
    } else {
      // Find first text element as fallback
      const firstText = State.project.elements.find(e => e.type === 'text');
      if (firstText) {
        this.activeElement = firstText;
        this.textControls.style.opacity = '1.0';
        this.textControls.style.pointerEvents = 'auto';
        this.syncUI(firstText);
      } else {
        this.activeElement = null;
        this.textControls.style.opacity = '0.5';
        this.textControls.style.pointerEvents = 'none';
      }
    }
  }

  syncUI(elem) {
    this.inputText.value = elem.text || '';
    this.selectFont.value = elem.fontFamily || 'Hind Siliguri';
    this.inputSize.value = elem.fontSize || 52;
    this.inputColor.value = elem.color || '#2C2724';
    this.colorHex.textContent = (elem.color || '#2C2724').toUpperCase();
    this.inputOpacity.value = elem.opacity !== undefined ? elem.opacity : 1.0;
    this.inputLineHeight.value = elem.lineHeight || 1.45;
    this.inputBoxWidth.value = elem.width || 0.8;
    this.selectAnim.value = elem.animation || 'none';
    this.inputAnimDuration.value = elem.animationDuration || 1.0;

    // Formatting buttons
    this.btnBold.classList.toggle('active', elem.fontWeight === 'bold');
    this.btnItalic.classList.toggle('active', elem.fontStyle === 'italic');

    // Align buttons
    const textAlign = elem.textAlign || 'center';
    this.inputText.style.textAlign = textAlign;
    const alignBtns = this.container.querySelectorAll('#btn-group-align button');
    alignBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.align === textAlign);
    });

    // Badge
    const badge = elem.backgroundBadge || {};
    this.checkBadge.checked = !!badge.enabled;
    this.inputBadgeColor.value = badge.color || '#FFFFFF';
    this.inputBadgeRadius.value = badge.borderRadius || 12;
    this.inputBadgePadding.value = badge.padding || 16;

    // Shadow & Stroke
    this.inputShadowBlur.value = elem.shadow ? elem.shadow.blur : 0;
    this.inputStrokeWidth.value = elem.stroke ? elem.stroke.width : 0;
  }

  updateActiveElement(partial, recordUndo = true) {
    if (!this.activeElement) return;
    State.updateElement(this.activeElement.id, partial, recordUndo);
  }

  updateActiveBadge(partial) {
    if (!this.activeElement) return;
    const currentBadge = this.activeElement.backgroundBadge || {};
    const updated = { ...currentBadge, ...partial };
    State.updateElement(this.activeElement.id, { backgroundBadge: updated });
  }
}
