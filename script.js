class BeatopiaGame {
  constructor() {
    this.score = 0;
    this.combo = 0;
    this.health = 100;
    this.maxHealth = 100;
    this.notes = [];
    this.gameRunning = false;
    this.hitZoneY = 480;
    this.fallSpeed = 200;
    this.audioContext = null;
    this.musicBuffer = null;
    this.musicSource = null;
    this.analyser = null;
    this.startTime = 0;
    this.songDuration = 0;
    this.beats = [];
    this.currentBeatIndex = 0;
    this.audioFile = null;
    this.gainNode = null;
    this.fallDuration = 3000; // 3 seconds for notes to fall

    this.minHealthDamage = 2; // Add minimum damage threshold
    this.maxComboBonus = 10; // Add maximum health bonus from combos

    this.pendingTimeouts = []; // Add this to track timeouts

    this.initializeGame();
    this.initializeAudio();
  }

  async initializeAudio() {
    try {
      this.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
    } catch (error) {
      console.warn("Audio initialization failed:", error);
    }
  }

  async loadAudioFile(file) {
    document.getElementById("loadingText").style.display = "block";
    document.getElementById("songInfo").textContent = "";

    try {
      const arrayBuffer = await file.arrayBuffer();
      this.musicBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      this.songDuration = this.musicBuffer.duration;

      // Analyze the audio for beat detection
      await this.analyzeAudio();

      document.getElementById("loadingText").style.display = "none";
      document.getElementById("songInfo").innerHTML = `
                        <strong>${file.name}</strong><br>
                        Duration: ${Math.floor(
                          this.songDuration / 60
                        )}:${String(
        Math.floor(this.songDuration % 60)
      ).padStart(2, "0")}<br>
                        Beats detected: ${this.beats.length}
                    `;

      const startBtn = document.getElementById("startBtn");
      startBtn.disabled = false;
      startBtn.textContent = "Start Game";
    } catch (error) {
      console.error("Error loading audio file:", error);
      document.getElementById("loadingText").style.display = "none";
      document.getElementById("songInfo").textContent =
        "Error loading audio file. Please try a different format.";
    }
  }

  // Add this new method for deterministic random numbers
  seededRandom(seed) {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  }

  async analyzeAudio() {
    // Create an offline audio context for analysis
    const offlineContext = new OfflineAudioContext(
      this.musicBuffer.numberOfChannels,
      this.musicBuffer.length,
      this.musicBuffer.sampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = this.musicBuffer;

    // Create analyzer for beat detection
    const analyser = offlineContext.createAnalyser();
    analyser.fftSize = 2048;

    source.connect(analyser);
    analyser.connect(offlineContext.destination);

    // Simple beat detection algorithm
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // For simplicity, we'll create beats based on song structure
    // In a real implementation, you'd use more sophisticated beat detection
    this.beats = [];
    const beatsPerSecond = 2;
    const totalBeats = Math.floor(
      (this.songDuration - this.fallDuration / 1000) * beatsPerSecond
    );

    // Replace random track generation with seeded version
    let seed = 0;
    for (let i = 0; i < totalBeats; i++) {
      const time = (i / beatsPerSecond) * 1000; // Convert to milliseconds
      const track = Math.floor(this.seededRandom(seed++) * 4);
      this.beats.push({ time, track });
    }

    // Sort beats by time
    this.beats.sort((a, b) => a.time - b.time);
  }

  initializeGame() {
    this.gameArea = document.getElementById("gameArea");
    this.scoreElement = document.getElementById("score");
    this.comboElement = document.getElementById("combo");
    this.healthFill = document.getElementById("healthFill");
    this.progressFill = document.getElementById("progressFill");
    this.volumeSlider = document.getElementById("volumeSlider");

    // File input handler
    document.getElementById("audioFile").addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        this.audioFile = e.target.files[0];
        this.loadAudioFile(this.audioFile);
      }
    });

    // Update health display
    this.updateHealthDisplay();

    // Volume control
    this.volumeSlider.addEventListener("input", (e) => {
      if (this.gainNode) {
        this.gainNode.gain.value = e.target.value;
      }
    });

    // Add event listeners
    document.addEventListener("keydown", (e) => this.handleKeyPress(e));
    document.querySelectorAll(".control-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.hitNote(parseInt(btn.dataset.track));
      });
    });
  }

  async startGame() {
    if (!this.musicBuffer) {
      alert("Please load an audio file first!");
      return;
    }

    // Clean up any existing game state first
    this.cleanup();

    document.getElementById("startScreen").style.display = "none";
    this.gameRunning = true;
    this.startTime = Date.now();
    this.currentBeatIndex = 0;

    // Start music
    if (this.audioContext && this.musicBuffer) {
      await this.audioContext.resume();
      this.playMusic();
    }

    this.gameLoop();
    this.spawnBeats();
  }

  playMusic() {
    // Stop any existing music source
    if (this.musicSource) {
      try {
        this.musicSource.stop();
        this.musicSource.disconnect();
      } catch (e) {
        // Audio might already be stopped
      }
    }

    this.musicSource = this.audioContext.createBufferSource();
    this.musicSource.buffer = this.musicBuffer;

    // Add gain node for volume control
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = this.volumeSlider.value;

    this.musicSource.connect(this.gainNode);
    this.gainNode.connect(this.audioContext.destination);

    this.musicSource.start();

    // End game when music ends
    this.musicSource.onended = () => {
      if (this.gameRunning) {
        // Only trigger win if we haven't already
        const currentTime = Date.now() - this.startTime;
        const songDurationMs = this.songDuration * 1000;
        if (currentTime >= songDurationMs) {
          this.winGame();
        }
      }
    };
  }

  winGame() {
    this.gameRunning = false;

    // Clear all timeouts first
    this.pendingTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    this.pendingTimeouts = [];

    // Stop and remove all notes immediately
    const allNotes = document.querySelectorAll(".note");
    allNotes.forEach((note) => {
      note.style.animation = "none";
      if (note.parentNode) {
        note.parentNode.removeChild(note);
      }
    });

    // Clear notes array
    this.notes = [];

    // Stop music
    if (this.musicSource) {
      try {
        this.musicSource.stop();
        this.musicSource.disconnect();
      } catch (e) {}
    }

    // Prevent any new spawns
    this.currentBeatIndex = this.beats.length;

    document.getElementById("winFinalScore").textContent = this.score;
    document.getElementById("winScreen").style.display = "flex";
  }

  // Rename current endGame to loseGame and update references
  loseGame() {
    this.gameRunning = false;
    if (this.musicSource) {
      try {
        this.musicSource.stop();
        this.musicSource.disconnect();
      } catch (e) {
        // Audio might already be stopped
      }
    }
    document.getElementById("finalScore").textContent = this.score;
    document.getElementById("gameOverScreen").style.display = "flex";
  }

  spawnBeats() {
    if (!this.gameRunning) return;

    const currentTime = Date.now() - this.startTime;
    const songDurationMs = this.songDuration * 1000;
    const safeEndTime = songDurationMs - this.fallDuration;

    // Don't spawn new notes if we're near the end
    if (currentTime >= safeEndTime) {
      this.currentBeatIndex = this.beats.length; // Prevent further spawns
      return;
    }

    // Spawn notes from detected beats
    while (this.currentBeatIndex < this.beats.length) {
      const beat = this.beats[this.currentBeatIndex];

      if (beat.time <= currentTime + this.fallDuration) {
        const delay = beat.time - currentTime;
        if (delay > 0) {
          setTimeout(() => {
            if (this.gameRunning) {
              this.createNote(beat.track);
            }
          }, delay);
        } else {
          this.createNote(beat.track);
        }
        this.currentBeatIndex++;
      } else {
        break;
      }
    }

    setTimeout(() => this.spawnBeats(), 100);
  }

  handleKeyPress(e) {
    if (!this.gameRunning) return;

    const keyMap = {
      a: 0,
      A: 0,
      s: 1,
      S: 1,
      d: 2,
      D: 2,
      f: 3,
      F: 3,
    };

    if (keyMap[e.key] !== undefined) {
      this.hitNote(keyMap[e.key]);
    }
  }

  createNote(track) {
    const note = document.createElement("div");
    note.className = `note track-${track}`;
    note.dataset.track = track;
    note.dataset.startTime = Date.now();

    const trackElement = document.querySelectorAll(".track")[track];
    trackElement.appendChild(note);

    note.style.animationDuration = `${this.fallDuration}ms`;

    const noteObj = {
      element: note,
      track: track,
      startTime: Date.now(),
      duration: this.fallDuration,
      missed: false, // Add this flag
    };

    this.notes.push(noteObj);

    // Store timeout reference
    const timeoutId = setTimeout(() => {
      if (this.notes.includes(noteObj) && !noteObj.missed) {
        noteObj.missed = true;
        if (note.parentNode) {
          note.parentNode.removeChild(note);
        }
        this.notes = this.notes.filter((n) => n !== noteObj);
        this.takeDamage(5);
        this.combo = 0;
        this.updateDisplay();
      }
    }, this.fallDuration);

    this.pendingTimeouts.push(timeoutId);
  }

  hitNote(track) {
    const currentTime = Date.now();
    const hitZoneNotes = this.notes.filter((note) => {
      if (note.track !== track) return false;

      const elapsed = currentTime - note.startTime;
      const progress = elapsed / note.duration;
      const noteY = progress * 620;

      return Math.abs(noteY - this.hitZoneY) < 80;
    });

    if (hitZoneNotes.length > 0) {
      const note = hitZoneNotes[0];
      this.processHit(note, track);
    } else {
      this.combo = 0;
      this.takeDamage(5);
      this.showFeedback("Miss", "miss");
      this.updateDisplay();
    }
  }

  processHit(note, track) {
    const currentTime = Date.now();
    const elapsed = currentTime - note.startTime;
    const progress = elapsed / note.duration;
    const noteY = progress * 620;

    const distance = Math.abs(noteY - this.hitZoneY);
    let points = 0;
    let feedback = "";
    let feedbackClass = "";
    let healthBonus = 0;

    if (distance < 25) {
      points = 100;
      feedback = "Perfect!";
      feedbackClass = "perfect";
      healthBonus = 5;
      this.combo++;
    } else if (distance < 50) {
      points = 50;
      feedback = "Good!";
      feedbackClass = "good";
      healthBonus = 3;
      this.combo++;
    } else {
      points = 10;
      feedback = "OK";
      feedbackClass = "good";
      healthBonus = 1;
      // Don't reset combo for OK hits
    }

    // Add combo bonus to health
    healthBonus += Math.min(this.maxComboBonus, Math.floor(this.combo / 10));

    const comboMultiplier = Math.min(4, Math.floor(this.combo / 10) + 1);
    points *= comboMultiplier;

    this.score += points;
    this.health = Math.min(this.maxHealth, this.health + healthBonus);

    if (note.element.parentNode) {
      note.element.parentNode.removeChild(note.element);
    }
    this.notes = this.notes.filter((n) => n !== note);

    this.showFeedback(feedback, feedbackClass);
    this.updateDisplay();
  }

  takeDamage(amount) {
    // Reduce damage based on combo
    const comboReduction = Math.min(0.5, this.combo / 50); // Up to 50% reduction
    const adjustedDamage = Math.max(
      this.minHealthDamage,
      amount * (1 - comboReduction)
    );

    this.health = Math.max(0, this.health - adjustedDamage);
    this.updateHealthDisplay(); // Update display immediately

    if (this.health <= 0) {
      this.health = 0;
      this.updateHealthDisplay();
      this.loseGame(); // Changed from endGame to loseGame
    }
  }

  async loadDefaultSong() {
    const defaultSongPath =
      "modern-soul-drum-loop-ride-dry-beat-80-bpm-275276.mp3";
    try {
      document.getElementById("loadingText").style.display = "block";
      document.getElementById("songInfo").textContent = "";

      const response = await fetch(defaultSongPath);
      if (!response.ok) throw new Error("Failed to load default song");

      const arrayBuffer = await response.arrayBuffer();
      const file = new File(
        [arrayBuffer],
        "modern-soul-drum-loop-ride-dry-beat-80-bpm-275276.mp3",
        {
          type: "audio/mpeg",
        }
      );
      await this.loadAudioFile(file);
    } catch (error) {
      console.error("Error loading default song:", error);
      document.getElementById("loadingText").style.display = "none";
      document.getElementById("songInfo").textContent =
        "Error loading default song. Please try uploading your own.";
    }
  }

  updateHealthDisplay() {
    const healthPercentage = (this.health / this.maxHealth) * 100;
    this.healthFill.style.width = `${healthPercentage}%`;
  }

  updateSongProgress() {
    const currentTime = Date.now() - this.startTime;
    // Convert songDuration from seconds to milliseconds for accurate comparison
    const songDurationMs = this.songDuration * 1000;
    const progress = Math.min(100, (currentTime / songDurationMs) * 100);
    this.progressFill.style.width = `${progress}%`;

    // If we've exceeded the song duration, trigger win
    if (currentTime >= songDurationMs && this.gameRunning) {
      this.winGame();
    }
  }

  endGame() {
    this.gameRunning = false;
    this.cleanup();

    document.getElementById("finalScore").textContent = this.score;
    document.getElementById("gameOverScreen").style.display = "flex";
  }

  cleanup() {
    // Stop and clean up audio
    if (this.musicSource) {
      try {
        this.musicSource.stop();
        this.musicSource.disconnect();
      } catch (e) {
        // Audio might already be stopped
      }
      this.musicSource = null;
    }

    // Clear all notes from DOM
    this.notes.forEach((note) => {
      if (note.element.parentNode) {
        note.element.parentNode.removeChild(note.element);
      }
    });
    this.notes = [];

    // Clear any remaining feedback elements
    const feedbacks = this.gameArea.querySelectorAll(".feedback");
    feedbacks.forEach((feedback) => {
      feedback.parentNode.removeChild(feedback);
    });

    // Clear all pending timeouts
    this.pendingTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    this.pendingTimeouts = [];

    // Reset game state
    this.score = 0;
    this.combo = 0;
    this.health = 100;
    this.currentBeatIndex = 0;
    this.updateDisplay();

    document.getElementById("winScreen").style.display = "none";
    document.getElementById("gameOverScreen").style.display = "none";
  }

  showFeedback(text, className) {
    const feedback = document.createElement("div");
    feedback.className = `feedback ${className}`;
    feedback.textContent = text;
    this.gameArea.appendChild(feedback);

    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.parentNode.removeChild(feedback);
      }
    }, 800);
  }

  updateDisplay() {
    this.scoreElement.textContent = this.score;
    this.comboElement.textContent = this.combo;
    this.updateHealthDisplay();
    this.updateSongProgress();
  }

  gameLoop() {
    if (!this.gameRunning) return;

    this.updateSongProgress();

    // Only remove notes that have exceeded their duration
    this.notes = this.notes.filter((note) => {
      const elapsed = Date.now() - note.startTime;
      const keep = elapsed < note.duration;
      if (!keep && !note.missed) {
        note.missed = true;
        if (note.element.parentNode) {
          note.element.parentNode.removeChild(note.element);
        }
        this.takeDamage(5);
        this.combo = 0;
        this.updateDisplay();
      }
      return keep;
    });

    requestAnimationFrame(() => this.gameLoop());
  }
}

let game;

async function startGame() {
  if (game) {
    game.cleanup();
  }
  await game.startGame();
}

async function restartGame() {
  if (game) {
    game.cleanup();
  }
  document.getElementById("gameOverScreen").style.display = "none";
  await game.startGame();
}

async function loadDefaultSong() {
  if (game) {
    await game.loadDefaultSong();
  }
}

// Initialize the game instance for event handling
game = new BeatopiaGame();
