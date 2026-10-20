/**
 * ReelMaker Pattern Generator
 * Creates 100% origin-clean in-memory Canvas 2D tile patterns.
 * Eliminates WebKit / iOS Safari canvas tainting caused by loading external SVGs via <img>.
 * Uses native Path2D and Canvas2D rendering for zero-latency, razor-sharp vector patterns.
 */

export class PatternGenerator {
  static tileCache = new Map();

  /**
   * Retrieves or creates an origin-clean HTMLCanvasElement tile for a pattern.
   * @param {string} patternId
   * @param {string} [color='#685B53']
   * @returns {HTMLCanvasElement|null}
   */
  static getTile(patternId, color = '#685B53') {
    if (!patternId || patternId === 'none') return null;

    const cacheKey = `${patternId}_${color}`;
    if (this.tileCache.has(cacheKey)) {
      return this.tileCache.get(cacheKey);
    }

    const drawer = this.patterns[patternId];
    if (!drawer) return null;

    const canvas = document.createElement('canvas');
    canvas.width = drawer.width || 120;
    canvas.height = drawer.height || 120;
    const ctx = canvas.getContext('2d');

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = drawer.lineWidth || 1.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    try {
      drawer.render(ctx, color);
    } catch (err) {
      console.warn(`[PatternGenerator] Failed rendering pattern ${patternId}:`, err);
    }
    ctx.restore();

    this.tileCache.set(cacheKey, canvas);
    return canvas;
  }

  // Pre-compiled pattern definitions matching exact aesthetic SVG specifications
  static patterns = {
    'paper-dots': {
      width: 60,
      height: 60,
      render(ctx, color) {
        ctx.fillStyle = color;
        const dots = [
          { x: 15, y: 15, r: 1.2, opacity: 0.35 },
          { x: 45, y: 15, r: 1.1, opacity: 0.25 },
          { x: 15, y: 45, r: 1.1, opacity: 0.25 },
          { x: 45, y: 45, r: 1.3, opacity: 0.35 },
          { x: 30, y: 30, r: 0.9, opacity: 0.2 }
        ];
        for (const dot of dots) {
          ctx.save();
          ctx.globalAlpha = dot.opacity;
          ctx.beginPath();
          ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    },

    'vintage-grid': {
      width: 60,
      height: 60,
      lineWidth: 1.2,
      render(ctx) {
        // Dashed grid lines
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.setLineDash([1, 3]);
        ctx.beginPath();
        ctx.moveTo(0, 30);
        ctx.lineTo(60, 30);
        ctx.moveTo(30, 0);
        ctx.lineTo(30, 60);
        ctx.stroke();
        ctx.restore();

        // Corner cross marks
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1.2;
        const cross = (cx, cy) => {
          ctx.beginPath();
          ctx.moveTo(cx, cy - 4);
          ctx.lineTo(cx, cy + 4);
          ctx.moveTo(cx - 4, cy);
          ctx.lineTo(cx + 4, cy);
          ctx.stroke();
        };
        cross(0, 0);
        cross(60, 0);
        cross(0, 60);
        cross(60, 60);

        // Center cross stitch
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(30, 26);
        ctx.lineTo(30, 34);
        ctx.moveTo(26, 30);
        ctx.lineTo(34, 30);
        ctx.stroke();
        ctx.restore();
      }
    },

    'doodle-hearts': {
      width: 120,
      height: 120,
      lineWidth: 1.8,
      render(ctx) {
        // Hearts
        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.stroke(new Path2D('M 28 24 C 28 17 38 12 43 20 C 48 12 58 17 58 24 C 58 35 43 45 43 45 C 43 45 28 35 28 24 Z'));

        ctx.globalAlpha = 0.6;
        ctx.stroke(new Path2D('M 85 75 C 85 70 92 67 96 72 C 100 67 107 70 107 75 C 107 83 96 90 96 90 C 96 90 85 83 85 75 Z'));

        // Sparkles
        ctx.globalAlpha = 0.7;
        ctx.stroke(new Path2D('M 90 20 L 90 32 M 84 26 L 96 26'));

        ctx.globalAlpha = 0.6;
        ctx.stroke(new Path2D('M 20 85 L 20 95 M 15 90 L 25 90'));

        // Mini dots
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(68, 18, 1.5, 0, Math.PI * 2);
        ctx.arc(55, 85, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Decorative arcs
        ctx.stroke(new Path2D('M 68 58 Q 74 54 80 58'));
        ctx.stroke(new Path2D('M 12 45 Q 16 40 22 43'));
        ctx.restore();
      }
    },

    'doodle-stars': {
      width: 120,
      height: 120,
      lineWidth: 1.8,
      render(ctx) {
        ctx.save();
        // 4-point star
        ctx.globalAlpha = 0.8;
        ctx.stroke(new Path2D('M 30 18 Q 30 30 18 30 Q 30 30 30 42 Q 30 30 42 30 Q 30 30 30 18 Z'));

        // Crescent moon
        ctx.globalAlpha = 0.75;
        ctx.stroke(new Path2D('M 88 20 C 82 24 82 34 88 38 C 84 38 78 32 80 22 C 81 21 85 20 88 20 Z'));

        // Sparkles
        ctx.globalAlpha = 0.7;
        ctx.stroke(new Path2D('M 85 82 L 85 92 M 80 87 L 90 87'));

        // Smaller 4-point star
        ctx.globalAlpha = 0.65;
        ctx.stroke(new Path2D('M 24 80 Q 24 88 16 88 Q 24 88 24 96 Q 24 88 32 88 Q 24 88 24 80 Z'));

        // Dots & constellation
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(58, 48, 1.5, 0, Math.PI * 2);
        ctx.arc(62, 98, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(95, 55, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    },

    'doodle-butterflies': {
      width: 120,
      height: 120,
      lineWidth: 1.8,
      render(ctx) {
        ctx.save();

        // Butterfly 1
        ctx.save();
        ctx.translate(24, 20);
        ctx.rotate(-15 * Math.PI / 180);
        ctx.globalAlpha = 0.8;
        ctx.stroke(new Path2D('M 0 0 C -12 -14 -22 -4 -16 6 C -12 12 -4 8 0 2'));
        ctx.stroke(new Path2D('M 0 0 C 12 -14 22 -4 16 6 C 12 12 4 8 0 2'));
        ctx.globalAlpha = 0.75;
        ctx.stroke(new Path2D('M 0 2 C -10 4 -14 14 -8 18 C -2 20 0 10 0 2'));
        ctx.stroke(new Path2D('M 0 2 C 10 4 14 14 8 18 C 2 20 0 10 0 2'));
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.lineTo(0, 12);
        ctx.stroke();
        ctx.lineWidth = 1.8;
        ctx.globalAlpha = 0.7;
        ctx.stroke(new Path2D('M -1 -2 Q -4 -8 -8 -9'));
        ctx.stroke(new Path2D('M 1 -2 Q 4 -8 8 -9'));
        ctx.restore();

        // Mini Butterfly 2
        ctx.save();
        ctx.translate(86, 75);
        ctx.rotate(20 * Math.PI / 180);
        ctx.scale(0.65, 0.65);
        ctx.globalAlpha = 0.7;
        ctx.stroke(new Path2D('M 0 0 C -12 -14 -20 -4 -14 6 C -10 12 -4 8 0 2'));
        ctx.stroke(new Path2D('M 0 0 C 12 -14 20 -4 14 6 C 10 12 4 8 0 2'));
        ctx.globalAlpha = 0.65;
        ctx.stroke(new Path2D('M 0 2 C -8 4 -12 12 -6 16 C -2 18 0 8 0 2'));
        ctx.stroke(new Path2D('M 0 2 C 8 4 12 12 6 16 C 2 18 0 8 0 2'));
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.lineTo(0, 10);
        ctx.stroke();
        ctx.restore();

        // Trail & sparkles
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.3;
        ctx.setLineDash([2, 4]);
        ctx.stroke(new Path2D('M 45 42 Q 62 48 76 65'));
        ctx.restore();

        ctx.globalAlpha = 0.65;
        ctx.stroke(new Path2D('M 92 24 L 92 34 M 87 29 L 97 29'));

        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.arc(20, 85, 1.5, 0, Math.PI * 2);
        ctx.arc(68, 95, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    },

    'doodle-waves': {
      width: 120,
      height: 120,
      lineWidth: 1.8,
      render(ctx) {
        ctx.save();
        ctx.globalAlpha = 0.65;
        ctx.stroke(new Path2D('M 0 25 Q 30 12 60 25 T 120 25'));

        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1.4;
        ctx.setLineDash([3, 4]);
        ctx.stroke(new Path2D('M 0 35 Q 30 22 60 35 T 120 35'));

        ctx.setLineDash([]);
        ctx.lineWidth = 1.8;
        ctx.globalAlpha = 0.65;
        ctx.stroke(new Path2D('M 0 75 Q 30 88 60 75 T 120 75'));

        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1.4;
        ctx.setLineDash([3, 4]);
        ctx.stroke(new Path2D('M 0 85 Q 30 98 60 85 T 120 85'));
        ctx.setLineDash([]);

        // Water droplets
        ctx.lineWidth = 1.8;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(35, 52, 3, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = 0.35;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.arc(35, 52, 7, 0, Math.PI * 2);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(85, 55, 2, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = 0.3;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.arc(85, 55, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.globalAlpha = 0.4;
        ctx.stroke(new Path2D('M 10 108 Q 15 102 22 105'));
        ctx.stroke(new Path2D('M 98 10 Q 104 5 110 9'));
        ctx.restore();
      }
    },

    'doodle-coffee': {
      width: 120,
      height: 120,
      lineWidth: 1.8,
      render(ctx) {
        ctx.save();

        // Cup
        ctx.save();
        ctx.translate(25, 26);
        ctx.globalAlpha = 0.8;
        ctx.stroke(new Path2D('M 0 6 L 3 22 Q 4 26 12 26 L 18 26 Q 26 26 27 22 L 30 6 Z'));
        ctx.globalAlpha = 0.75;
        ctx.stroke(new Path2D('M 28 9 C 34 9 34 19 27 20'));
        ctx.globalAlpha = 0.7;
        ctx.stroke(new Path2D('M -3 27 Q 15 31 33 27'));
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 1.4;
        ctx.stroke(new Path2D('M 9 2 Q 13 -4 9 -8'));
        ctx.stroke(new Path2D('M 18 4 Q 22 -2 18 -6'));
        ctx.restore();

        // Coffee Bean 1
        ctx.save();
        ctx.translate(85, 28);
        ctx.rotate(35 * Math.PI / 180);
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.ellipse(0, 0, 6, 9, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.stroke(new Path2D('M 0 -8 Q 3 0 0 8'));
        ctx.restore();

        // Coffee Bean 2
        ctx.save();
        ctx.translate(25, 92);
        ctx.rotate(-45 * Math.PI / 180);
        ctx.globalAlpha = 0.65;
        ctx.beginPath();
        ctx.ellipse(0, 0, 5, 7.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.stroke(new Path2D('M 0 -7 Q -2 0 0 7'));
        ctx.restore();

        // Sparkles & dots
        ctx.globalAlpha = 0.7;
        ctx.stroke(new Path2D('M 85 82 L 85 92 M 80 87 L 90 87'));
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.arc(58, 68, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(98, 62, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.stroke(new Path2D('M 52 18 Q 58 14 64 18'));

        ctx.restore();
      }
    },

    'doodle-galaxy': {
      width: 120,
      height: 120,
      lineWidth: 1.8,
      render(ctx) {
        ctx.save();

        // Saturn
        ctx.save();
        ctx.translate(35, 32);
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.75;
        ctx.stroke(new Path2D('M -18 4 Q 0 -8 18 -4'));
        ctx.stroke(new Path2D('M 18 -4 Q 0 10 -18 4'));
        ctx.restore();

        // Shooting Star
        ctx.save();
        ctx.translate(85, 25);
        ctx.globalAlpha = 0.8;
        ctx.stroke(new Path2D('M 0 0 Q 0 8 -8 8 Q 0 8 0 16 Q 0 8 8 8 Q 0 8 0 0 Z'));
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.3;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(-6, 2);
        ctx.lineTo(-18, -4);
        ctx.moveTo(-3, 0);
        ctx.lineTo(-15, -8);
        ctx.stroke();
        ctx.restore();

        // Moon
        ctx.globalAlpha = 0.75;
        ctx.stroke(new Path2D('M 88 80 C 82 84 82 94 88 98 C 84 98 78 92 80 82 C 81 81 85 80 88 80 Z'));

        // Constellation
        ctx.globalAlpha = 0.65;
        ctx.stroke(new Path2D('M 22 88 L 22 96 M 18 92 L 26 92'));
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(60, 72, 1.5, 0, Math.PI * 2);
        ctx.arc(98, 55, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(28, 62, 1.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    },

    'doodle-sunburst': {
      width: 120,
      height: 120,
      lineWidth: 1.8,
      render(ctx) {
        ctx.save();

        const drawSun = (cx, cy, r, rayInner, rayOuter, scale = 1.0) => {
          ctx.save();
          ctx.translate(cx, cy);
          if (scale !== 1.0) ctx.scale(scale, scale);
          ctx.globalAlpha = 0.8;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.stroke();

          ctx.globalAlpha = 0.75;
          const rays = [
            [0, -rayInner, 0, -rayOuter],
            [0, rayInner, 0, rayOuter],
            [-rayInner, 0, -rayOuter, 0],
            [rayInner, 0, rayOuter, 0],
            [-rayInner * 0.71, -rayInner * 0.71, -rayOuter * 0.73, -rayOuter * 0.73],
            [rayInner * 0.71, -rayInner * 0.71, rayOuter * 0.73, -rayOuter * 0.73],
            [-rayInner * 0.71, rayInner * 0.71, -rayOuter * 0.73, rayOuter * 0.73],
            [rayInner * 0.71, rayInner * 0.71, rayOuter * 0.73, rayOuter * 0.73]
          ];
          ctx.beginPath();
          for (const [x1, y1, x2, y2] of rays) {
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
          }
          ctx.stroke();
          ctx.restore();
        };

        drawSun(35, 35, 8, 12, 17, 1.0);
        drawSun(88, 80, 7, 11, 16, 0.65);

        ctx.globalAlpha = 0.5;
        ctx.stroke(new Path2D('M 85 24 Q 92 18 98 24'));
        ctx.beginPath();
        ctx.arc(20, 85, 1.5, 0, Math.PI * 2);
        ctx.arc(68, 92, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(65, 18, 1.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    },

    'doodle-music': {
      width: 120,
      height: 120,
      lineWidth: 1.8,
      render(ctx) {
        ctx.save();

        // Eighth note
        ctx.beginPath();
        ctx.arc(28, 38, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke(new Path2D('M 32 38 L 32 20 C 32 20 40 20 40 28'));

        // Double note
        ctx.beginPath();
        ctx.arc(78, 88, 4, 0, Math.PI * 2);
        ctx.arc(98, 84, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke(new Path2D('M 82 88 L 82 66 L 102 62 L 102 84'));
        ctx.stroke(new Path2D('M 82 72 L 102 68'));

        // Soundwaves
        ctx.globalAlpha = 0.6;
        ctx.stroke(new Path2D('M 85 24 Q 92 28 85 34'));
        ctx.globalAlpha = 0.4;
        ctx.stroke(new Path2D('M 89 20 Q 98 28 89 38'));

        // Sparkle
        ctx.globalAlpha = 0.6;
        ctx.stroke(new Path2D('M 28 85 L 28 93 M 24 89 L 32 89'));

        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(58, 55, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    },

    'doodle-botanical': {
      width: 120,
      height: 120,
      lineWidth: 1.8,
      render(ctx, color) {
        ctx.save();

        // Stem & leaves
        ctx.stroke(new Path2D('M 30 50 Q 35 30 45 20'));
        ctx.save();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.15;
        ctx.fill(new Path2D('M 38 32 C 45 28 48 35 38 36 Z'));
        ctx.fill(new Path2D('M 34 40 C 26 38 27 46 34 44 Z'));
        ctx.restore();

        // Flower
        ctx.beginPath();
        ctx.arc(85, 75, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.75;
        const petals = [
          [85, 66, 85, 71],
          [85, 79, 85, 84],
          [76, 75, 81, 75],
          [89, 75, 94, 75],
          [78, 68, 82, 72],
          [88, 78, 92, 82],
          [78, 82, 82, 78],
          [88, 72, 92, 68]
        ];
        ctx.beginPath();
        for (const [x1, y1, x2, y2] of petals) {
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
        }
        ctx.stroke();

        // Twig
        ctx.globalAlpha = 0.6;
        ctx.stroke(new Path2D('M 75 25 Q 90 28 95 38'));
        ctx.beginPath();
        ctx.arc(95, 38, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(22, 85, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    },

    'doodle-geometric': {
      width: 100,
      height: 100,
      lineWidth: 1.6,
      render(ctx) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.stroke(new Path2D('M 20 20 L 35 20 L 35 35 L 20 35 Z'));

        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(75, 25, 8, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = 0.6;
        ctx.stroke(new Path2D('M 25 75 L 35 60 L 45 75 Z'));

        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(65, 70);
        ctx.lineTo(85, 70);
        ctx.stroke();

        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.moveTo(70, 78);
        ctx.lineTo(80, 78);
        ctx.stroke();

        ctx.restore();
      }
    }
  };
}
