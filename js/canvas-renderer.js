/**
 * ReelMaker Canvas Renderer
 * High-performance, deterministic Canvas 2D rendering engine.
 * Renders backgrounds, doodle patterns, complex Bengali typography, emojis, shapes,
 * social branding, safe area guides, and interactive selection handles.
 */

import { Utils } from './utils.js';
import { State } from './state.js';
import { Presets } from './presets.js';

export class CanvasRenderer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d', { alpha: false });
    this.patternImages = new Map();
    this.bgImages = new Map();
    this.renderedBounds = new Map(); // id -> { x, y, width, height, rotation }

    // Preload SVG pattern images
    this.preloadPatterns();
  }

  preloadPatterns() {
    for (const pattern of Presets.patterns) {
      if (pattern.url) {
        const img = new Image();
        img.src = pattern.url;
        img.onload = () => {
          this.patternImages.set(pattern.id, img);
          State.emit('stateRenderNeeded');
        };
      }
    }
  }

  /**
   * Main rendering method used for BOTH preview and video export.
   * Deterministic: renders exact frame state for given timestamp.
   */
  renderFrame(timestamp, targetCanvas = this.canvas, options = {}) {
    const ctx = targetCanvas.getContext('2d', { alpha: false });
    const { isExport = false, showGuides = State.showSafeArea && !isExport } = options;
    const project = State.project;
    if (!project) return;

    const width = targetCanvas.width;
    const height = targetCanvas.height;

    // Clear canvas
    ctx.save();

    // 1. Render Background & Patterns
    this.renderBackground(ctx, project.background, width, height);

    // 2. Render Elements sorted by z-index / array order
    for (const elem of project.elements) {
      if (timestamp < elem.startTime || timestamp > elem.endTime) {
        // Element is not active at this timestamp
        continue;
      }
      this.renderElement(ctx, elem, timestamp, width, height, isExport);
    }

    // 3. Render Social Media Handle
    if (project.socialHandle && project.socialHandle.enabled) {
      const handle = project.socialHandle;
      if (handle.alwaysVisible || (timestamp >= handle.startTime && timestamp <= handle.endTime)) {
        this.renderSocialHandle(ctx, handle, timestamp, width, height, isExport);
      }
    }

    // 4. Render Safe Area Guides (Preview Only)
    if (showGuides) {
      this.renderSafeAreaGuides(ctx, width, height);
    }

    // 5. Render Selection and Transform Handles (Preview Only)
    if (!isExport && State.selectedElementId) {
      this.renderSelectionHandles(ctx, State.selectedElementId, width, height);
    }

    ctx.restore();
  }

  /**
   * Renders solid colors, gradients, background images, and doodle patterns.
   */
  renderBackground(ctx, bg, width, height) {
    ctx.save();

    // Base background color / gradient
    if (bg.type === 'dark-obsidian') {
      const grad = ctx.createRadialGradient(width / 2, height * 0.35, width * 0.1, width / 2, height * 0.5, width * 0.9);
      grad.addColorStop(0, '#1F2333');
      grad.addColorStop(0.5, '#141722');
      grad.addColorStop(1, '#0B0D13');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    } else if (bg.type === 'pastel-rose') {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#FCECEE');
      grad.addColorStop(0.6, '#F6DCD9');
      grad.addColorStop(1, '#EDCFCE');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    } else if (bg.gradient && Array.isArray(bg.gradient)) {
      const angle = (bg.gradientAngle || 135) * (Math.PI / 180);
      const x2 = width * Math.cos(angle);
      const y2 = height * Math.sin(angle);
      const grad = ctx.createLinearGradient(0, 0, Math.abs(x2), Math.abs(y2));
      grad.addColorStop(0, bg.gradient[0]);
      grad.addColorStop(1, bg.gradient[1]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = bg.color || '#F7F1E5';
      ctx.fillRect(0, 0, width, height);

      // Subtle vignette for cream paper
      if (bg.type === 'cream-paper') {
        const vignette = ctx.createRadialGradient(width / 2, height / 2, width * 0.4, width / 2, height / 2, width * 0.85);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(110,88,68,0.06)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, width, height);
      }
    }

    // Custom Uploaded Background Image (if present)
    if (bg.imageSrc) {
      let img = this.bgImages.get(bg.imageSrc);
      if (!img) {
        img = new Image();
        img.src = bg.imageSrc;
        img.onload = () => {
          this.bgImages.set(bg.imageSrc, img);
          State.emit('stateRenderNeeded');
        };
      } else if (img.complete && img.naturalWidth > 0) {
        ctx.save();
        if (bg.blur > 0) ctx.filter = `blur(${bg.blur}px)`;
        const fit = bg.imageFit || 'cover';

        let drawW = width;
        let drawH = height;
        let drawX = 0;
        let drawY = 0;

        const imgRatio = img.naturalWidth / img.naturalHeight;
        const canvasRatio = width / height;

        if (fit === 'cover') {
          if (imgRatio > canvasRatio) {
            drawH = height;
            drawW = height * imgRatio;
            drawX = (width - drawW) / 2;
          } else {
            drawW = width;
            drawH = width / imgRatio;
            drawY = (height - drawH) / 2;
          }
        } else if (fit === 'contain') {
          if (imgRatio > canvasRatio) {
            drawW = width;
            drawH = width / imgRatio;
            drawY = (height - drawH) / 2;
          } else {
            drawH = height;
            drawW = height * imgRatio;
            drawX = (width - drawW) / 2;
          }
        }

        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        ctx.restore();

        // Optional image tint overlay
        if (bg.overlayOpacity && bg.overlayOpacity > 0) {
          ctx.fillStyle = bg.overlayColor || '#000000';
          ctx.globalAlpha = bg.overlayOpacity;
          ctx.fillRect(0, 0, width, height);
          ctx.globalAlpha = 1.0;
        }
      }
    }

    // Pattern Overlay
    if (bg.pattern && bg.pattern !== 'none') {
      const patternImg = this.patternImages.get(bg.pattern);
      if (patternImg && patternImg.complete && patternImg.naturalWidth > 0) {
        ctx.save();
        ctx.globalAlpha = bg.patternOpacity || 0.35;
        if (bg.patternBlend) {
          ctx.globalCompositeOperation = bg.patternBlend;
        }

        const pattern = ctx.createPattern(patternImg, 'repeat');
        if (pattern) {
          const scale = bg.patternScale || 1.0;
          if (typeof DOMMatrix !== 'undefined' && scale !== 1.0) {
            const matrix = new DOMMatrix();
            matrix.scaleSelf(scale, scale);
            if (bg.patternRotation) matrix.rotateSelf(bg.patternRotation);
            pattern.setTransform(matrix);
          }
          ctx.fillStyle = pattern;
          ctx.fillRect(0, 0, width, height);
        }
        ctx.restore();
      }
    }

    ctx.restore();
  }

  /**
   * Dispatches element rendering based on type (text, emoji, shape).
   */
  renderElement(ctx, elem, timestamp, width, height, isExport) {
    ctx.save();

    // Calculate animation transform & opacity
    const animState = this.calculateAnimationState(elem, timestamp);
    if (animState.opacity <= 0) {
      ctx.restore();
      return;
    }

    const cx = elem.x * width;
    const cy = elem.y * height;

    ctx.translate(cx + animState.offsetX, cy + animState.offsetY);
    ctx.rotate(((elem.rotation || 0) + animState.rotation) * (Math.PI / 180));
    ctx.scale(animState.scaleX, animState.scaleY);
    ctx.globalAlpha = (elem.opacity !== undefined ? elem.opacity : 1.0) * animState.opacity;

    let bounds = { x: -50, y: -50, width: 100, height: 100 };

    if (elem.type === 'text') {
      bounds = this.drawTextElement(ctx, elem, animState, width);
    } else if (elem.type === 'emoji') {
      bounds = this.drawEmojiElement(ctx, elem);
    } else if (elem.type === 'shape') {
      bounds = this.drawShapeElement(ctx, elem);
    }

    ctx.restore();

    // Cache bounds for hit-testing in preview
    if (!isExport) {
      this.renderedBounds.set(elem.id, {
        cx,
        cy,
        width: bounds.width * animState.scaleX,
        height: bounds.height * animState.scaleY,
        rotation: (elem.rotation || 0) + animState.rotation
      });
    }
  }

  /**
   * Deterministic animation interpolation.
   */
  calculateAnimationState(elem, timestamp) {
    const anim = elem.animation || 'none';
    const duration = elem.animationDuration || 1.0;
    const elapsed = timestamp - elem.startTime;

    const state = {
      opacity: 1.0,
      scaleX: 1.0,
      scaleY: 1.0,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      progress: 1.0
    };

    if (anim === 'none' || duration <= 0) return state;

    // Normalize progress 0 to 1
    const t = Utils.clamp(elapsed / duration, 0, 1);
    state.progress = t;

    // Cubic easing functions for buttery smooth feel
    const easeOutCubic = x => 1 - Math.pow(1 - x, 3);
    const easeOutBack = x => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    };

    switch (anim) {
      case 'fadeIn':
        state.opacity = easeOutCubic(t);
        break;

      case 'fadeOut': {
        const remaining = elem.endTime - timestamp;
        if (remaining <= duration) {
          state.opacity = Utils.clamp(remaining / duration, 0, 1);
        }
        break;
      }

      case 'fadeInOut': {
        const remaining = elem.endTime - timestamp;
        if (t < 1) {
          state.opacity = easeOutCubic(t);
        } else if (remaining <= duration) {
          state.opacity = Utils.clamp(remaining / duration, 0, 1);
        }
        break;
      }

      case 'slideUp': {
        const eased = easeOutCubic(t);
        state.opacity = eased;
        state.offsetY = (1 - eased) * 60;
        break;
      }

      case 'slideDown': {
        const eased = easeOutCubic(t);
        state.opacity = eased;
        state.offsetY = -(1 - eased) * 60;
        break;
      }

      case 'popIn': {
        const eased = easeOutBack(t);
        state.scaleX = eased;
        state.scaleY = eased;
        state.opacity = Utils.clamp(t * 3, 0, 1);
        break;
      }

      case 'zoomIn': {
        const eased = easeOutCubic(t);
        state.scaleX = 0.5 + 0.5 * eased;
        state.scaleY = 0.5 + 0.5 * eased;
        state.opacity = eased;
        break;
      }

      case 'typewriter':
        // Progress dictates how many graphemes are revealed
        state.opacity = 1.0;
        break;
    }

    return state;
  }

  /**
   * Draws multiline text with accurate Bengali font shaping, shadows, strokes, and badges.
   */
  drawTextElement(ctx, elem, animState, canvasWidth) {
    const fontSize = elem.fontSize || 52;
    const fontFamily = elem.fontFamily || 'Hind Siliguri';
    const fontWeight = elem.fontWeight || 'normal';
    const fontStyle = elem.fontStyle || 'normal';
    const lineHeight = elem.lineHeight || 1.45;
    const textAlign = elem.textAlign || 'center';

    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px "${fontFamily}", "Hind Siliguri", "Noto Serif Bengali", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = textAlign;

    const maxWrapWidth = (elem.width || 0.8) * canvasWidth;
    let fullText = elem.text || '';

    // Handle grapheme-aware typewriter animation
    if (elem.animation === 'typewriter' && animState.progress < 1.0) {
      const allGraphemes = Utils.getGraphemes(fullText);
      const visibleCount = Math.floor(allGraphemes.length * animState.progress);
      fullText = allGraphemes.slice(0, visibleCount).join('');
    }

    const lines = Utils.wrapText(fullText, maxWrapWidth, str => ctx.measureText(str).width);
    const lineSpacing = fontSize * lineHeight;
    const totalTextHeight = lines.length * lineSpacing;

    // Measure total bounding box
    let maxLineWidth = 0;
    for (const line of lines) {
      const w = ctx.measureText(line).width;
      if (w > maxLineWidth) maxLineWidth = w;
    }

    const halfW = maxLineWidth / 2;
    const halfH = totalTextHeight / 2;

    // Draw Background Badge (if enabled)
    if (elem.backgroundBadge && elem.backgroundBadge.enabled) {
      const pad = elem.backgroundBadge.padding || 16;
      const radius = elem.backgroundBadge.borderRadius || 12;
      const bgX = -halfW - pad;
      const bgY = -halfH - pad;
      const bgW = maxLineWidth + pad * 2;
      const bgH = totalTextHeight + pad * 2;

      ctx.save();
      ctx.fillStyle = elem.backgroundBadge.color || 'rgba(255,255,255,0.7)';
      this.drawRoundedRect(ctx, bgX, bgY, bgW, bgH, radius);
      ctx.fill();
      ctx.restore();
    }

    // Configure Shadows
    if (elem.shadow && elem.shadow.blur > 0) {
      ctx.shadowColor = elem.shadow.color || 'rgba(0,0,0,0.2)';
      ctx.shadowBlur = elem.shadow.blur;
      ctx.shadowOffsetX = elem.shadow.offsetX || 0;
      ctx.shadowOffsetY = elem.shadow.offsetY || 2;
    }

    // Render Text Lines
    const startY = -halfH + lineSpacing / 2;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const y = startY + i * lineSpacing;
      let x = 0;
      if (textAlign === 'left') x = -halfW;
      else if (textAlign === 'right') x = halfW;

      // Stroke / outline
      if (elem.stroke && elem.stroke.width > 0) {
        ctx.strokeStyle = elem.stroke.color || '#ffffff';
        ctx.lineWidth = elem.stroke.width;
        ctx.strokeText(line, x, y);
      }

      // Fill text
      ctx.fillStyle = elem.color || '#2C2724';
      ctx.fillText(line, x, y);
    }

    return {
      x: -halfW,
      y: -halfH,
      width: Math.max(80, maxLineWidth),
      height: Math.max(40, totalTextHeight)
    };
  }

  /**
   * Draws standalone emojis with crisp rendering.
   */
  drawEmojiElement(ctx, elem) {
    const size = elem.size || 64;
    ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText(elem.emoji || '✨', 0, 0);

    return {
      x: -size / 2,
      y: -size / 2,
      width: size,
      height: size
    };
  }

  /**
   * Draws decorative shapes and vector doodles.
   */
  drawShapeElement(ctx, elem) {
    const w = elem.width || 60;
    const h = elem.height || 60;
    const color = elem.color || '#685B53';
    const shape = elem.shape || 'heart';

    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (shape) {
      case 'quoteMarks': {
        ctx.font = `italic bold ${Math.floor(w * 1.5)}px "Georgia", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('“', 0, h * 0.1);
        break;
      }

      case 'heart': {
        ctx.beginPath();
        const topCurveHeight = h * 0.3;
        ctx.moveTo(0, h * 0.2);
        // top left curve
        ctx.bezierCurveTo(-w * 0.5, -topCurveHeight, -w * 0.5, h * 0.3, 0, h * 0.5);
        // top right curve
        ctx.bezierCurveTo(w * 0.5, h * 0.3, w * 0.5, -topCurveHeight, 0, h * 0.2);
        ctx.fill();
        break;
      }

      case 'star': {
        this.drawStar(ctx, 0, 0, 5, w * 0.5, w * 0.22);
        ctx.fill();
        break;
      }

      case 'sparkle': {
        // 4-point sparkle diamond
        ctx.beginPath();
        ctx.moveTo(0, -h * 0.5);
        ctx.quadraticCurveTo(0, 0, w * 0.5, 0);
        ctx.quadraticCurveTo(0, 0, 0, h * 0.5);
        ctx.quadraticCurveTo(0, 0, -w * 0.5, 0);
        ctx.quadraticCurveTo(0, 0, 0, -h * 0.5);
        ctx.fill();
        break;
      }

      case 'dividerLine': {
        ctx.beginPath();
        ctx.moveTo(-w * 0.5, 0);
        ctx.lineTo(-12, 0);
        ctx.moveTo(12, 0);
        ctx.lineTo(w * 0.5, 0);
        ctx.stroke();
        // Center mini diamond
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(6, 0);
        ctx.lineTo(0, 6);
        ctx.lineTo(-6, 0);
        ctx.closePath();
        ctx.fill();
        break;
      }

      case 'circle': {
        ctx.beginPath();
        ctx.arc(0, 0, w * 0.45, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }

      case 'cornerFrame': {
        ctx.beginPath();
        ctx.moveTo(-w * 0.5, -h * 0.5 + 20);
        ctx.lineTo(-w * 0.5, -h * 0.5);
        ctx.lineTo(-w * 0.5 + 20, -h * 0.5);
        ctx.moveTo(w * 0.5 - 20, h * 0.5);
        ctx.lineTo(w * 0.5, h * 0.5);
        ctx.lineTo(w * 0.5, h * 0.5 - 20);
        ctx.stroke();
        break;
      }
    }

    return {
      x: -w / 2,
      y: -h / 2,
      width: w,
      height: h
    };
  }

  /**
   * Helper to draw a geometric star.
   */
  drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = (Math.PI / 2) * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);

    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
  }

  /**
   * Renders the social media branding handle.
   */
  renderSocialHandle(ctx, handle, timestamp, width, height, isExport) {
    ctx.save();

    let cx = handle.x * width;
    let cy = handle.y * height;

    // Apply preset position if configured
    if (handle.positionPreset === 'bottom-center') {
      cx = width * 0.5;
      cy = height * 0.88;
    } else if (handle.positionPreset === 'bottom-left') {
      cx = width * 0.28;
      cy = height * 0.88;
    } else if (handle.positionPreset === 'bottom-right') {
      cx = width * 0.72;
      cy = height * 0.88;
    }

    const fontSize = handle.fontSize || 26;
    const fontFamily = handle.fontFamily || 'Outfit';
    const text = handle.text || '@yourname';

    ctx.font = `600 ${fontSize}px "${fontFamily}", "Outfit", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;
    const badgePad = handle.backgroundBadge && handle.backgroundBadge.enabled ? (handle.backgroundBadge.padding || 10) : 0;
    const totalW = textWidth + badgePad * 2 + 16;
    const totalH = fontSize + badgePad * 1.5;

    ctx.translate(cx, cy);
    ctx.globalAlpha = handle.opacity !== undefined ? handle.opacity : 0.85;

    // Pill Badge
    if (handle.backgroundBadge && handle.backgroundBadge.enabled) {
      ctx.save();
      ctx.fillStyle = handle.backgroundBadge.color || 'rgba(255, 255, 255, 0.65)';
      this.drawRoundedRect(ctx, -totalW / 2, -totalH / 2, totalW, totalH, handle.backgroundBadge.borderRadius || 20);
      ctx.fill();
      ctx.restore();
    }

    // Text
    ctx.fillStyle = handle.color || '#5A5049';
    ctx.fillText(text, 0, 0);

    ctx.restore();

    if (!isExport) {
      this.renderedBounds.set('socialHandle', {
        cx,
        cy,
        width: totalW,
        height: totalH,
        rotation: 0
      });
    }
  }

  /**
   * Renders TikTok / Reels Safe-Area Guides overlay.
   */
  renderSafeAreaGuides(ctx, width, height) {
    ctx.save();
    ctx.strokeStyle = 'rgba(139, 124, 255, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);

    // Top status / sound area (~14%)
    const topMargin = height * 0.14;
    ctx.strokeRect(width * 0.08, topMargin, width * 0.84, height * 0.64);

    // Right action buttons safe boundary (~18% right)
    const rightMargin = width * 0.84;
    ctx.beginPath();
    ctx.moveTo(rightMargin, topMargin);
    ctx.lineTo(rightMargin, topMargin + height * 0.64);
    ctx.stroke();

    // Bottom caption/audio zone (~22% bottom)
    const bottomSafe = height * 0.78;
    ctx.beginPath();
    ctx.moveTo(width * 0.08, bottomSafe);
    ctx.lineTo(width * 0.92, bottomSafe);
    ctx.stroke();

    // Subtle guide labels
    ctx.setLineDash([]);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(139, 124, 255, 0.75)';
    ctx.textAlign = 'left';
    ctx.fillText('Reels Safe Zone', width * 0.09, topMargin - 8);
    ctx.textAlign = 'right';
    ctx.fillText('Action Buttons ➔', rightMargin - 8, height * 0.5);

    ctx.restore();
  }

  /**
   * Renders interactive transform / selection handles for the currently active element.
   */
  renderSelectionHandles(ctx, selectedId, width, height) {
    const bound = this.renderedBounds.get(selectedId);
    if (!bound) return;

    const { cx, cy, width: bw, height: bh, rotation = 0 } = bound;
    const halfW = bw / 2;
    const halfH = bh / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation * (Math.PI / 180));

    // Selection dashed border
    ctx.strokeStyle = '#8B7CFF';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(-halfW - 6, -halfH - 6, bw + 12, bh + 12);
    ctx.setLineDash([]);

    // 4 Corner Resize Handles
    const handleSize = 10;
    const corners = [
      { x: -halfW - 6, y: -halfH - 6 }, // NW
      { x: halfW + 6, y: -halfH - 6 },  // NE
      { x: halfW + 6, y: halfH + 6 },   // SE
      { x: -halfW - 6, y: halfH + 6 }   // SW
    ];

    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#8B7CFF';
    ctx.lineWidth = 2;

    for (const c of corners) {
      ctx.fillRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
      ctx.strokeRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
    }

    // Rotation Handle (top lollipop)
    const rotY = -halfH - 26;
    ctx.beginPath();
    ctx.moveTo(0, -halfH - 6);
    ctx.lineTo(0, rotY);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, rotY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Hit test helper for pointer/mouse/touch selection and dragging.
   */
  hitTest(canvasX, canvasY, width, height) {
    // 1. Check handles of selected element first
    const selectedId = State.selectedElementId;
    if (selectedId && this.renderedBounds.has(selectedId)) {
      const bound = this.renderedBounds.get(selectedId);
      const handleHit = this.hitTestHandles(canvasX, canvasY, bound);
      if (handleHit) {
        return { id: selectedId, handle: handleHit };
      }
    }

    // 2. Check elements in reverse order (topmost first)
    const elements = State.project ? [...State.project.elements].reverse() : [];
    if (State.project && State.project.socialHandle && State.project.socialHandle.enabled) {
      elements.unshift(State.project.socialHandle);
    }

    for (const elem of elements) {
      const id = elem.id || 'socialHandle';
      const bound = this.renderedBounds.get(id);
      if (!bound) continue;

      if (this.isPointInsideBound(canvasX, canvasY, bound)) {
        return { id, handle: 'body' };
      }
    }

    return null;
  }

  isPointInsideBound(px, py, bound) {
    const { cx, cy, width, height, rotation = 0 } = bound;
    // Rotate point backwards into local coordinates
    const rad = -rotation * (Math.PI / 180);
    const dx = px - cx;
    const dy = py - cy;
    const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
    const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

    const halfW = width / 2 + 10;
    const halfH = height / 2 + 10;

    return localX >= -halfW && localX <= halfW && localY >= -halfH && localY <= halfH;
  }

  hitTestHandles(px, py, bound) {
    const { cx, cy, width, height, rotation = 0 } = bound;
    const rad = -rotation * (Math.PI / 180);
    const dx = px - cx;
    const dy = py - cy;
    const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
    const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

    const halfW = width / 2 + 6;
    const halfH = height / 2 + 6;
    const hitRadius = 14;

    // Rotation handle
    if (Math.hypot(localX - 0, localY - (-halfH - 20)) <= hitRadius) {
      return 'rot';
    }

    // Corner resize handles
    if (Math.hypot(localX - (-halfW), localY - (-halfH)) <= hitRadius) return 'nw';
    if (Math.hypot(localX - halfW, localY - (-halfH)) <= hitRadius) return 'ne';
    if (Math.hypot(localX - halfW, localY - halfH) <= hitRadius) return 'se';
    if (Math.hypot(localX - (-halfW), localY - halfH) <= hitRadius) return 'sw';

    return null;
  }

  drawRoundedRect(ctx, x, y, width, height, radius) {
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, radius);
      return;
    }
    // Fallback for older browsers
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}
