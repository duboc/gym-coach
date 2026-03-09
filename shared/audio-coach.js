// Audio Coach module for providing spoken feedback
class AudioCoach {
  constructor(options = {}) {
    // Initialize Web Speech API
    this.synth = window.speechSynthesis;
    this.voices = [];

    // Default options
    this.options = {
      enabled: true,
      volume: 1.0,
      rate: 1.0,
      pitch: 1.0,
      voiceIndex: 0,
      feedbackFrequency: 'normal', // 'minimal', 'normal', 'detailed'
      ...options
    };

    // Queue for managing speech
    this.speechQueue = [];
    this.isSpeaking = false;

    // Base phrases (general only — app-specific phrases registered via registerExercisePhrases)
    this.phrases = {
      general: {
        start: [
          "Let's begin your workout.",
          "Starting exercise tracking now.",
          "Ready to go. Let's start."
        ],
        stop: [
          "Workout complete. Good job!",
          "Exercise tracking stopped.",
          "Great work! You've finished your session."
        ],
        encouragement: [
          "You're doing great!",
          "Keep it up!",
          "Excellent work!",
          "You've got this!",
          "Stay strong!"
        ],
        breathing: [
          "Remember to breathe.",
          "Inhale on the way down, exhale on the way up.",
          "Keep your breathing steady."
        ]
      }
    };

    // Initialize voices when available
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = this.loadVoices.bind(this);
    }
    this.loadVoices();

    // Track last feedback time to avoid too frequent feedback
    this.lastFeedbackTime = {
      form: 0,
      rep: 0,
      encouragement: 0
    };

    // Minimum time between feedback types (in milliseconds)
    this.feedbackCooldown = {
      form: 10000,      // 10 seconds between form feedback
      rep: 3000,        // 3 seconds between rep counts
      encouragement: 15000  // 15 seconds between encouragement
    };
  }

  // Register exercise-specific phrases (called by each app on init)
  registerExercisePhrases(exerciseName, phrases) {
    this.phrases[exerciseName] = phrases;
  }

  // Load available voices
  loadVoices() {
    const allVoices = this.synth.getVoices();
    console.log(`Total available voices: ${allVoices.length}`);

    this.voices = allVoices.filter(voice => {
      const lang = voice.lang.toLowerCase();
      return lang.startsWith('en') || lang.startsWith('es') || lang.startsWith('pt');
    });

    console.log(`Loaded ${this.voices.length} voices for speech synthesis (English, Spanish, Portuguese only)`);

    this.voices.forEach(voice => {
      console.log(`Available voice: ${voice.name} (${voice.lang})`);
    });

    if (this.voices.length > 0) {
      const englishVoice = this.voices.findIndex(voice => voice.lang.toLowerCase().startsWith('en'));
      if (englishVoice !== -1) {
        this.options.voiceIndex = englishVoice;
        console.log(`Set default voice to English: ${this.voices[englishVoice].name} (${this.voices[englishVoice].lang})`);
      }
    }
  }

  // Enable or disable audio feedback
  setEnabled(enabled) {
    this.options.enabled = enabled;
    if (!enabled) {
      this.stop();
    }
  }

  // Update voice settings
  updateVoiceSettings(settings) {
    this.options = { ...this.options, ...settings };
  }

  // Stop all speech
  stop() {
    if (this.synth.speaking) {
      this.synth.cancel();
    }
    this.speechQueue = [];
    this.isSpeaking = false;
  }

  // Speak text with specified priority
  speak(text, priority = 'normal') {
    if (!this.options.enabled || !text) return;

    this.speechQueue.push({
      text,
      priority: priority === 'high' ? 2 : (priority === 'normal' ? 1 : 0)
    });

    this.speechQueue.sort((a, b) => b.priority - a.priority);

    if (!this.isSpeaking) {
      this.processQueue();
    }
  }

  // Process the speech queue
  processQueue() {
    if (this.speechQueue.length === 0) {
      this.isSpeaking = false;
      return;
    }

    try {
      this.isSpeaking = true;
      const item = this.speechQueue.shift();

      const utterance = new SpeechSynthesisUtterance(item.text);

      utterance.volume = this.options.volume;
      utterance.rate = this.options.rate;
      utterance.pitch = this.options.pitch;

      if (this.voices.length > 0) {
        const voiceIndex = Math.min(this.options.voiceIndex, this.voices.length - 1);
        utterance.voice = this.voices[voiceIndex];
      }

      utterance.onend = () => {
        setTimeout(() => this.processQueue(), 250);
      };

      utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event);
        this.isSpeaking = false;
        setTimeout(() => this.processQueue(), 500);
      };

      if (this.synth.speaking) {
        console.warn('Speech synthesis was already active, canceling previous speech');
        this.synth.cancel();
        setTimeout(() => {
          try {
            this.synth.speak(utterance);
          } catch (err) {
            console.error('Error in speech synthesis speak:', err);
            this.isSpeaking = false;
            setTimeout(() => this.processQueue(), 500);
          }
        }, 300);
      } else {
        try {
          this.synth.speak(utterance);
        } catch (err) {
          console.error('Error in speech synthesis speak:', err);
          this.isSpeaking = false;
          setTimeout(() => this.processQueue(), 500);
        }
      }
    } catch (error) {
      console.error('Error in processQueue:', error);
      this.isSpeaking = false;
      setTimeout(() => this.processQueue(), 1000);
    }
  }

  // Announce the start of an exercise
  announceExerciseStart(exerciseName) {
    const startPhrase = this.getRandomPhrase('general', 'start');
    const exercisePhrase = `Starting ${exerciseName}.`;
    this.speak(`${startPhrase} ${exercisePhrase}`, 'high');
  }

  // Announce the end of an exercise
  announceExerciseEnd(exerciseName, repCount) {
    const endPhrase = this.getRandomPhrase('general', 'stop');
    const summaryPhrase = `You completed ${repCount} repetitions of ${exerciseName}.`;
    this.speak(`${endPhrase} ${summaryPhrase}`, 'high');
  }

  // Count reps out loud
  countRep(count) {
    const now = Date.now();
    if (now - this.lastFeedbackTime.rep < this.feedbackCooldown.rep) {
      return;
    }
    this.lastFeedbackTime.rep = now;
    this.speak(`${count}`, 'normal');

    if (count > 0 && count % 5 === 0) {
      this.provideEncouragement();
    }
  }

  // Announce partial reps
  announcePartialRep(quality) {
    const now = Date.now();
    if (now - this.lastFeedbackTime.rep < this.feedbackCooldown.rep) {
      return;
    }
    this.lastFeedbackTime.rep = now;

    if (quality === 0.5) {
      this.speak("Half rep", 'normal');
    } else if (quality < 0.5) {
      this.speak("Partial rep", 'normal');
    } else if (quality > 0.5 && quality < 1.0) {
      this.speak("Almost there", 'normal');
    }
  }

  // Provide form feedback based on detected issues
  provideFormFeedback(exerciseName, formIssues) {
    const now = Date.now();
    if (now - this.lastFeedbackTime.form < this.feedbackCooldown.form) {
      return;
    }

    if (!formIssues || formIssues.length === 0 || !this.phrases[exerciseName]) {
      return;
    }

    let feedbackProvided = false;

    for (const issue of formIssues) {
      if (!this.phrases[exerciseName].corrections) break;
      for (const [category, phrases] of Object.entries(this.phrases[exerciseName].corrections)) {
        if (issue.toLowerCase().includes(category.toLowerCase())) {
          const phrase = phrases[Math.floor(Math.random() * phrases.length)];
          this.speak(phrase, 'high');
          feedbackProvided = true;
          break;
        }
      }
      if (feedbackProvided) break;
    }

    if (feedbackProvided) {
      this.lastFeedbackTime.form = now;
    }
  }

  // Provide breathing cues
  provideBreathingCue(exerciseName, repState) {
    if (this.options.feedbackFrequency === 'minimal') return;

    const now = Date.now();
    if (now - this.lastFeedbackTime.form < this.feedbackCooldown.form * 2) {
      return;
    }

    let breathingPhrase;

    if (this.phrases[exerciseName] && this.phrases[exerciseName].breathing) {
      breathingPhrase = this.getRandomPhrase(exerciseName, 'breathing');
    } else {
      breathingPhrase = this.getRandomPhrase('general', 'breathing');
    }

    this.speak(breathingPhrase, 'low');
  }

  // Provide encouragement
  provideEncouragement() {
    const now = Date.now();
    if (now - this.lastFeedbackTime.encouragement < this.feedbackCooldown.encouragement) {
      return;
    }

    const phrase = this.getRandomPhrase('general', 'encouragement');
    this.speak(phrase, 'normal');
    this.lastFeedbackTime.encouragement = now;
  }

  // Provide a summary of the workout
  provideSummary(exerciseName, metrics) {
    if (!metrics) return;

    let summary = `You completed ${metrics.repCount} repetitions of ${exerciseName}. `;

    if (metrics.formQuality) {
      if (metrics.formQuality === "good" || metrics.formQuality === "excellent") {
        summary += "Your form was good throughout the exercise. ";
      } else {
        summary += "There's room for improvement in your form. ";
        if (metrics.formIssues && metrics.formIssues.length > 0) {
          summary += `Focus on: ${metrics.formIssues.join(', ')}. `;
        }
      }
    }

    summary += this.getRandomPhrase('general', 'encouragement');
    this.speak(summary, 'high');
  }

  // Get a random phrase from the phrases collection
  getRandomPhrase(category, type) {
    if (this.phrases[category] && this.phrases[category][type]) {
      const phrases = this.phrases[category][type];
      return phrases[Math.floor(Math.random() * phrases.length)];
    }
    return '';
  }
}

// Export the AudioCoach class
export default AudioCoach;
