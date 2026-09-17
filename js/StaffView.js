class StaffView {
  constructor() {
    this.diatonicStepMap = {
      'C2': -14, 'D2': -13, 'E2': -12, 'F2': -11, 'G2': -10, 'A2': -9, 'B2': -8,
      'C3': -7,  'D3': -6,  'E3': -5,  'F3': -4,  'G3': -3,  'A3': -2, 'B3': -1,
      'C4': 0,   'D4': 1,   'E4': 2,   'F4': 3,   'G4': 4,   'A4': 5,  'B4': 6,
      'C5': 7,   'D5': 8,   'E5': 9,   'F5': 10,  'G5': 11,  'A5': 12, 'B5': 13,
      'C6': 14,  'D6': 15,  'E6': 16
    };

    this.pitchColors = [
      [240, 25, 25],    // C (Red)
      [250, 125, 0],    // D (Orange)
      [245, 205, 0],    // E (Yellow)
      [0, 195, 40],     // F (Green)
      [0, 115, 245],    // G (Electric Blue)
      [140, 0, 245],    // A (Purple)
      [235, 0, 200],    // B (Magenta)
    ];

    this.showRainbow = true;

    // Canonical, line-free musical notation SVG assets
    this.svgUrls = {
      trebleClef: '/guessTheNoteGame/resources/GClef.svg',
      bassClef: '/guessTheNoteGame/resources/FClef.svg',
      flat: '/guessTheNoteGame/resources/Flat.svg',
      sharp: '/guessTheNoteGame/resources/Sharp.svg'
    };
  }

  getPastelColor(stepIndex, factor = 0.68) {
    const noteIdx = ((stepIndex % 7) + 7) % 7;
    const base = this.pitchColors[noteIdx];
    const r = Math.round(base[0] + (255 - base[0]) * factor);
    const g = Math.round(base[1] + (255 - base[1]) * factor);
    const b = Math.round(base[2] + (255 - base[2]) * factor);
    return `rgb(${r}, ${g}, ${b})`;
  }

  getDarkLineColor(stepIndex) {
    const noteIdx = ((stepIndex % 7) + 7) % 7;
    const base = this.pitchColors[noteIdx];
    const r = Math.round(base[0] * 0.55 + 20 * 0.45);
    const g = Math.round(base[1] * 0.55 + 24 * 0.45);
    const b = Math.round(base[2] * 0.55 + 38 * 0.45);
    return `rgb(${r}, ${g}, ${b})`;
  }

  createStaffElement(clef, pitchName, accidental = '', options = {}) {
    const width = options.width || 380;
    const height = options.height || 140;
    const lineSpacing = 15;
    const staffTopY = 38;
    const staffBottomY = staffTopY + 4 * lineSpacing; // 98
    const startX = 22;
    const endX = width - 22;
    const cardBgColor = '#f8fafc';

    const baseRefStep = (clef === 'treble') ? 2 : -10;
    const step = this.diatonicStepMap[pitchName] !== undefined ? this.diatonicStepMap[pitchName] : 0;
    const noteY = staffBottomY - (step - baseRefStep) * (lineSpacing / 2);
    const noteX = width / 2 + 25;

    const showRainbow = options.showRainbow !== undefined ? options.showRainbow : this.showRainbow;
    const blurFilterId = `staff-rainbow-blur-${Math.random().toString(36).slice(2, 9)}`;

    const defsChildren = [];

    if (showRainbow) {
      defsChildren.push([
        'svg:filter',
        { id: blurFilterId, x: '-3%', y: '-3%', width: '106%', height: '106%' },
        [
          ['svg:feGaussianBlur', { stdDeviation: '0.6', result: 'blur' }]
        ]
      ]);
    }

    const svgChildren = [
      ['svg:defs', {}, defsChildren]
    ];

    // 1. Background Card
    svgChildren.push([
      'svg:rect',
      { x: 0, y: 0, width: width, height: height, rx: 12, fill: cardBgColor, stroke: '#334155', 'stroke-width': 1.5 }
    ]);

    // 2. Soft, balanced pastel spaces & line glows
    if (showRainbow) {
      const topStep = baseRefStep + 10;
      const botStep = baseRefStep - 3;
      const spaceStripes = [];
      const lineGlowStripes = [];

      const stripeX = startX - 2;
      const stripeW = (endX - startX) + 4;

      for (let s = botStep; s <= topStep; s++) {
        const yPos = staffBottomY - (s - baseRefStep) * (lineSpacing / 2);
        const isLineStep = ((s - baseRefStep) % 2 === 0);

        if (isLineStep) {
          const col = this.getPastelColor(s, 0.50);
          const bandHeight = 9.5;
          lineGlowStripes.push([
            'svg:rect',
            {
              x: stripeX,
              y: yPos - bandHeight / 2,
              width: stripeW,
              height: bandHeight,
              rx: 3,
              fill: col,
              opacity: '0.70'
            }
          ]);
        } else {
          const col = this.getPastelColor(s, 0.68);
          const bandHeight = 8.0;
          spaceStripes.push([
            'svg:rect',
            {
              x: stripeX,
              y: yPos - bandHeight / 2,
              width: stripeW,
              height: bandHeight,
              rx: 2,
              fill: col,
              opacity: '0.68'
            }
          ]);
        }
      }

      svgChildren.push([
        'svg:g',
        { filter: `url(#${blurFilterId})` },
        [...spaceStripes, ...lineGlowStripes]
      ]);
    }

    // 3. 5 Staff Lines
    for (let i = 0; i < 5; i++) {
      const lineStep = baseRefStep + (4 - i) * 2;
      const y = staffTopY + i * lineSpacing;
      const strokeColor = showRainbow ? this.getDarkLineColor(lineStep) : '#0f172a';
      const strokeWidth = showRainbow ? 2.0 : 1.6;

      svgChildren.push([
        'svg:line',
        { x1: startX, y1: y, x2: endX, y2: y, stroke: strokeColor, 'stroke-width': strokeWidth }
      ]);
    }

    // 4. Left and Right Bar Lines
    svgChildren.push([
      'svg:line',
      { x1: startX, y1: staffTopY, x2: startX, y2: staffBottomY, stroke: '#0f172a', 'stroke-width': 2 }
    ]);
    svgChildren.push([
      'svg:line',
      { x1: endX, y1: staffTopY, x2: endX, y2: staffBottomY, stroke: '#0f172a', 'stroke-width': 2 }
    ]);

    // 5. Clefs
    if (clef === 'treble') {
      // Natural 15:41 aspect ratio, height 90px, width 33px
      svgChildren.push([
        'svg:image',
        {
          href: this.svgUrls.trebleClef,
          'xlink:href': this.svgUrls.trebleClef,
          x: startX + 8,
          y: staffTopY - 15,
          width: 33,
          height: 90,
          preserveAspectRatio: 'xMidYMid meet'
        }
      ]);
    } else {
      // Natural 18:20 aspect ratio, height 46px, width 41px
      svgChildren.push([
        'svg:image',
        {
          href: this.svgUrls.bassClef,
          'xlink:href': this.svgUrls.bassClef,
          x: startX + 8,
          y: staffTopY + 2,
          width: 41,
          height: 46,
          preserveAspectRatio: 'xMidYMid meet'
        }
      ]);
    }

    // Helper for Ledger Lines
    const addLedgerLine = (ly, stepNum) => {
      const strokeColor = showRainbow ? this.getDarkLineColor(stepNum) : '#0f172a';
      svgChildren.push([
        'svg:line',
        { x1: noteX - 20, y1: ly, x2: noteX + 20, y2: ly, stroke: strokeColor, 'stroke-width': 2.2, 'stroke-linecap': 'round' }
      ]);
    };

    // 6. Ledger Lines
    if (noteY >= staffBottomY + lineSpacing) {
      for (let ly = staffBottomY + lineSpacing; ly <= noteY + 2; ly += lineSpacing) {
        const sNum = baseRefStep - Math.round((ly - staffBottomY) / (lineSpacing / 2));
        addLedgerLine(ly, sNum);
      }
    } else if (noteY <= staffTopY - lineSpacing) {
      for (let ly = staffTopY - lineSpacing; ly >= noteY - 2; ly -= lineSpacing) {
        const sNum = baseRefStep + 8 + Math.round((staffTopY - ly) / (lineSpacing / 2));
        addLedgerLine(ly, sNum);
      }
    } else if ((clef === 'treble' || clef === 'bass') && step === 0) {
      addLedgerLine(noteY, 0);
    }

    // 7. Accidentals
    if (accidental) {
      const isSharp = accidental === '#';
      if (isSharp) {
        // Natural 20:63 aspect ratio, height 30px, width 10px
        svgChildren.push([
          'svg:image',
          {
            href: this.svgUrls.sharp,
            'xlink:href': this.svgUrls.sharp,
            x: noteX - 22,
            y: noteY - 15,
            width: 10,
            height: 30,
            preserveAspectRatio: 'xMidYMid meet'
          }
        ]);
      } else {
        // Natural 20:43 aspect ratio, height 25px, width 12px (reduced by ~30%)
        svgChildren.push([
          'svg:image',
          {
            href: this.svgUrls.flat,
            'xlink:href': this.svgUrls.flat,
            x: noteX - 22,
            y: noteY - 17,
            width: 12,
            height: 25,
            preserveAspectRatio: 'xMidYMid meet'
          }
        ]);
      }
    }

    // 8. Note Head
    svgChildren.push([
      'svg:ellipse',
      {
        cx: noteX,
        cy: noteY,
        rx: 9.5,
        ry: 6.8,
        fill: '#0f172a',
        transform: `rotate(-25, ${noteX}, ${noteY})`
      }
    ]);

    // 9. Note Stem
    const staffCenterY = staffTopY + 2 * lineSpacing;
    const stemUp = noteY >= staffCenterY;
    const stemLen = 44;

    if (stemUp) {
      svgChildren.push([
        'svg:line',
        { x1: noteX + 8, y1: noteY - 1, x2: noteX + 8, y2: noteY - stemLen, stroke: '#0f172a', 'stroke-width': 2.2 }
      ]);
    } else {
      svgChildren.push([
        'svg:line',
        { x1: noteX - 8, y1: noteY + 1, x2: noteX - 8, y2: noteY + stemLen, stroke: '#0f172a', 'stroke-width': 2.2 }
      ]);
    }

    return makeElement('svg:svg', {
      viewBox: `0 0 ${width} ${height}`,
      width: '100%',
      height: '100%',
      style: { display: 'block', maxHeight: '100%', maxWidth: '100%' }
    }, svgChildren);
  }
}

globalThis.StaffView = StaffView;
if (typeof module !== 'undefined' && module.exports) module.exports = StaffView;