/**
 * ReelMaker Utility Functions
 * Unicode/Bengali Grapheme handling, Toast alerts, Font management, Time formatting
 */

export const Utils = {
  /**
   * Generates a unique identifier.
   */
  generateId(prefix = 'elem') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
  },

  /**
   * Clamps a number between min and max.
   */
  clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  },

  /**
   * Formats seconds into MM:SS.SS or MM:SS format.
   */
  formatTime(seconds, includeDecimals = true) {
    if (isNaN(seconds) || seconds < 0) seconds = 0;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);

    const minStr = String(mins).padStart(2, '0');
    const secStr = String(secs).padStart(2, '0');

    if (includeDecimals) {
      const msStr = String(ms).padStart(2, '0');
      return `${minStr}:${secStr}.${msStr}`;
    }
    return `${minStr}:${secStr}`;
  },

  /**
   * Debounce function to prevent high-frequency firing.
   */
  debounce(func, wait = 300) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  },

  /**
   * Deep clone helper.
   */
  deepClone(obj) {
    if (obj === undefined) return undefined;
    return JSON.parse(JSON.stringify(obj));
  },

  /**
   * Unicode and Bengali Grapheme Cluster Splitter.
   * Ensures complex conjuncts (যুক্তাক্ষর) and vowel signs (কার/মাত্রা) stay intact.
   */
  getGraphemes(text) {
    if (!text) return [];

    // Use standard Intl.Segmenter if supported by browser
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      try {
        const segmenter = new Intl.Segmenter('bn', { granularity: 'grapheme' });
        return Array.from(segmenter.segment(text), s => s.segment);
      } catch (e) {
        // Fallback to regex below
      }
    }

    // Comprehensive Unicode Grapheme Cluster Regex (including Bengali block U+0980 - U+09FF)
    // Matches base character followed by any number of combining marks, virama (্), or nuktas.
    const graphemeRegex = /[\u0980-\u09FF][\u09BC\u09BE-\u09CD\u09D7]*|[\uD800-\uDBFF][\uDC00-\uDFFF][\uFE0E\uFE0F]?|[\s\S]/gu;
    return text.match(graphemeRegex) || Array.from(text);
  },

  /**
   * Multi-line text wrapping using graphemes and measuring actual Canvas widths.
   */
  wrapText(text, maxWidth, measureFn) {
    if (!text) return [''];
    const lines = [];
    const paragraphs = text.split('\n');

    for (const paragraph of paragraphs) {
      if (!paragraph.trim()) {
        lines.push('');
        continue;
      }

      // Split into words, while keeping whitespace
      const words = paragraph.split(/(\s+)/);
      let currentLine = '';

      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const testLine = currentLine + word;
        const testWidth = measureFn(testLine);

        if (testWidth > maxWidth && currentLine.trim().length > 0) {
          lines.push(currentLine.trimEnd());
          currentLine = word.trimStart();
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine.length > 0) {
        lines.push(currentLine.trimEnd());
      }
    }

    return lines.length > 0 ? lines : [''];
  },

  /**
   * Font loading cache and checker.
   */
  _loadedFonts: new Set(),
  async loadFont(fontFamily) {
    if (!fontFamily || this._loadedFonts.has(fontFamily)) {
      return true;
    }

    if (document.fonts && document.fonts.load) {
      try {
        await document.fonts.load(`16px "${fontFamily}"`);
        this._loadedFonts.add(fontFamily);
        return true;
      } catch (err) {
        console.warn(`Font "${fontFamily}" could not be loaded immediately:`, err);
        return false;
      }
    }
    return true;
  },

  /**
   * Secure HTML string escaping to prevent Cross-Site Scripting (XSS).
   */
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /**
   * Toast notification system (no alert() calls!).
   */
  showToast(message, type = 'info', duration = 3500) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const iconSvg = {
      success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
      error: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
      warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
    }[type] || '';

    toast.innerHTML = `
      <span class="toast-icon">${iconSvg}</span>
      <span class="toast-text"></span>
      <button class="toast-close" aria-label="Dismiss">&times;</button>
    `;

    toast.querySelector('.toast-text').textContent = String(message || '');

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
      toast.classList.add('toast-fade-out');
      setTimeout(() => toast.remove(), 250);
    });

    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.add('toast-fade-out');
        setTimeout(() => toast.remove(), 250);
      }
    }, duration);
  },

  /**
   * Helper to convert file to Object URL safely.
   */
  createObjectURL(file) {
    if (!file) return null;
    return URL.createObjectURL(file);
  },

  /**
   * Helper to revoke Object URL safely.
   */
  revokeObjectURL(url) {
    if (url && typeof url === 'string' && url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {}
    }
  },

  /**
   * Helper to read file as Data URL.
   */
  readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  /**
   * Helper to read file as ArrayBuffer.
   */
  async readFileAsArrayBuffer(file) {
    if (file && typeof file.arrayBuffer === 'function') {
      try {
        return await file.arrayBuffer();
      } catch (e) {}
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }
};
