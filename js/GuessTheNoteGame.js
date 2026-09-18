class GuessTheNoteGame {
  constructor() {
    this.gameMode = 'EAR_TRAINING';
    this.targetStaffNote = null;
    this.staffStartTime = null;
    this.staffTimeout = null;
  }

  start() {
      if (!document.getElementById('architects-daughter-font')) {
        const link = makeElement('link', {
          id: 'architects-daughter-font',
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Architects+Daughter&display=swap',
        });
        document.head.appendChild(link);
      }

      this.pianoSettings = {};
      this.instruments = new InstrumentSounds();
      window.instruments = this.instruments;

      this.States = {
        IDLE: 'IDLE',
        PLAYING: 'PLAYING',
        GUESSING: 'GUESSING',
        FEEDBACK: 'FEEDBACK',
      };
      this.state = this.States.IDLE;
      this.currentSequence = [];
      this.overlays = [];
      this.startDelay = 1000;
      this.correctFeedbackDelay = 3000;
      this.newRoundDelay = 700;
      this.pianoRenderModes = ['fractions', 'midpoints', 'twelfths'];
      this.currentModeIndex = 0;

      this.scoreBox = new ScoreBox(this.rootElement);

      this.gameBox = new GameBox();
      this.gameBox.start(
        this.rootElement,
        (newMode) => this.handleModeChange(newMode),
        (rainbowMode) => this.handleRainbowModeChange(rainbowMode)
      );

      this.addEventListeners();

      this.pianoDivElement = makeElement('div', {
        style: { overflow: 'hidden', position: 'absolute' },
      });
      this.rootElement.appendChild(this.pianoDivElement);

      // Initialize piano instance BEFORE positioner callback so sizeCallback can render immediately
      this.piano = new Piano();
      this.pianoDivElement.appendChild(this.piano.getContainer());
      this.piano.setGameInstance(this);
      this.piano.setMiddleCMarkerVisibility(true);

      this.pianoPositioner = new SmartElementPositioner(this.pianoDivElement, {
        container: this.rootElement,
        position: [0, 36],
        size: [100, 41],
        sizeCallback: (self, pixelDims) => {
          if (this.piano && pixelDims.width > 0 && pixelDims.height > 0) {
            this.piano.setSizeAndPosition(pixelDims.width, pixelDims.height);
          }
        },
      });

      // Explicitly guarantee initial dimensions are applied to the piano SVG
      const rootRect = this.rootElement.getBoundingClientRect();
      const initW = rootRect.width || window.innerWidth;
      const initH = (rootRect.height || window.innerHeight) * 0.41;
      if (initW > 0 && initH > 0) {
        this.piano.setSizeAndPosition(initW, initH);
      }
      this.pianoPositioner.update(true);

      // Initialize Mini Piano Map for portrait Staff Reading overview
      this.miniPianoMap = new MiniPianoMap({
        startMidi: this.piano.settings.fullStartMidi,
        endMidi: this.piano.settings.fullEndMidi,
      });
      this.rootElement.appendChild(this.miniPianoMap.getContainer());

      this.miniPianoPositioner = new SmartElementPositioner(this.miniPianoMap.getContainer(), {
        container: this.rootElement,
        position: [7.5, 72.2],
        size: [85, 4.2],
        sizeCallback: (self, pixelDims) => {
          if (this.miniPianoMap && pixelDims.width > 0 && pixelDims.height > 0) {
            this.miniPianoMap.setSize(pixelDims.width, pixelDims.height);
            if (this.piano) {
              const { startFraction, endFraction } = this.piano.getViewportFraction();
              this.miniPianoMap.setViewport(startFraction, endFraction);
            }
          }
        },
      });

      this.instrumentSelector = new InstrumentSelector(this);
      this.instrumentSelector.start();

      this.keySelector = new KeySignatureSelector(this);
      this.keySelector.start();

      this.createSecretButton();
      this.updateUI();

      // Trigger an immediate frame-delayed update to catch late layout expansions
      requestAnimationFrame(() => {
        if (this.pianoPositioner) this.pianoPositioner.update(true);
        if (this.miniPianoPositioner) this.miniPianoPositioner.update(true);
      });
    }
  updateMiniPianoVisibility() {
    if (!this.miniPianoMap) return;
    const isPortrait = this.rootElement
      ? this.rootElement.clientHeight > this.rootElement.clientWidth
      : window.innerHeight > window.innerWidth;
    const shouldShow = (this.gameMode === 'STAFF_READING') && isPortrait;

    if (shouldShow) {
      this.miniPianoMap.show();
      if (this.miniPianoPositioner) this.miniPianoPositioner.update();
      if (this.piano) {
        const { startFraction, endFraction } = this.piano.getViewportFraction();
        this.miniPianoMap.setViewport(startFraction, endFraction);
      }
    } else {
      this.miniPianoMap.hide();
    }
  }

  handleRainbowModeChange(rainbowMode) {
    const isMonochrome = (rainbowMode === 'NONE');
    if (this.piano) {
      this.piano.setMonochrome(isMonochrome);
      if (this.gameMode === 'STAFF_READING' && this.targetStaffNote) {
        this.piano.centerOnMidi(this.targetStaffNote.midi, false);
      }
    }
    this.updateMiniPianoVisibility();
  }

  handleModeChange(newMode) {
    this.gameMode = newMode;
    this.stopRound();
    this.scoreBox.reset();
    this.piano.setMiddleCMarkerVisibility(true);

    if (newMode === 'STAFF_READING') {
      if (this.keySelector && this.keySelector.toggleButton) {
        this.keySelector.toggleButton.style.display = 'none';
      }
      this.gameBox.setFeedbackText('play the note...');
      const isMonochrome = (this.gameBox.rainbowMode === 'NONE');
      this.piano.setMonochrome(isMonochrome);
    } else {
      if (this.keySelector && this.keySelector.toggleButton) {
        this.keySelector.toggleButton.style.display = 'flex';
      }
      this.gameBox.setFeedbackText('guess the note...');
      this.piano.setMonochrome(false);
    }

    if (this.pianoDivElement && this.pianoPositioner) {
      this.pianoPositioner.update();
    }

    this.updateMiniPianoVisibility();
    this.updateUI();
  }

  addEventListeners() {
    this.gameBox.getStartButton().addEventListener('click', async () => {
      if (window.instruments && typeof window.instruments.resumeContext === 'function') {
        await window.instruments.resumeContext();
      }
      if (this.gameMode === 'STAFF_READING') {
        this.startNewStaffRound();
      } else {
        this.isTwoPlayerMode = false;
        this.scoreBox.isTwoPlayer = false;
        this.scoreBox.reset();
        this.startNewRound();
      }
    });

    if (this.gameBox.getStartTwoPlayerButton()) {
      this.gameBox.getStartTwoPlayerButton().addEventListener('click', async () => {
        if (window.instruments && typeof window.instruments.resumeContext === 'function') {
          await window.instruments.resumeContext();
        }
        this.showPlayerNameModal();
      });
    }

    this.gameBox.getPlayAgainButton().addEventListener('click', () => {
      if (this.gameMode === 'EAR_TRAINING') {
        if (
          this.state === this.States.GUESSING ||
          (this.state === this.States.FEEDBACK &&
            !this.gameBox.getPromptDiv().classList.contains('correct'))
        ) {
          this.playSequence();
        }
      }
    });
  }

  updateUI() {
    this.gameBox.updateUI(this.state);
    this.updateMiniPianoVisibility();
  }

  stopRound() {
    this.stopGuessTimer();
    if (this.staffTimeout) clearTimeout(this.staffTimeout);

    this.overlays.forEach((overlay) => this.piano.removeOverlayElement(overlay));
    this.overlays = [];
    this.state = this.States.IDLE;
    this.currentSequence = [];
    this.targetStaffNote = null;
    const promptDiv = this.gameBox.getPromptDiv();
    if (promptDiv) promptDiv.classList.remove('correct', 'incorrect', 'pulse-green', 'pulse-red');
    this.gameBox.setFeedbackText(
      this.gameMode === 'STAFF_READING' ? 'play the note...' : 'guess the note...'
    );
    this.gameBox.getNoteSpans().forEach((span) => (span.style.visibility = 'hidden'));
    this.gameBox.getPlayAgainButton().style.visibility = 'hidden';

    const fullStartMidi = this.piano.settings.fullStartMidi;
    const fullEndMidi = this.piano.settings.fullEndMidi;
    for (let midi = fullStartMidi; midi <= fullEndMidi; midi++) {
      this.piano.glowPiano.setKeySemiActive(midi, false);
    }
    if (window.instruments) {
      window.instruments.stopAllNotes();
    }
    this.updateUI();
  }

  startNewStaffRound() {
    if (this.staffTimeout) clearTimeout(this.staffTimeout);
    this.overlays.forEach((overlay) => this.piano.removeOverlayElement(overlay));
    this.overlays = [];
    if (window.instruments) window.instruments.stopAllNotes();

    this.state = this.States.GUESSING;
    const promptDiv = this.gameBox.getPromptDiv();
    if (promptDiv) promptDiv.classList.remove('correct', 'incorrect', 'pulse-green', 'pulse-red');

    const minStaffMidi = 38;
    const maxStaffMidi = 81;

    const chromaticEnharmonics = {
      0: [{ name: 'C', accidental: '' }],
      1: [
        { name: 'C', accidental: '#' },
        { name: 'D', accidental: 'b' }
      ],
      2: [{ name: 'D', accidental: '' }],
      3: [
        { name: 'D', accidental: '#' },
        { name: 'E', accidental: 'b' }
      ],
      4: [{ name: 'E', accidental: '' }],
      5: [{ name: 'F', accidental: '' }],
      6: [
        { name: 'F', accidental: '#' },
        { name: 'G', accidental: 'b' }
      ],
      7: [{ name: 'G', accidental: '' }],
      8: [
        { name: 'G', accidental: '#' },
        { name: 'A', accidental: 'b' }
      ],
      9: [{ name: 'A', accidental: '' }],
      10: [
        { name: 'A', accidental: '#' },
        { name: 'B', accidental: 'b' }
      ],
      11: [{ name: 'B', accidental: '' }]
    };

    const chosenMidi = Math.floor(Math.random() * (maxStaffMidi - minStaffMidi + 1)) + minStaffMidi;
    const clef = chosenMidi < 60 ? 'bass' : 'treble';

    const pitchClass = chosenMidi % 12;
    const octave = Math.floor((chosenMidi - 12) / 12);
    const enharmonicOptions = chromaticEnharmonics[pitchClass];
    const selectedSpelling = enharmonicOptions[Math.floor(Math.random() * enharmonicOptions.length)];

    const pitchName = `${selectedSpelling.name}${octave}`;
    const accidental = selectedSpelling.accidental;

    this.targetStaffNote = {
      midi: chosenMidi,
      clef: clef,
      pitchName: pitchName,
      accidental: accidental,
      spelling: selectedSpelling
    };

    this.gameBox.displayStaffNote(clef, pitchName, accidental);
    this.piano.centerOnMidi(chosenMidi, true);

    if (window.instruments) {
      window.instruments.noteOn(chosenMidi, 90);
      setTimeout(() => {
        if (window.instruments) window.instruments.noteOff(chosenMidi);
      }, 800);
    }

    this.staffStartTime = Date.now();
    this.gameBox.setFeedbackText('play the note...');
    this.updateUI();
  }

  handleStaffNoteGuess(midi) {
    if (!this.targetStaffNote) return;

    const isCorrect = (midi === this.targetStaffNote.midi);
    const guessedNote = PianoUtils.midiToNoteName(midi);
    const promptDiv = this.gameBox.getPromptDiv();

    const spelling = this.targetStaffNote.spelling;
    const displayPitchStr = spelling.accidental 
      ? `${spelling.name}${spelling.accidental === '#' ? '♯' : '♭'}${Math.floor((this.targetStaffNote.midi - 12) / 12)}`
      : `${spelling.name}${Math.floor((this.targetStaffNote.midi - 12) / 12)}`;

    const elapsedSec = this.staffStartTime ? ((Date.now() - this.staffStartTime) / 1000).toFixed(1) : '0.5';

    if (isCorrect) {
      if (this.staffTimeout) clearTimeout(this.staffTimeout);
      this.state = this.States.FEEDBACK;
      this.scoreBox.recordGuess(true, { note: displayPitchStr, time: elapsedSec });

      if (promptDiv) {
        promptDiv.classList.remove('pulse-red', 'incorrect');
        promptDiv.classList.add('pulse-green', 'correct');
      }
      this.gameBox.setFeedbackText(`good job! (${elapsedSec}s)`);
      this.gameBox.showStaffNoteSuccessOverlay(midi, spelling);

      this.staffTimeout = setTimeout(() => {
        if (promptDiv) promptDiv.classList.remove('pulse-green', 'correct');
        if (this.gameMode === 'STAFF_READING') {
          this.startNewStaffRound();
        }
      }, 1200);
    } else {
      this.scoreBox.recordGuess(false, { note: `${displayPitchStr} (tried ${guessedNote})`, time: elapsedSec });
      if (promptDiv) {
        promptDiv.classList.remove('pulse-green', 'correct');
        promptDiv.classList.add('pulse-red', 'incorrect');
      }
      this.gameBox.setFeedbackText('try again...');

      if (this.staffTimeout) clearTimeout(this.staffTimeout);
      this.staffTimeout = setTimeout(() => {
        if (promptDiv) promptDiv.classList.remove('pulse-red', 'incorrect');
        if (this.state === this.States.FEEDBACK && this.gameMode === 'STAFF_READING') {
          this.state = this.States.GUESSING;
          this.gameBox.setFeedbackText('play the note...');
        }
      }, 600);
    }
  }

  startNewRound() {
    if (this.state !== this.States.IDLE) return;

    this.overlays.forEach((overlay) => this.piano.removeOverlayElement(overlay));
    this.overlays = [];
    if (window.instruments) window.instruments.stopAllNotes();

    this.state = this.States.PLAYING;
    this.currentSequence = [];
    const fullStartMidi = this.piano.settings.fullStartMidi;
    const fullEndMidi = this.piano.settings.fullEndMidi;

    if (Math.random() < 0.2) {
      const newStartMidi =
        Math.floor(Math.random() * (fullEndMidi - 11 - fullStartMidi + 1)) + fullStartMidi;
      this.piano.setGameRange(newStartMidi, newStartMidi + 11);
    } else {
      this.piano.setGameRange(this.piano.gameRange.startMidi, this.piano.gameRange.endMidi);
    }

    const { startMidi, endMidi } = this.piano.gameRange;
    let availableNotes = this.keySelector.getAvailableNotes();
    if (availableNotes.length < 4) {
      availableNotes = Array.from({ length: endMidi - startMidi + 1 }, (_, i) => startMidi + i);
    }

    let seqLength = 3;
    const r = Math.random();
    if (r < 0.25) seqLength = 2;
    else if (r < 0.5) seqLength = 4;

    this.currentSequence = [];
    while (this.currentSequence.length < seqLength) {
      const randomIndex = Math.floor(Math.random() * availableNotes.length);
      const selectedNote = availableNotes[randomIndex];
      if (!this.currentSequence.includes(selectedNote)) {
        this.currentSequence.push(selectedNote);
      }
    }
    this.currentSequence = this.currentSequence.filter(
      (midi) => midi >= startMidi && midi <= endMidi
    );

    for (let midi = this.piano.settings.fullStartMidi; midi <= this.piano.settings.fullEndMidi; midi++) {
      this.piano.glowPiano.setKeySemiActive(midi, false);
    }

    this.hiddenIndex = Math.floor(Math.random() * seqLength);
    const ordinalNames = ['first', 'second', 'third', 'fourth'];
    const hiddenOrdinal = ordinalNames[this.hiddenIndex];

    this.gameBox.getPromptDiv().classList.remove('correct', 'incorrect');
    this.gameBox.displayNotes(this.currentSequence, this.hiddenIndex);
    this.gameBox.setFeedbackText(`guess the ${hiddenOrdinal} note`);
    this.updateUI();
    setTimeout(() => this.playSequence(), this.startDelay);
  }

  playSequence() {
    if (
      this.state !== this.States.PLAYING &&
      this.state !== this.States.GUESSING &&
      !(
        this.state === this.States.FEEDBACK &&
        !this.gameBox.getPromptDiv().classList.contains('correct')
      )
    ) {
      return;
    }

    if (this.state === this.States.PLAYING) {
      this.gameBox.getNoteSpans().forEach((span) => (span.style.visibility = 'hidden'));
    }

    const playNoteWithDelay = (index) => {
      if (index >= this.currentSequence.length) {
        if (this.state === this.States.PLAYING) {
          this.state = this.States.GUESSING;
          this.updateUI();
          if (this.isTwoPlayerMode) {
            this.startGuessTimer();
          }
        }
        return;
      }
      const midiCode = this.currentSequence[index];
      const span = this.gameBox.getNoteSpans()[index];
      const visualDuration = 1000;
      const suppressDisplay = index === this.hiddenIndex;

      if (index !== this.hiddenIndex) {
        let numberElement = this.overlays.find(
          (el) =>
            el.dataset.sequenceIndex === `${index + 1}` &&
            el.dataset.midi === `${midiCode}`
        );
        if (!numberElement) {
          numberElement = document.createElement('div');
          numberElement.textContent = `${index + 1}`;
          numberElement.dataset.sequenceIndex = `${index + 1}`;
          numberElement.dataset.midi = `${midiCode}`;
          const keyInfo = this.piano.graphicPiano.getKeyByMidi(midiCode);
          const isBlack = (keyInfo && keyInfo.bbox) ? keyInfo.bbox.isBlack : false;
          numberElement.style.color = isBlack ? 'white' : 'black';
          numberElement.style.fontSize = '48px';
          numberElement.style.textShadow = isBlack ? '2px 2px 0 black' : '-2px -2px 0 white';
          numberElement.style.display = 'none';
          numberElement.style.textAlign = 'center';
          this.piano.addOverlayElement(midiCode, numberElement, { bottomOffset: 5 });
          this.overlays.push(numberElement);
        }
        setTimeout(() => {
          numberElement.style.display = 'block';
          numberElement.classList.add('pulse-overlay');
          setTimeout(() => {
            if (numberElement.parentNode) numberElement.classList.remove('pulse-overlay');
          }, 500);
        }, 10);
        this.piano.glowPiano.setKeySemiActive(midiCode, true);
      } else {
        this.piano.glowPiano.setKeySemiActive(midiCode, false);
      }

      this.piano.glowPiano.playNote(midiCode, visualDuration, suppressDisplay, {
        sequenceIndex: index,
      });

      if (span) {
        span.style.visibility = 'visible';
        span.classList.add('pulse');
        setTimeout(() => span.classList.remove('pulse'), 500);
      }

      setTimeout(() => playNoteWithDelay(index + 1), visualDuration + 50);
    };

    window.instruments.stopAllNotes();
    playNoteWithDelay(0);
  }

  handleNoteEvent(midi, eventType, customData) {
    if (eventType === 'start') {
      if (window.instruments && window.instruments.isRandomInstrument) {
        const available = [
          'Wurlitzer EP',
          'Electric Guitar',
          'Marimba',
          'Piano',
          'Music Box',
          'Vibes',
          'Harp',
          'Steel Drum',
        ];
        let nextInst = available[Math.floor(Math.random() * available.length)];
        if (window.instruments.lastRandomInstrument === nextInst) {
          const filtered = available.filter((inst) => inst !== nextInst);
          nextInst = filtered[Math.floor(Math.random() * filtered.length)];
        }
        window.instruments.lastRandomInstrument = nextInst;
        window.instruments.setActiveInstrument(nextInst);
      }
      if (window.instruments) {
        window.instruments.noteOn(midi);
      }
    } else if (eventType === 'stop') {
      if (window.instruments) {
        window.instruments.noteOff(midi);
      }
      return;
    }

    if (customData && customData.sequenceIndex !== undefined) return;
    if (this.state === this.States.PLAYING) return;

    if (eventType === 'start') {
      if (this.gameMode === 'STAFF_READING') {
        this.handleStaffNoteGuess(midi);
        return;
      }

      if (
        this.state !== this.States.GUESSING &&
        !(
          this.state === this.States.FEEDBACK &&
          !this.gameBox.getPromptDiv().classList.contains('correct')
        )
      ) {
        return;
      }

      const sequenceIndex = this.currentSequence.indexOf(midi);
      if (sequenceIndex !== -1 && sequenceIndex !== this.hiddenIndex) {
        const span = this.gameBox.getNoteSpans()[sequenceIndex];
        if (span) {
          span.classList.add('pulse');
          setTimeout(() => span.classList.remove('pulse'), 500);
        }
        return;
      }

      this.stopGuessTimer();
      this.state = this.States.FEEDBACK;
      const isCorrect = midi === this.currentSequence[this.hiddenIndex];

      if (this.isTwoPlayerMode) {
        this.recordPlayerGuess(isCorrect);
      } else {
        this.scoreBox.recordGuess(isCorrect);
      }

      this.displayFeedback(midi, isCorrect);
    }
  }

  displayFeedback(guessedMidi, isCorrect) {
    let displayNote = 'Time out';
    if (guessedMidi !== null) {
      const guessedNote = GameBox.midiToNote(guessedMidi);
      const [baseNote, modifier] = PianoUtils.parseNote(guessedNote);
      displayNote = modifier ? `${baseNote.toLowerCase()}♯` : baseNote.toLowerCase();
    }

    const promptDiv = this.gameBox.getPromptDiv();
    promptDiv.classList.remove('pulse-green', 'pulse-red');

    if (isCorrect) {
      promptDiv.classList.add('pulse-green');
      this.gameBox.updateNoteDisplay(this.hiddenIndex, guessedMidi, true);
      const targetSpan = this.gameBox.getNoteSpans()[this.hiddenIndex];
      if (targetSpan) {
        targetSpan.style.visibility = 'visible';
        targetSpan.classList.add('pulse');
        setTimeout(() => targetSpan.classList.remove('pulse'), 500);
      }
      this.gameBox.setFeedbackText('good job!');
      promptDiv.classList.add('correct');
      this.gameBox.getPlayAgainButton().style.visibility = 'hidden';

      const numberOverlay = document.createElement('div');
      numberOverlay.textContent = `${this.hiddenIndex + 1}`;
      numberOverlay.dataset.midi = `${guessedMidi}`;
      const keyInfo = this.piano.graphicPiano.getKeyByMidi(guessedMidi);
      const isBlack = (keyInfo && keyInfo.bbox) ? keyInfo.bbox.isBlack : false;
      numberOverlay.style.color = isBlack ? 'white' : 'black';
      numberOverlay.style.fontSize = '48px';
      numberOverlay.style.textShadow = isBlack ? '2px 2px 0 black' : '-2px -2px 0 white';
      numberOverlay.style.display = 'none';
      this.piano.addOverlayElement(guessedMidi, numberOverlay, { bottomOffset: 5 });
      this.overlays.push(numberOverlay);

      setTimeout(() => {
        numberOverlay.style.display = 'block';
        numberOverlay.classList.add('pulse-overlay');
        setTimeout(() => {
          if (numberOverlay.parentNode) numberOverlay.classList.remove('pulse-overlay');
        }, 500);
      }, 10);
      this.piano.glowPiano.setKeySemiActive(guessedMidi, true);

      setTimeout(() => {
        promptDiv.classList.remove('pulse-green', 'correct');
        this.state = this.States.IDLE;
        this.overlays.forEach((overlay) => this.piano.removeOverlayElement(overlay));
        this.overlays = [];
        this.currentSequence.forEach((midi) => {
          if (midi) this.piano.glowPiano.setKeySemiActive(midi, false);
        });

        if (this.isTwoPlayerMode) {
          this.advanceTwoPlayerTurn();
        } else {
          if (Math.random() < 0.8) {
            const fullStartMidi = this.piano.settings.fullStartMidi;
            const maxStartMidi = this.piano.settings.fullEndMidi - 11;
            const newStartMidi =
              Math.floor(Math.random() * (maxStartMidi - fullStartMidi + 1)) + fullStartMidi;
            this.piano.setGameRange(newStartMidi, newStartMidi + 11);
          }
          setTimeout(() => this.startNewRound(), this.newRoundDelay);
        }
      }, this.correctFeedbackDelay);
    } else {
      promptDiv.classList.add('pulse-red');
      this.gameBox.setFeedbackText(`${displayNote} is incorrect`);
      promptDiv.classList.add('incorrect');
      this.gameBox.getPlayAgainButton().style.visibility = 'visible';

      const noSymbolSVG = makeElement('svg:svg', { width: 50, height: 50, viewBox: '0 0 100 100' }, [
        makeElement('svg:circle', {
          cx: 50,
          cy: 50,
          r: 40,
          fill: 'none',
          stroke: '#ff6666',
          'stroke-width': 15,
        }),
        makeElement('svg:line', {
          x1: 20,
          y1: 80,
          x2: 80,
          y2: 20,
          stroke: '#ff6666',
          'stroke-width': 15,
        }),
      ]);
      noSymbolSVG.style.display = 'none';
      if (guessedMidi !== null) {
        this.piano.addOverlayElement(guessedMidi, noSymbolSVG, { bottomOffset: 5 });
        this.overlays.push(noSymbolSVG);
        setTimeout(() => (noSymbolSVG.style.display = 'block'), 10);
      }

      setTimeout(() => {
        if (guessedMidi !== null) {
          this.piano.removeOverlayElement(noSymbolSVG);
          this.overlays = this.overlays.filter((o) => o !== noSymbolSVG);
        }
        if (this.state === this.States.FEEDBACK) {
          promptDiv.classList.remove('pulse-red', 'incorrect');
          if (this.isTwoPlayerMode) {
            this.advanceTwoPlayerTurn();
          } else {
            const ordinalNames = ['first', 'second', 'third', 'fourth'];
            const hiddenOrdinal = ordinalNames[this.hiddenIndex];
            this.gameBox.setFeedbackText(`guess the ${hiddenOrdinal} note`);
            this.state = this.States.GUESSING;
            this.updateUI();
          }
        }
      }, 1000);
    }
  }

  setGameRange(startMidi, endMidi) {
    this.piano.setGameRange(startMidi, endMidi);
  }

  createSecretButton() {
    const secretButton = makeElement('div', {
      title: 'Cycle Piano Render Mode',
      style: {
        position: 'absolute',
        top: '1vh',
        right: '1vw',
        width: '2vw',
        height: '2vw',
        zIndex: '1001',
        cursor: 'pointer',
        opacity: '0.05',
        transition: 'opacity 0.2s ease-in-out',
      },
    });

    secretButton.addEventListener('mouseenter', () => (secretButton.style.opacity = '0.2'));
    secretButton.addEventListener('mouseleave', () => (secretButton.style.opacity = '0.05'));

    secretButton.addEventListener('click', () => {
      this.currentModeIndex = (this.currentModeIndex + 1) % this.pianoRenderModes.length;
      const newMode = this.pianoRenderModes[this.currentModeIndex];
      if (this.piano && this.piano.graphicPiano) {
        this.piano.graphicPiano.setGeometryMode(newMode);
      }
    });

    this.rootElement.appendChild(secretButton);
  }

  showPlayerNameModal() {
    const modal = makeElement('div', {
      id: 'name-entry-modal',
      className: 'v-modal',
      style: { position: 'absolute', width: '60%', height: '60%', top: '20%', left: '20%', zIndex: '99999' },
    });

    const title = makeElement('h2', {
      textContent: 'Player Names',
      style: { color: '#ffcc00', margin: '0 0 20px 0', fontSize: '28px', textShadow: '2px 2px 4px rgba(0,0,0,0.5)' },
    });
    modal.appendChild(title);

    const inputsContainer = makeElement('div', {
      style: { display: 'flex', flexDirection: 'column', gap: '15px', width: '80%', maxWidth: '280px' },
    });

    const p1Wrapper = makeElement('div');
    p1Wrapper.appendChild(
      makeElement('div', { textContent: 'Player 1 Name:', style: { color: '#66ccff', marginBottom: '5px', fontSize: '18px' } })
    );
    const p1Input = makeElement('input', { type: 'text', value: this.p1Name || 'Player 1', className: 'v-input' });
    p1Wrapper.appendChild(p1Input);
    inputsContainer.appendChild(p1Wrapper);

    const p2Wrapper = makeElement('div');
    p2Wrapper.appendChild(
      makeElement('div', { textContent: 'Player 2 Name:', style: { color: '#ff6666', marginBottom: '5px', fontSize: '18px' } })
    );
    const p2Input = makeElement('input', { type: 'text', value: this.p2Name || 'Player 2', className: 'v-input' });
    p2Wrapper.appendChild(p2Input);
    inputsContainer.appendChild(p2Wrapper);

    modal.appendChild(inputsContainer);

    const actions = makeElement('div', { style: { display: 'flex', gap: '15px', marginTop: '20px' } });
    const cancelButton = makeElement('button', { textContent: 'Cancel', className: 'v-btn v-btn-danger' });
    cancelButton.onclick = () => modal.remove();
    actions.appendChild(cancelButton);

    const submitButton = makeElement('button', { textContent: 'Start Match!', className: 'v-btn v-btn-success' });
    submitButton.onclick = () => {
      this.p1Name = p1Input.value.trim() || 'Player 1';
      this.p2Name = p2Input.value.trim() || 'Player 2';
      modal.remove();
      this.initializeTwoPlayerMatch();
    };
    actions.appendChild(submitButton);

    modal.appendChild(actions);
    this.rootElement.appendChild(modal);
  }

  initializeTwoPlayerMatch() {
    this.isTwoPlayerMode = true;
    this.p1Score = 0;
    this.p2Score = 0;
    this.p1History = [];
    this.p2History = [];

    this.scoreBox.isTwoPlayer = true;
    this.scoreBox.p1Name = this.p1Name;
    this.scoreBox.p2Name = this.p2Name;
    this.scoreBox.setTwoPlayerScores(this.p1Name, 0, 0, [], this.p2Name, 0, 0, []);

    this.twoPlayerRounds = [];
    const { startMidi, endMidi } = this.piano.gameRange;
    let availableNotes = this.keySelector.getAvailableNotes();
    if (availableNotes.length < 4) {
      availableNotes = Array.from({ length: endMidi - startMidi + 1 }, (_, i) => startMidi + i);
    }

    for (let rIndex = 0; rIndex < 10; rIndex++) {
      let seqLength = 3;
      const randVal = Math.random();
      if (randVal < 0.25) seqLength = 2;
      else if (randVal < 0.5) seqLength = 4;

      const currentSequence = [];
      while (currentSequence.length < seqLength) {
        const randomIndex = Math.floor(Math.random() * availableNotes.length);
        const selectedNote = availableNotes[randomIndex];
        if (!currentSequence.includes(selectedNote)) {
          currentSequence.push(selectedNote);
        }
      }
      const finalSequence = currentSequence.filter((midi) => midi >= startMidi && midi <= endMidi);
      const hiddenIndex = Math.floor(Math.random() * seqLength);

      this.twoPlayerRounds.push({
        sequence: finalSequence,
        hiddenIndex: hiddenIndex,
      });
    }

    this.currentPlayer = 1;
    this.currentStep = 0;
    this.currentSubRound = 0;
    this.showIntermissionOverlay(false);
  }

  showIntermissionOverlay(isTransition = false) {
    this.stopGuessTimer();
    const existing = document.getElementById('turn-intermission-overlay');
    if (existing) existing.remove();

    const activePlayerName = this.currentPlayer === 1 ? this.p1Name : this.p2Name;
    const overlay = makeElement('div', {
      id: 'turn-intermission-overlay',
      className: 'v-modal',
      style: { position: 'absolute', width: '60%', height: '50%', top: '25%', left: '20%', zIndex: '99999' },
    });

    const headingText = isTransition
      ? `Pass the device to ${activePlayerName}!`
      : `${activePlayerName}'s Turn!`;

    const colorValue = this.currentPlayer === 1 ? '#66ccff' : '#ff6666';
    const heading = makeElement('h2', {
      textContent: headingText,
      style: { color: colorValue, margin: '0 0 15px 0', fontSize: '32px', textShadow: `0 0 10px ${colorValue}50` },
    });
    overlay.appendChild(heading);

    const subText = makeElement('p', {
      textContent: `You are playing round ${this.currentSubRound + 1} of 2 for this turn.`,
      style: { fontSize: '18px', margin: '0 0 25px 0', color: '#cccccc' },
    });
    overlay.appendChild(subText);

    const startTurnBtn = makeElement('button', {
      textContent: `I am ${activePlayerName} - Start Turn`,
      className: `v-btn ${this.currentPlayer === 1 ? 'v-btn-primary' : 'v-btn-danger'}`,
      style: { fontSize: '20px', padding: '12px 30px' },
    });
    startTurnBtn.onclick = () => {
      overlay.remove();
      this.startTwoPlayerRound();
    };
    overlay.appendChild(startTurnBtn);
    this.rootElement.appendChild(overlay);
  }

  startTwoPlayerRound() {
    const roundIndex = this.currentStep * 2 + this.currentSubRound;
    const roundParams = this.twoPlayerRounds[roundIndex];
    this.currentSequence = roundParams.sequence;
    this.hiddenIndex = roundParams.hiddenIndex;

    this.state = this.States.PLAYING;
    this.gameBox.getPromptDiv().classList.remove('correct', 'incorrect');
    this.gameBox.displayNotes(this.currentSequence, this.hiddenIndex);

    const ordinalNames = ['first', 'second', 'third', 'fourth'];
    const hiddenOrdinal = ordinalNames[this.hiddenIndex];
    this.gameBox.setFeedbackText(`guess the ${hiddenOrdinal} note`);
    this.updateUI();
    setTimeout(() => this.playSequence(), this.startDelay);
  }

  startGuessTimer() {
    this.stopGuessTimer();
    this.guessTimeRemaining = 15;
    this.updateTimerDisplay();
    this.guessTimerInterval = setInterval(() => {
      this.guessTimeRemaining--;
      this.updateTimerDisplay();
      if (this.guessTimeRemaining <= 0) {
        this.stopGuessTimer();
        this.handleTimeout();
      }
    }, 1000);
  }

  stopGuessTimer() {
    if (this.guessTimerInterval) {
      clearInterval(this.guessTimerInterval);
      this.guessTimerInterval = null;
    }
  }

  updateTimerDisplay() {
    const ordinalNames = ['first', 'second', 'third', 'fourth'];
    const hiddenOrdinal = ordinalNames[this.hiddenIndex];
    const activePlayerName = this.currentPlayer === 1 ? this.p1Name : this.p2Name;
    const isLowTime = this.guessTimeRemaining <= 5;
    const timerColorTag = isLowTime ? '#ff3333' : '#ffcc00';

    this.gameBox.setFeedbackText(`[⏰ ${this.guessTimeRemaining}s] ${activePlayerName}: Guess the ${hiddenOrdinal} note!`);
    this.gameBox.feedbackText.style.color = timerColorTag;

    if (isLowTime) {
      this.gameBox.feedbackText.classList.add('pulse');
      setTimeout(() => this.gameBox.feedbackText.classList.remove('pulse'), 300);
    } else {
      this.gameBox.feedbackText.style.color = 'white';
    }
  }

  handleTimeout() {
    this.state = this.States.FEEDBACK;
    this.recordPlayerGuess(false);
    this.displayFeedback(null, false);
  }

  recordPlayerGuess(isCorrect) {
    if (this.currentPlayer === 1) {
      this.p1History.push(isCorrect ? '👍' : '👎');
      if (isCorrect) this.p1Score++;
    } else {
      this.p2History.push(isCorrect ? '👍' : '👎');
      if (isCorrect) this.p2Score++;
    }
    this.scoreBox.setTwoPlayerScores(
      this.p1Name,
      this.p1Score,
      this.p1History.length,
      this.p1History,
      this.p2Name,
      this.p2Score,
      this.p2History.length,
      this.p2History
    );
  }

  advanceTwoPlayerTurn() {
    this.stopGuessTimer();
    this.currentSubRound++;

    if (this.currentSubRound < 2) {
      this.showIntermissionOverlay(false);
    } else {
      if (this.currentPlayer === 1) {
        this.currentPlayer = 2;
        this.currentSubRound = 0;
        this.showIntermissionOverlay(true);
      } else {
        this.currentPlayer = 1;
        this.currentSubRound = 0;
        this.currentStep++;

        if (this.currentStep < 5) {
          this.showIntermissionOverlay(true);
        } else {
          this.showMatchFinishedModal();
        }
      }
    }
  }

  showMatchFinishedModal() {
    const modal = makeElement('div', {
      id: 'match-finished-modal',
      className: 'v-modal',
      style: { position: 'absolute', width: '70%', height: '70%', top: '15%', left: '15%', zIndex: '99999' },
    });

    const celebration = makeElement('h1', {
      textContent: '🏆 Match Finished! 🏆',
      style: { color: '#ffcc00', margin: '0 0 15px 0', fontSize: '36px', textShadow: '0 0 12px rgba(255,204,0,0.4)' },
    });
    modal.appendChild(celebration);

    let winnerText = '';
    let color = '#fff';
    if (this.p1Score > this.p2Score) {
      winnerText = `${this.p1Name} Wins the Match!`;
      color = '#66ccff';
    } else if (this.p2Score > this.p1Score) {
      winnerText = `${this.p2Name} Wins the Match!`;
      color = '#ff6666';
    } else {
      winnerText = "It's a Tie Match!";
      color = '#a3a3c2';
    }

    const resultHeading = makeElement('h2', {
      textContent: winnerText,
      style: { color: color, margin: '0 0 20px 0', fontSize: '30px' },
    });
    modal.appendChild(resultHeading);

    const scores = makeElement('p', {
      textContent: `${this.p1Name}: ${this.p1Score} / 10\n${this.p2Name}: ${this.p2Score} / 10`,
      style: { fontSize: '24px', whiteSpace: 'pre', margin: '0 0 25px 0', lineHeight: '1.5', color: '#eeeeee' },
    });
    modal.appendChild(scores);

    const restartBtn = makeElement('button', {
      textContent: 'Play Again',
      className: 'v-btn v-btn-success',
      style: { fontSize: '20px' },
    });
    restartBtn.onclick = () => {
      modal.remove();
      this.isTwoPlayerMode = false;
      this.scoreBox.isTwoPlayer = false;
      this.scoreBox.reset();
      this.state = this.States.IDLE;
      this.updateUI();
    };
    modal.appendChild(restartBtn);
    this.rootElement.appendChild(modal);
  }

  async run(env) {
    if (this.rootElement) this.destroy();
    this.env = env;
    this.rootElement = env.container;

    document.documentElement.style.height = '100%';
    document.documentElement.style.width = '100%';
    document.documentElement.style.margin = '0';
    document.documentElement.style.padding = '0';
    document.documentElement.style.overflow = 'hidden';

    document.body.style.height = '100%';
    document.body.style.width = '100%';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';

    this.rootElement.style.position = 'relative';
    this.rootElement.style.top = '0';
    this.rootElement.style.left = '0';
    this.rootElement.style.width = '100%';
    this.rootElement.style.height = '100%';
    this.rootElement.style.overflow = 'hidden';

    this.rootElement.classList.add('guess-the-note-wrapper');
    this.injectStyles();

    this.start();

    this.resizeObserver = new ResizeObserver(() => {
      if (this.scoreBox && this.scoreBox.positioner) this.scoreBox.positioner.update();
      if (this.gameBox && this.gameBox.positioner) this.gameBox.positioner.update();
      if (this.pianoPositioner) this.pianoPositioner.update();
      if (this.miniPianoPositioner) this.miniPianoPositioner.update();
      if (this.instrumentSelector && this.instrumentSelector.positioner) {
        this.instrumentSelector.positioner.update();
        this.instrumentSelector.popupPositioner.update();
      }
      if (this.keySelector && this.keySelector.buttonPositioner) {
        this.keySelector.buttonPositioner.update();
        this.keySelector.popupPositioner.update();
      }
      this.updateMiniPianoVisibility();
    });
    this.resizeObserver.observe(this.rootElement);
  }

  destroy() {
    this.stopGuessTimer();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.miniPianoMap) {
      this.miniPianoMap.destroy();
    }
    if (this.rootElement) {
      this.rootElement.innerHTML = '';
    }
    if (window.instruments) {
      window.instruments.stopAllNotes();
    }
  }

  injectStyles() {
      applyCss(`
        @font-face {
          font-family: 'Bravura';
          src: url('https://cdn.jsdelivr.net/gh/steinbergmedia/bravura@master/redist/woff/BravuraText.woff') format('woff'),
               url('https://cdn.jsdelivr.net/gh/steinbergmedia/bravura@master/redist/otf/BravuraText.otf') format('opentype');
          font-display: swap;
        }
  
        html, body {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
        }
  
        .v-modal {
          position: absolute;
          background: rgba(18, 18, 28, 0.96) !important;
          backdrop-filter: blur(14px) !important;
          -webkit-backdrop-filter: blur(14px) !important;
          border: 1px solid rgba(255, 255, 255, 0.18) !important;
          border-radius: 16px !important;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7) !important;
          color: white !important;
          padding: 24px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          font-family: 'Architects Daughter', Arial, sans-serif !important;
          animation: modalFadeIn 0.2s ease-out;
        }
        
        @keyframes modalFadeIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
  
        .v-btn {
          font-family: 'Architects Daughter', Arial, sans-serif !important;
          font-size: 18px;
          padding: 10px 24px;
          background: rgba(255, 255, 255, 0.08);
          border: 2px solid rgba(255, 255, 255, 0.2);
          color: white;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          outline: none;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
        }
        .v-btn:hover {
          background: rgba(255, 255, 255, 0.18);
          border-color: rgba(255, 255, 255, 0.4);
          transform: translateY(-2px);
          box-shadow: 0 6px 12px rgba(0, 0, 0, 0.3);
        }
        .v-btn:active { transform: translateY(0); }
        
        .v-btn-primary { background: #007acc; border-color: #009cf7; }
        .v-btn-primary:hover { background: #0094f7; box-shadow: 0 0 15px rgba(0, 156, 247, 0.4); }
        .v-btn-success { background: #2e7d32; border-color: #4caf50; }
        .v-btn-success:hover { background: #388e3c; box-shadow: 0 0 15px rgba(76, 175, 80, 0.4); }
        .v-btn-danger { background: #c62828; border-color: #e53935; }
        .v-btn-danger:hover { background: #d32f2f; box-shadow: 0 0 15px rgba(229, 57, 53, 0.4); }
  
        .v-btn-mode {
          background: transparent;
          border: none;
          color: #94a3b8;
          padding: 5px 12px;
          font-size: 13px;
          font-family: 'Architects Daughter', Arial, sans-serif !important;
          cursor: pointer;
          transition: all 0.15s ease;
          outline: none;
        }
        .v-btn-mode:hover { background: rgba(255, 255, 255, 0.15); color: #fff; }
        .v-btn-mode.active { background: #0284c7; color: #fff; font-weight: bold; }
  
        .guess-the-note-wrapper {
          background-color: #a0a0a0;
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          height: 100%;
          overflow: hidden;
          position: relative;
          top: 0;
          left: 0;
          transition: background-color 0.5s ease-in-out;
        }
        .guess-the-note-wrapper svg.piano-svg {
          display: block;
          height: 100%;
          position: absolute;
          top: 0;
          left: 0; 
        }
        .guess-the-note-wrapper .white-key, .guess-the-note-wrapper .black-key {
          transition: fill 0.2s ease, stroke 0.2s ease;
          pointer-events: all;
        }
        .guess-the-note-wrapper .pulse { animation: pulse 0.5s ease-out; }
        @keyframes pulse { 0% { transform: scale(1); } 20% { transform: scale(1.6); } 100% { transform: scale(1); } }
        .guess-the-note-wrapper .feedbackText { margin: 0.5vh; font-size: 20px; color: #fff; text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5); }
        .guess-the-note-wrapper .noteDisplay { display: flex; justify-content: center; gap: 20px; margin: 0.5vh; }
        .guess-the-note-wrapper .noteDisplay span { width: 100px; text-align: center; visibility: hidden; text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5); display: inline-block; white-space: nowrap; }
        
        .guess-the-note-wrapper #startButton {
          font-family: 'Architects Daughter', Arial, sans-serif !important;
          background: #007acc !important;
          border: 2px solid #009cf7 !important;
          border-radius: 12px !important;
          color: #fff !important;
          font-weight: bold !important;
          cursor: pointer;
          transition: all 0.2s ease !important;
          outline: none;
          box-shadow: 0 4px 6px rgba(0,0,0,0.2) !important;
        }
        .guess-the-note-wrapper #startButton:hover {
          background: #0094f7 !important;
          transform: translateY(-2px) !important;
          box-shadow: 0 6px 12px rgba(0, 156, 247, 0.4) !important;
        }
  
        .guess-the-note-wrapper #startTwoPlayerButton {
          font-family: 'Architects Daughter', Arial, sans-serif !important;
          background: #2e7d32 !important;
          border: 2px solid #4caf50 !important;
          border-radius: 12px !important;
          color: #fff !important;
          font-weight: bold !important;
          cursor: pointer;
          transition: all 0.2s ease !important;
          outline: none;
          box-shadow: 0 4px 6px rgba(0,0,0,0.2) !important;
        }
  
        .guess-the-note-wrapper #playAgainButton {
          font-family: 'Architects Daughter', Arial, sans-serif !important;
          background: rgba(255, 255, 255, 0.12) !important;
          border: 2px solid rgba(255, 255, 255, 0.25) !important;
          border-radius: 10px !important;
          color: #fff !important;
          cursor: pointer;
          outline: none;
        }
  
        @keyframes pulseGreenPrompt { 0% { background-color: rgba(0, 0, 0, 0.75); } 8% { background-color: rgba(33, 190, 33, 0.92); } 100% { background-color: rgba(0, 0, 0, 0.75); } }
        @keyframes pulseRedPrompt { 0% { background-color: rgba(0, 0, 0, 0.75); } 20% { background-color: rgba(150, 33, 33, 0.92); } 100% { background-color: rgba(0, 0, 0, 0.75); } }
        .guess-the-note-wrapper .game-box.pulse-green { animation: pulseGreenPrompt 1.2s ease-out 1 !important; }
        .guess-the-note-wrapper .game-box.pulse-red { animation: pulseRedPrompt 0.8s ease-out 1 !important; }
        @keyframes pulseOverlay { 0% { transform: scale(1) translateX(-50%); opacity: 1; } 50% { transform: scale(1.6) translateX(-50%); opacity: 0.8; } 100% { transform: scale(1) translateX(-50%); opacity: 1; } }
        .guess-the-note-wrapper .pulse-overlay { animation: pulseOverlay 0.5s ease-out; transform-origin: center center; }
      `, 'guess-the-note-styles');
    }
}

globalThis.GuessTheNoteGame = GuessTheNoteGame;
if (typeof module !== 'undefined' && module.exports) module.exports = GuessTheNoteGame;