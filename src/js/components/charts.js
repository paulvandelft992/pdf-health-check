/**
 * SVG chart components — Adobe Spectrum design language
 *
 * Spec sources:
 *   spectrum.adobe.com/page/axis/
 *   spectrum.adobe.com/page/bar-chart/
 *   spectrum.adobe.com/page/donut-chart/
 *   spectrum.adobe.com/page/line-chart/
 *   spectrum.adobe.com/page/area-chart/
 *   spectrum.adobe.com/page/big-number/
 */
const Charts = (() => {

  // ── Spectrum categorical palette (16-stop, light theme) ─────────────────
  const CAT = [
    'rgb(15,181,174)',   // 100 — seafoam teal   (default series 1)
    'rgb(64,70,202)',    // 200 — indigo
    'rgb(246,133,17)',   // 300 — orange
    'rgb(222,61,130)',   // 400 — magenta
    'rgb(126,132,250)',  // 500 — periwinkle
    'rgb(20,122,243)',   // 700 — blue
    'rgb(115,38,211)',   // 800 — purple
    'rgb(232,198,0)',    // 900 — yellow
    'rgb(203,93,0)',     // 1000 — burnt orange
    'rgb(0,143,93)',     // 1100 — green
  ];

  // ── Spectrum gray tokens — CSS vars so charts adapt to dark mode ────────
  // SVG presentation attributes honour CSS custom properties when the SVG is
  // inline in the document (which it always is here — rendered via innerHTML).
  const G200 = 'var(--gray-200)'; // grid lines / track ring
  const G300 = 'var(--gray-300)'; // tick marks
  const G700 = 'var(--gray-700)'; // secondary labels, axis tick labels
  const G800 = 'var(--gray-800)'; // primary labels, legend text

  // ── Typography ───────────────────────────────────────────────────────────
  // adobe-clean with full Spectrum fallback stack
  const FONT = "'adobe-clean','Source Sans Pro',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
  const TICK_SIZE  = 11;  // axis tick label font-size (px)
  const LABEL_SIZE = 12;  // annotation / legend font-size (px)
  const ANNOT_SIZE = 11;  // bar data-label font-size (px)

  // ── Bar constants ────────────────────────────────────────────────────────
  const CORNER_R   = 6;   // bar corner radius (px)
  const PAD_RATIO  = 0.4; // gap between bars as fraction of band width

  // ── Line / Area constants ────────────────────────────────────────────────
  const LINE_W  = 2;   // stroke-width (Spectrum S1 = 2px, S2 = 2.5px)
  const POINT_R = 3;   // data-point marker radius
  // Area fills use per-render SVG gradients instead of a flat opacity so
  // overlapping series stay visually distinct. See vbar() below.

  // ── Donut constants ──────────────────────────────────────────────────────
  const HOLE_RATIO         = 0.85; // inner-radius / outer-radius (Spectrum default)
  const SUMMARY_RATIO      = 0.35; // center-label font-size = innerR * this
  const SUMMARY_MIN_FONT   = 28;   // px
  const SUMMARY_MAX_FONT   = 60;   // px
  const SUMMARY_MIN_RADIUS = 45;   // hide summary when innerR < this

  // ── Score-ring semantic colours (not categorical — semantic) ────────────
  const CLR_GOOD = '#2D9D78';
  const CLR_WARN = '#E68619';
  const CLR_POOR = '#E34850';

  // ────────────────────────────────────────────────────────────────────────
  // Shared floating tooltip
  // ────────────────────────────────────────────────────────────────────────

  let _tip = null;

  function ensureTip() {
    if (_tip && document.body.contains(_tip)) return _tip;
    _tip = document.createElement('div');
    _tip.id = 'charts-tooltip';
    _tip.style.cssText = [
      'position:fixed',
      'background:rgba(24,24,24,.93)',
      'color:#fff',
      'font-size:12px',
      'font-family:' + FONT,
      'line-height:1.55',
      'padding:7px 11px',
      'border-radius:7px',
      'pointer-events:none',
      'z-index:9999',
      'opacity:0',
      'transition:opacity .1s ease',
      'box-shadow:0 2px 10px rgba(0,0,0,.28)',
      'max-width:240px',
      'white-space:normal',
    ].join(';');
    document.body.appendChild(_tip);
    return _tip;
  }

  function showTip(html, x, y) {
    const tip = ensureTip();
    tip.innerHTML = html;
    tip.style.opacity = '1';
    _positionTip(x, y);
  }

  function moveTip(x, y) {
    if (!_tip) return;
    _positionTip(x, y);
  }

  function hideTip() {
    if (_tip) _tip.style.opacity = '0';
  }

  function _positionTip(x, y) {
    const tip    = ensureTip();
    const margin = 14;
    const tw     = tip.offsetWidth  || 160;
    const th     = tip.offsetHeight || 36;
    const vw     = window.innerWidth;
    const vh     = window.innerHeight;
    let left = x + margin;
    let top  = y - th / 2;
    if (left + tw > vw - 8) left = x - tw - margin;
    if (top < 4)            top  = 4;
    if (top + th > vh - 4)  top  = vh - th - 4;
    tip.style.left = left + 'px';
    tip.style.top  = top  + 'px';
  }

  /** Bind mouse events to an SVG element to show a tooltip */
  function bindTip(el, html) {
    el.addEventListener('mouseenter', e => showTip(html, e.clientX, e.clientY));
    el.addEventListener('mousemove',  e => moveTip(e.clientX, e.clientY));
    el.addEventListener('mouseleave', hideTip);
    el.style.cursor = 'default';
  }

  /** Create a namespaced SVG element */
  function svgEl(tag) {
    return document.createElementNS('http://www.w3.org/2000/svg', tag);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────────

  /** Resolve a series colour: explicit override → categorical palette → fallback */
  function seriesColor(override, index) {
    return override || CAT[index % CAT.length];
  }

  /**
   * Rounded-top bar path (Spectrum bars have rounded top corners only).
   * Falls back to a full rounded rect when the bar height ≤ 2 × corner radius.
   */
  function topRoundedBar(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    if (h <= 0) return '';
    if (h <= r * 2) {
      // Too short for top-only rounding — use full rounded rect
      return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"
                    rx="${r}" ry="${r}" fill="inherit"/>`;
    }
    // Top-rounded path (bottom is square, joining the axis baseline cleanly)
    return `<path d="
      M ${f(x)},${f(y + h)}
      L ${f(x)},${f(y + r)}
      Q ${f(x)},${f(y)} ${f(x + r)},${f(y)}
      L ${f(x + w - r)},${f(y)}
      Q ${f(x + w)},${f(y)} ${f(x + w)},${f(y + r)}
      L ${f(x + w)},${f(y + h)}
      Z" fill="inherit"/>`;
  }

  /**
   * Catmull-Rom spline through a point array → SVG path string.
   * tension = 0 → straight segments, 0.5 → full Catmull-Rom.
   */
  function splinePath(pts, tension = 0.35) {
    if (!pts.length) return '';
    if (pts.length === 1) return `M${f(pts[0].x)},${f(pts[0].y)}`;
    if (pts.length === 2) return `M${f(pts[0].x)},${f(pts[0].y)} L${f(pts[1].x)},${f(pts[1].y)}`;
    let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;
      d += ` C${f(cp1x)},${f(cp1y)} ${f(cp2x)},${f(cp2y)} ${f(p2.x)},${f(p2.y)}`;
    }
    return d;
  }

  /** Fixed-precision float string */
  function f(n) { return n.toFixed(1); }

  /** Axis tick formatter: abbreviate large numbers */
  function tickFmt(v) {
    if (Math.abs(v) >= 1000000) return (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (Math.abs(v) >= 1000)    return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(v);
  }

  /** Rounded-square legend symbol (Spectrum legend symbol shape) */
  function legendSymbol(x, y, size, color) {
    const r = Math.round(size * 0.3); // ~30% corner radius → rounded square
    return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}" ry="${r}" fill="${color}"/>`;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Shared axis / grid renderer
  // ────────────────────────────────────────────────────────────────────────
  /**
   * Returns SVG markup for:
   *  - Horizontal grid lines (gray-200)
   *  - Y-axis tick labels (right-aligned, gray-700)
   *  - X-axis tick labels (centred, gray-700)
   * No domain line is drawn (Spectrum default: domain: false).
   */
  function buildAxis({ padL, padT, padB, chartW, chartH, height, labels, maxVal, tickCount = 4 }) {
    // Y grid + labels
    const gridSvg = Array.from({ length: tickCount + 1 }, (_, i) => {
      const val = maxVal - (maxVal / tickCount) * i;
      const y   = padT + (i / tickCount) * chartH;
      return `
        <line x1="${f(padL)}" x2="${f(padL + chartW)}" y1="${f(y)}" y2="${f(y)}"
              stroke="${G200}" stroke-width="1" shape-rendering="crispEdges"/>
        <text x="${f(padL - 8)}" y="${f(y)}" text-anchor="end" dominant-baseline="middle"
              font-size="${TICK_SIZE}" fill="${G700}" font-family="${FONT}">${tickFmt(Math.round(val))}</text>`;
    }).join('');

    // X labels — rotate when labels are too dense to fit horizontally, then
    // thin out to only as many labels as actually fit without overlapping.
    const groupW  = chartW / Math.max(labels.length, 1);
    const maxLblW = Math.max(...labels.map(l => _measureText(String(l), TICK_SIZE)), 1);
    const angled  = maxLblW + 4 > groupW; // rotate -45° when labels would overlap

    // How many labels fit given the chosen orientation?
    // Angled -45°: projected horizontal footprint per label ≈ maxLblW × cos45 ≈ maxLblW × 0.71
    // Add a small gap (4 px) between consecutive label footprints.
    const footprint = angled ? maxLblW * 0.71 + 4 : maxLblW + 4;
    const maxFit    = Math.max(1, Math.floor(chartW / footprint));
    // Compute a skip step so we never render more labels than fit.
    // Always show first and last; fill intermediate slots evenly.
    const step      = Math.ceil(labels.length / maxFit);

    const xLblSvg = labels.map((lbl, i) => {
      // Only render at regular intervals; always include the last label.
      if (step > 1 && i % step !== 0 && i !== labels.length - 1) return '';
      const x = padL + i * groupW + groupW / 2;
      const y = padT + chartH + (angled ? 8 : 14);
      if (angled) {
        return `<text x="${f(x)}" y="${f(y)}" text-anchor="end"
                font-size="${TICK_SIZE}" fill="${G700}" font-family="${FONT}"
                transform="rotate(-45,${f(x)},${f(y)})">${lbl}</text>`;
      }
      return `<text x="${f(x)}" y="${f(y)}" text-anchor="middle"
              dominant-baseline="hanging" font-size="${TICK_SIZE}" fill="${G700}"
              font-family="${FONT}">${lbl}</text>`;
    }).join('');

    return gridSvg + xLblSvg;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Legend renderer (bottom-positioned, Spectrum spec)
  // ────────────────────────────────────────────────────────────────────────
  function buildLegend(datasets, yOffset, padL) {
    const SYM  = 10; // symbol size
    const GAP  = 6;  // gap between symbol and text
    const COL  = 96; // column width per item
    return datasets.map((ds, di) => {
      const color = seriesColor(ds.color, di);
      const lx    = padL + di * COL;
      return legendSymbol(lx, yOffset + 1, SYM, color) +
        `<text x="${f(lx + SYM + GAP)}" y="${f(yOffset + SYM - 1)}"
               font-size="${LABEL_SIZE}" fill="${G800}" font-family="${FONT}"
               dominant-baseline="auto">${ds.label || ''}</text>`;
    }).join('');
  }

  // ────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Donut chart
   * Spectrum spec: holeRatio = 0.85, startAngle = 0 (12 o'clock),
   * centre summary font-size = 35 % of innerRadius (clamped 28–60 px).
   *
   * @param {HTMLElement} container
   * @param {{ segments: {value,color?,label?}[], size?: number,
   *           label?: string, sublabel?: string }} opts
   */
  function donut(container, { segments, size = 140, label = '', sublabel = '' }) {
    const cx     = size / 2;
    const outerR = cx - 2;              // 2 px gap → selection ring affordance
    const innerR = outerR * HOLE_RATIO;
    const strokeW = outerR - innerR;
    const midR   = innerR + strokeW / 2;
    const circ   = 2 * Math.PI * midR;
    const total  = segments.reduce((s, v) => s + (v.value || 0), 0) || 1;

    // Centre summary typography (Spectrum: 35 % of innerR, clamped)
    const sumFS = Math.min(SUMMARY_MAX_FONT, Math.max(SUMMARY_MIN_FONT, Math.round(innerR * SUMMARY_RATIO)));
    const subFS = Math.max(9, Math.round(sumFS * 0.42));

    // Arc segments — rotate so first segment starts at 12 o'clock (−90°)
    let cumulative = 0;
    const arcs = segments.map((seg, i) => {
      const pct  = (seg.value || 0) / total;
      const dash = pct * circ;
      const gap  = circ - dash;
      const offset = -(cumulative / total) * circ;
      cumulative += seg.value || 0;
      return `<circle cx="${cx}" cy="${cx}" r="${f(midR)}"
        fill="none"
        stroke="${seriesColor(seg.color, i)}"
        stroke-width="${f(strokeW)}"
        stroke-dasharray="${f(dash)} ${f(gap)}"
        stroke-dashoffset="${f(offset)}"
        transform="rotate(-90 ${cx} ${cx})"
        stroke-linecap="butt"/>`;
    }).join('');

    // Track ring (unfilled background)
    const track = `<circle cx="${cx}" cy="${cx}" r="${f(midR)}"
      fill="none" stroke="${G200}" stroke-width="${f(strokeW)}"/>`;

    // Centre summary (hidden when inner radius too small per spec)
    let centre = '';
    if (label && innerR >= SUMMARY_MIN_RADIUS) {
      const valY = sublabel ? cx - sumFS * 0.28 : cx;
      centre = `
        <text x="${cx}" y="${f(valY)}" text-anchor="middle" dominant-baseline="middle"
              font-size="${sumFS}" font-weight="bold" fill="${G800}"
              font-family="${FONT}">${label}</text>`;
      if (sublabel) {
        centre += `
        <text x="${cx}" y="${f(cx + sumFS * 0.55)}" text-anchor="middle"
              dominant-baseline="middle" font-size="${subFS}" fill="${G700}"
              font-family="${FONT}">${sublabel}</text>`;
      }
    }

    container.innerHTML = `
      <svg viewBox="0 0 ${size} ${size}"
           style="width:${size}px;height:${size}px;display:block;overflow:visible">
        ${track}
        ${arcs}
        ${centre}
      </svg>`;

    // ── Hover tooltips: transparent pie-sector paths per segment ─────────
    const svg = container.querySelector('svg');
    let cumAngle = -Math.PI / 2; // 12 o'clock
    segments.forEach((seg, i) => {
      const pct      = (seg.value || 0) / total;
      const angle    = pct * 2 * Math.PI;
      const endAngle = cumAngle + angle;
      if (angle < 0.001) { cumAngle = endAngle; return; } // skip zero segments

      // Compute sector corners (outer then inner arc)
      const sinS = Math.sin(cumAngle), cosS = Math.cos(cumAngle);
      const sinE = Math.sin(endAngle), cosE = Math.cos(endAngle);
      const x1 = cx + outerR * cosS, y1 = cx + outerR * sinS;
      const x2 = cx + outerR * cosE, y2 = cx + outerR * sinE;
      const x3 = cx + innerR * cosE, y3 = cx + innerR * sinE;
      const x4 = cx + innerR * cosS, y4 = cx + innerR * sinS;
      const large = angle > Math.PI ? 1 : 0;

      const path = svgEl('path');
      path.setAttribute('d',
        `M${f(x1)},${f(y1)}` +
        ` A${f(outerR)},${f(outerR)},0,${large},1,${f(x2)},${f(y2)}` +
        ` L${f(x3)},${f(y3)}` +
        ` A${f(innerR)},${f(innerR)},0,${large},0,${f(x4)},${f(y4)}` +
        ' Z'
      );
      path.setAttribute('fill', 'transparent');

      const pctStr = Math.round(pct * 100) + '%';
      const tipHtml = seg.label
        ? `<strong>${seg.label}</strong>: ${tickFmt(seg.value)} <span style="opacity:.75">(${pctStr})</span>`
        : `${tickFmt(seg.value)} <span style="opacity:.75">(${pctStr})</span>`;

      bindTip(path, tipHtml);
      svg.appendChild(path);
      cumAngle = endAngle;
    });
    _addCopyBtn(container);
  }

  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Horizontal bar chart
   * Spectrum spec: corner-radius = 6 px, no axis domain line,
   * grid lines = gray-200, label colour = gray-800 at 12 px.
   *
   * @param {HTMLElement} container
   * @param {{ items: {label,value,color?}[], max: number,
   *           height?: number, gap?: number }} opts
   */
  // Measure the rendered pixel width of a text string at a given font-size.
  // Uses a temporary off-screen SVG text node; result is cached by content.
  const _textWidthCache = new Map();
  function _measureText(str, fontSize) {
    const key = `${fontSize}:${str}`;
    if (_textWidthCache.has(key)) return _textWidthCache.get(key);
    try {
      const ns  = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('style', 'position:absolute;visibility:hidden;pointer-events:none');
      const txt = document.createElementNS(ns, 'text');
      txt.setAttribute('font-size', String(fontSize));
      txt.setAttribute('font-family', FONT);
      txt.textContent = str;
      svg.appendChild(txt);
      document.body.appendChild(svg);
      const w = txt.getComputedTextLength();
      document.body.removeChild(svg);
      _textWidthCache.set(key, w);
      return w;
    } catch {
      // Fallback: ~6px per character at 12px font
      return str.length * fontSize * 0.52;
    }
  }

  function hbar(container, { items, max, height = 22, gap = 12 }) {
    if (!items || !items.length) { container.innerHTML = ''; return; }

    const w = container.clientWidth || 320;

    // Measure each label so nothing clips — cap at 45% of total width
    const maxLabelPx = items.reduce((mx, item) =>
      Math.max(mx, _measureText(item.label, LABEL_SIZE)), 0);
    // ×1.3 + 24 px safety: adobe-clean (webfont) is wider than the system-font
    // fallback active during getComputedTextLength(), so the raw measurement
    // underestimates. Without this buffer the first character gets clipped by
    // the SVG's overflow:hidden viewport edge.
    const labelW  = Math.min(Math.ceil(maxLabelPx * 1.3) + 24, Math.floor(w * 0.55));
    const valueW  = 40;
    const barArea = Math.max(10, w - labelW - valueW - 4);
    const totalH  = items.length * (height + gap) - gap;
    const rx      = Math.min(CORNER_R, height / 2);

    const rows = items.map((item, i) => {
      const barW  = Math.max(rx * 2, (item.value / (max || 1)) * barArea);
      const y     = i * (height + gap);
      const color = seriesColor(item.color, i);
      const valLbl = max === 100 ? `${item.value}%` : tickFmt(item.value);

      // Top-rounded horizontal bar (Spectrum: rounded leading edge)
      const barPath = barW <= rx * 2
        ? `<rect x="${f(labelW)}" y="${f(y)}" width="${f(barW)}" height="${f(height)}"
                 rx="${rx}" ry="${rx}" fill="${color}"/>`
        : `<path d="
            M ${f(labelW)},${f(y)}
            L ${f(labelW + barW - rx)},${f(y)}
            Q ${f(labelW + barW)},${f(y)} ${f(labelW + barW)},${f(y + rx)}
            L ${f(labelW + barW)},${f(y + height - rx)}
            Q ${f(labelW + barW)},${f(y + height)} ${f(labelW + barW - rx)},${f(y + height)}
            L ${f(labelW)},${f(y + height)}
            Z" fill="${color}"/>`;

      return `
        <text x="${f(labelW - 8)}" y="${f(y + height / 2)}" text-anchor="end"
              dominant-baseline="middle" font-size="${LABEL_SIZE}" fill="${G700}"
              font-family="${FONT}">${item.label}</text>
        ${barPath}
        <text x="${f(labelW + barW + 8)}" y="${f(y + height / 2)}" dominant-baseline="middle"
              font-size="${LABEL_SIZE}" fill="${G700}" font-family="${FONT}"
              font-weight="normal">${valLbl}</text>`;
    }).join('');

    container.innerHTML = `
      <svg viewBox="0 0 ${w} ${totalH}"
           style="width:100%;height:${totalH}px;display:block;overflow:hidden">
        ${rows}
      </svg>`;

    // ── Hover tooltips: transparent overlay rect per row ─────────────────
    const svg = container.querySelector('svg');
    items.forEach((item, i) => {
      const y      = i * (height + gap);
      const valLbl = max === 100 ? `${item.value}%` : tickFmt(item.value);
      const tipHtml = `<strong>${item.label}</strong>: ${valLbl}`;

      const rect = svgEl('rect');
      rect.setAttribute('x',      '0');
      rect.setAttribute('y',      String(y - 2));
      rect.setAttribute('width',  String(w));
      rect.setAttribute('height', String(height + 4));
      rect.setAttribute('fill',   'transparent');
      bindTip(rect, tipHtml);
      svg.appendChild(rect);
    });
    _addCopyBtn(container);
  }

  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Vertical chart — supports type: 'bar' | 'line' | 'area'
   *
   * Bar (Spectrum spec):
   *   corner-radius = 6 px (top corners only), padding-ratio = 0.4,
   *   no axis domain line, horizontal grid = gray-200.
   *
   * Line (Spectrum spec):
   *   stroke-width = 2 px, smooth Catmull-Rom spline, small point markers,
   *   categorical fill colour.
   *
   * Area (Spectrum spec):
   *   fill-opacity = 0.8, line stroke on top at 2 px.
   *
   * @param {HTMLElement} container
   * @param {{ labels: string[], datasets: {label,data,color?}[],
   *           height?: number, type?: 'bar'|'line'|'area' }} opts
   */
  function vbar(container, { labels, datasets, height = 200, type = 'bar' }) {
    if (!labels || !datasets) { container.innerHTML = ''; return; }

    const w      = container.clientWidth || 420;
    const padL   = 40;
    const padR   = 14;
    const padT   = 12;
    // When many labels are present they will be angled -45°; give them more
    // vertical room so the rotated text doesn't get clipped by the SVG edge.
    const _sampleLblW = Math.max(...labels.map(l => _measureText(String(l), TICK_SIZE)), 1);
    const _groupW     = (w - padL - padR) / Math.max(labels.length, 1);
    const _willAngle  = _sampleLblW + 4 > _groupW;
    const padB   = _willAngle ? Math.min(62, Math.ceil(_sampleLblW * 0.71) + 16) : 44;
    const legH   = datasets.length > 0 ? 20 : 0; // legend row height
    const svgH   = height + legH;

    const chartW = w - padL - padR;
    const chartH = height - padT - padB;
    const n      = labels.length || 1;
    const groupW = chartW / n;

    // Exclude null/undefined values from scale so gaps don't collapse the axis
    const allVals = datasets.flatMap(d => (d.data || []).filter(v => typeof v === 'number'));
    const maxVal  = Math.max(...allVals, 1);

    // ── Axis & grid ─────────────────────────────────────────────────────
    const axisSvg = buildAxis({ padL, padT, padB, chartW, chartH, height, labels, maxVal });

    // ── Series visuals ───────────────────────────────────────────────────
    let seriesSvg = '';

    // Variables needed by both render & tooltip phases
    let bandUsed, perBarW, barW, groupOff;

    if (type === 'bar') {
      // Spectrum bar: each band = groupW, bars occupy (1 − PAD_RATIO) of band
      bandUsed  = groupW * (1 - PAD_RATIO);
      perBarW   = bandUsed / Math.max(datasets.length, 1);
      barW      = Math.min(perBarW - 2, 48);
      groupOff  = (groupW - datasets.length * barW - (datasets.length - 1) * 2) / 2;

      seriesSvg = datasets.map((ds, di) => {
        const color = seriesColor(ds.color, di);
        return (ds.data || []).map((val, i) => {
          const barH = Math.max(0, (val / maxVal) * chartH);
          const x    = padL + i * groupW + groupOff + di * (barW + 2);
          const y    = padT + chartH - barH;
          const rx   = Math.min(CORNER_R, barW / 2, barH);
          if (barH < 1) return '';
          return `<g fill="${color}">${topRoundedBar(x, y, barW, barH, rx)}</g>`;
        }).join('');
      }).join('');

    } else {
      // Line or Area — draw areas first (behind lines), then lines + points.
      // null data values produce a y of null; these become visual gaps in the
      // line so absent data (e.g. no score yet) is clearly distinguishable
      // from a real zero.
      const baseY = padT + chartH;

      const pointSets = datasets.map(ds =>
        (ds.data || []).map((val, i) => ({
          x: padL + i * groupW + groupW / 2,
          y: (val !== null && val !== undefined && typeof val === 'number')
             ? padT + chartH - (val / maxVal) * chartH
             : null,
        }))
      );

      // Split a point array into contiguous non-null runs (≥ 2 points each)
      // so we can draw each run as an independent path segment.
      function nonNullSegs(pts) {
        const segs = [];
        let cur = [];
        for (const p of pts) {
          if (p.y === null) { if (cur.length >= 2) segs.push(cur); cur = []; }
          else cur.push(p);
        }
        if (cur.length >= 2) segs.push(cur);
        return segs;
      }

      // Unique ID prefix for SVG gradient elements (multiple charts per page)
      const uid = Math.random().toString(36).slice(2, 8);

      // ── Area gradient fills (drawn behind lines) ────────────────────────
      if (type === 'area') {
        // Gradient opacity: lower when multiple series overlap so colours stay
        // distinct. Single series gets a fuller fill for visual weight.
        const topOp = datasets.length > 1 ? 0.22 : 0.40;

        const gradDefs = datasets.map((ds, di) => {
          const color = seriesColor(ds.color, di);
          return `<linearGradient id="ag-${uid}-${di}" x1="0" y1="${padT}"
                    x2="0" y2="${baseY}" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stop-color="${color}" stop-opacity="${topOp}"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
          </linearGradient>`;
        }).join('');
        seriesSvg += `<defs>${gradDefs}</defs>`;

        seriesSvg += datasets.map((ds, di) =>
          nonNullSegs(pointSets[di]).map(pts => {
            const line = splinePath(pts);
            const area = `${line} L${f(pts[pts.length-1].x)},${f(baseY)} L${f(pts[0].x)},${f(baseY)} Z`;
            return `<path d="${area}" fill="url(#ag-${uid}-${di})" stroke="none"/>`;
          }).join('')
        ).join('');
      }

      // ── Lines + data-point markers ──────────────────────────────────────
      seriesSvg += datasets.map((ds, di) => {
        const segs  = nonNullSegs(pointSets[di]);
        if (!segs.length) return '';
        const color = seriesColor(ds.color, di);
        return segs.map(pts => {
          const line = splinePath(pts);
          let out = `<path d="${line}" fill="none" stroke="${color}"
                          stroke-width="${LINE_W}" stroke-linecap="round"
                          stroke-linejoin="round"/>`;
          // Dot markers — skip when there are many points (becomes visual clutter)
          if (labels.length <= 36) {
            out += pts.map(p =>
              `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${POINT_R}"
                       fill="${color}" stroke="white" stroke-width="1.5"/>`
            ).join('');
          }
          return out;
        }).join('');
      }).join('');
    }

    // ── Legend (bottom, Spectrum: bottom-positioned, 14 px, normal weight) ─
    const legendSvg = buildLegend(datasets, height + 4, padL);

    container.innerHTML = `
      <svg viewBox="0 0 ${w} ${svgH}"
           style="width:100%;height:${svgH}px;display:block;overflow:visible">
        ${axisSvg}
        ${seriesSvg}
        ${legendSvg}
      </svg>`;

    // ── Hover tooltips ───────────────────────────────────────────────────
    const svg = container.querySelector('svg');

    if (type === 'bar') {
      // Transparent hit rect per individual bar
      datasets.forEach((ds, di) => {
        (ds.data || []).forEach((val, i) => {
          const barH = Math.max(0, (val / maxVal) * chartH);
          if (barH < 1) return;
          const x  = padL + i * groupW + groupOff + di * (barW + 2);
          const y  = padT + chartH - barH;
          const tipHtml = datasets.length > 1
            ? `<strong>${labels[i]}</strong><br>${ds.label || ''}: ${tickFmt(val)}`
            : `<strong>${labels[i]}</strong>: ${tickFmt(val)}`;

          const rect = svgEl('rect');
          rect.setAttribute('x',      f(x));
          rect.setAttribute('y',      f(y));
          rect.setAttribute('width',  f(barW));
          rect.setAttribute('height', f(barH));
          rect.setAttribute('fill',   'transparent');
          bindTip(rect, tipHtml);
          svg.appendChild(rect);
        });
      });

    } else {
      // Line / area — vertical crosshair + band hit rects
      const crosshair = svgEl('line');
      crosshair.setAttribute('y1',           String(padT));
      crosshair.setAttribute('y2',           String(padT + chartH));
      crosshair.setAttribute('stroke',       'rgba(0,0,0,.25)');
      crosshair.setAttribute('stroke-width', '1');
      crosshair.setAttribute('stroke-dasharray', '4 3');
      crosshair.style.display = 'none';
      svg.appendChild(crosshair);

      labels.forEach((lbl, i) => {
        const bx      = padL + i * groupW;
        const xCenter = bx + groupW / 2;

        // Build tooltip body: label + all series values at this x-band
        const lines = datasets.map(ds => {
          const val = (ds.data || [])[i];
          return val != null
            ? `${ds.label ? `<span style="opacity:.75">${ds.label}:</span> ` : ''}<strong>${tickFmt(val)}</strong>`
            : null;
        }).filter(Boolean);
        const tipHtml = `<strong>${lbl}</strong><br>${lines.join('<br>')}`;

        const rect = svgEl('rect');
        rect.setAttribute('x',      f(bx));
        rect.setAttribute('y',      f(padT));
        rect.setAttribute('width',  f(groupW));
        rect.setAttribute('height', f(chartH));
        rect.setAttribute('fill',   'transparent');
        rect.style.cursor = 'default';

        rect.addEventListener('mouseenter', e => {
          crosshair.setAttribute('x1', f(xCenter));
          crosshair.setAttribute('x2', f(xCenter));
          crosshair.style.display = '';
          showTip(tipHtml, e.clientX, e.clientY);
        });
        rect.addEventListener('mousemove',  e => moveTip(e.clientX, e.clientY));
        rect.addEventListener('mouseleave', () => {
          crosshair.style.display = 'none';
          hideTip();
        });
        svg.appendChild(rect);
      });
    }
    _addCopyBtn(container);
  }

  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Score ring — custom component for health score display.
   * Uses semantic colours (not categorical) and a slightly fatter ring
   * than the Spectrum donut for readability at small sizes.
   *
   * @param {number}  score   0–100
   * @param {number}  size    diameter in px
   * @param {object}  [opts]
   * @param {boolean} [opts.invert]  When true the colour logic is inverted:
   *                                 low score = green, high score = red.
   *                                 Use for "risk" or "error-rate" metrics.
   * @returns {string}        SVG string (for innerHTML injection)
   */
  function scoreRing(score, size = 60, opts = {}) {
    let col, label;
    if (opts.invert) {
      col   = score === 0 ? CLR_GOOD : score <= 10 ? CLR_WARN : CLR_POOR;
      label = score === 0 ? 'No risk' : score <= 10 ? 'Low risk' : 'High risk';
    } else {
      col   = score >= 75 ? CLR_GOOD : score >= 50 ? CLR_WARN : CLR_POOR;
      label = score >= 75 ? 'Good' : score >= 50 ? 'Needs Attention' : 'At Risk';
    }
    const cx     = size / 2;
    // Slightly fatter ring (hole = 70 % instead of 85 %) for small display sizes
    const outerR = cx - 2;
    const innerR = outerR * 0.80;
    const strokeW = outerR - innerR;
    const midR   = innerR + strokeW / 2;
    const circ   = 2 * Math.PI * midR;
    // For inverted (risk) rings the filled arc represents the flagged portion
    const fillFraction = opts.invert ? score / 100 : score / 100;
    const filled = fillFraction * circ;
    const fs     = Math.min(SUMMARY_MAX_FONT, Math.max(SUMMARY_MIN_FONT * 0.6, Math.round(size * 0.24)));
    const ariaLabel = opts.invert
      ? `PII exposure rate: ${score}% — ${label}`
      : `Health score: ${score}/100 — ${label}`;

    return `
      <svg viewBox="0 0 ${size} ${size}"
           style="width:${size}px;height:${size}px;display:block"
           role="img" aria-label="${ariaLabel}">
        <title>${ariaLabel}</title>
        <!-- Track ring -->
        <circle cx="${cx}" cy="${cx}" r="${f(midR)}"
                fill="none" stroke="${G200}" stroke-width="${f(strokeW)}"/>
        <!-- Filled arc — starts at 12 o'clock (rotate −90°) -->
        <circle cx="${cx}" cy="${cx}" r="${f(midR)}"
                fill="none" stroke="${col}" stroke-width="${f(strokeW)}"
                stroke-dasharray="${f(filled)} ${f(circ - filled)}"
                stroke-dashoffset="${f(circ / 4)}"
                transform="rotate(-90 ${cx} ${cx})"
                stroke-linecap="butt"/>
        <!-- Value label -->
        <text x="${cx}" y="${cx}" text-anchor="middle" dominant-baseline="middle"
              font-size="${fs}" font-weight="bold" fill="${col}"
              font-family="${FONT}">${score}${opts.invert ? '%' : ''}</text>
      </svg>`;
  }

  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Big-number display (Spectrum "big number" component).
   * Renders a large metric value with an optional sub-label and an optional
   * mini sparkline (area type) beneath.
   *
   * @param {HTMLElement} container
   * @param {{ value: string|number, label?: string,
   *           trend?: {labels,data,color?} }} opts
   */
  function bigNumber(container, { value, label = '', trend = null }) {
    const w      = container.clientWidth || 160;
    const valFS  = Math.min(52, Math.max(28, Math.round(w * 0.28)));
    const lblFS  = 12;
    const valY   = valFS + 4;
    const lblY   = valY + lblFS + 4;
    const numH   = lblY + 4;

    // Sparkline rendered as a separate element so CSS ::after tooltips work
    let sparkHtml = '';
    if (trend && trend.data && trend.data.length > 1) {
      const color   = trend.color   || CAT[0];
      const tooltip = trend.tooltip || '';
      const spSvg   = sparkline(trend.data, { width: w, height: 36, color, filled: false });
      sparkHtml = tooltip
        ? `<div class="spark-tip" data-tip="${tooltip}" style="margin-top:6px">${spSvg}</div>`
        : `<div style="margin-top:6px">${spSvg}</div>`;
    }

    container.innerHTML = `
      <svg viewBox="0 0 ${w} ${numH}"
           style="width:100%;height:${numH}px;display:block;overflow:visible">
        <text x="0" y="${valY}" font-size="${valFS}" font-weight="bold"
              fill="${G800}" font-family="${FONT}">${value}</text>
        ${label ? `<text x="0" y="${lblY}" font-size="${lblFS}" fill="${G700}"
              font-family="${FONT}">${label}</text>` : ''}
      </svg>
      ${sparkHtml}`;
  }

  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Inline sparkline — returns an SVG *string* for embedding in template literals.
   * Renders a smooth area/line sparkline at the given size.
   *
   * @param {number[]} data
   * @param {{ width?,height?,color?,filled? }} opts
   * @returns {string} SVG markup
   */
  function sparkline(data, { width = 80, height = 28, color = 'currentColor', filled = false, tooltip = '' } = {}) {
    if (!data || data.length < 2) return '';
    const max   = Math.max(...data, 1);
    const min   = Math.min(...data);
    const range = (max - min) || 1;
    // 1 px vertical padding so the stroke isn't clipped
    const pts   = data.map((v, i) => ({
      x: (i / (data.length - 1)) * width,
      y: (height - 2) - ((v - min) / range) * (height - 4) + 1
    }));
    const line   = splinePath(pts, 0.3);
    const fillEl = filled
      ? `<path d="${line} L${f(pts[pts.length - 1].x)},${height} L0,${height} Z"
               fill="${color}" fill-opacity="0.15" stroke="none"/>`
      : '';
    const svg = `<svg viewBox="0 0 ${width} ${height}"
         style="width:${width}px;height:${height}px;display:block;overflow:visible"
         preserveAspectRatio="none">
      ${fillEl}
      <path d="${line}" fill="none" stroke="${color}" stroke-width="1.5"
            stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
    return tooltip
      ? `<span class="spark-tip" data-tip="${tooltip}" style="display:block">${svg}</span>`
      : svg;
  }

  // ── Copy-to-clipboard ─────────────────────────────────────────────────────

  // Replace var(--token) with computed values so the canvas renderer sees
  // real colours instead of literal "var(--gray-75)" which maps to black.
  function _resolveCssVars(str) {
    const cs = getComputedStyle(document.documentElement);
    return str.replace(/var\(--([^),\s]+)[^)]*\)/g, (_, name) =>
      cs.getPropertyValue('--' + name).trim() || '#888'
    );
  }

  // Convert the SVG inside a chart container to a PNG Blob (hi-DPI).
  function _svgToPng(container) {
    const svg = container.querySelector('svg');
    if (!svg) return Promise.resolve(null);

    const rect  = svg.getBoundingClientRect();
    const w     = Math.round(rect.width)  || svg.viewBox.baseVal.width  || 320;
    const h     = Math.round(rect.height) || svg.viewBox.baseVal.height || 200;
    const scale = Math.max(window.devicePixelRatio || 2, 2);
    const pad   = 20; // uniform breathing room

    let svgStr = new XMLSerializer().serializeToString(svg);
    svgStr = _resolveCssVars(svgStr);
    // Remove overflow:hidden so value labels to the right of bars don't clip.
    svgStr = svgStr.replace(/overflow\s*:\s*hidden/g, 'overflow:visible');

    // Expand the SVG viewport 20 px to the left so any label text that starts
    // at a slightly-negative SVG x-coordinate (hbar labels) is preserved when
    // the SVG is rasterised as a standalone <img> (Chromium clips at viewBox).
    const EXTRA_L = 20;
    svgStr = svgStr.replace(
      /viewBox="([-\d.]+)\s+([-\d.]+)\s+([\d.]+)\s+([\d.]+)"/,
      (_, x, y, vw, vh) => {
        const newX = parseFloat(x) - EXTRA_L;
        const newW = parseFloat(vw) + EXTRA_L;
        // Also pin explicit width/height so the browser uses our new dimensions.
        return `width="${newW}" height="${vh}" viewBox="${newX} ${y} ${newW} ${vh}"`;
      }
    );

    const imgW  = w + EXTRA_L;   // natural width of the expanded SVG image
    const dataUrl = 'data:image/svg+xml;base64,' +
      btoa(unescape(encodeURIComponent(svgStr)));

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // Extra right padding for hbar value labels beyond the bar area.
        const padR = 48;
        const cw = imgW + pad + padR;
        const ch = h + pad * 2;
        const canvas  = document.createElement('canvas');
        canvas.width  = cw * scale;
        canvas.height = ch * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, pad, pad, imgW, h);
        canvas.toBlob(resolve, 'image/png');
      };
      img.onerror = () => reject(new Error('SVG load failed'));
      img.src = dataUrl;
    });
  }

  // Icons for idle / success states
  const _ICON_COPY = `<svg viewBox="0 0 16 16" fill="none" style="width:13px;height:13px;display:block">
    <rect x="4.5" y="4.5" width="8" height="9" rx="1.2" stroke="currentColor" stroke-width="1.35"/>
    <path d="M3 11.5V3.75A1.25 1.25 0 0 1 4.25 2.5H10" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
  </svg>`;
  const _ICON_OK = `<svg viewBox="0 0 16 16" fill="none" style="width:13px;height:13px;display:block">
    <path d="M3 8.5l3.5 3.5L13 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  function _addCopyBtn(container) {
    if (!navigator.clipboard?.write) return;

    // For small containers (donuts are 140 × 140 px) the button would sit over
    // the chart. Attach to the nearest .card ancestor instead so it always
    // appears in the card's top-right corner. One button per host element.
    const isSmall = container.offsetWidth  <= 180 ||
                    container.offsetHeight <= 180;
    const host    = (isSmall && container.closest('.card')) || container;
    if (host.dataset.chartCopyAdded) return;
    host.dataset.chartCopyAdded = '1';

    host.classList.add('chart-has-copy');

    const btn = document.createElement('button');
    btn.className = 'chart-copy-btn';
    btn.innerHTML = _ICON_COPY;
    btn.setAttribute('aria-label', 'Copy chart as image');
    // Use the app's custom tooltip (same system as chart hover tips)
    bindTip(btn, 'Copy chart as image');

    btn.addEventListener('click', async e => {
      e.stopPropagation();
      hideTip();
      btn.disabled = true;
      try {
        const pngBlob = await _svgToPng(container);
        if (!pngBlob) throw new Error('No SVG found');
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
        btn.innerHTML = _ICON_OK;
        btn.style.opacity = '1';
        setTimeout(() => {
          btn.innerHTML = _ICON_COPY;
          btn.style.opacity = '';
          btn.disabled = false;
        }, 1800);
      } catch (err) {
        console.warn('Chart copy failed:', err);
        btn.disabled = false;
      }
    });

    host.appendChild(btn);
  }

  // ─────────────────────────────────────────────────────────────────────────
  return { donut, hbar, vbar, scoreRing, bigNumber, sparkline, CAT };
})();
