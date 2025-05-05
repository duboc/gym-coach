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
    
    // Exercise-specific phrases
    this.phrases = {
      // General phrases
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
      },
      
      // Exercise-specific phrases
      "Dumbbell Bicep Curls": {
        form: [
          "Keep your elbows fixed at your sides.",
          "Maintain a straight wrist throughout the movement.",
          "Control the weight on the way down.",
          "Fully extend your arms at the bottom."
        ],
        breathing: [
          "Exhale as you curl up, inhale as you lower.",
          "Breathe out during the effort phase."
        ],
        corrections: {
          "elbow": [
            "Keep your elbows steady at your sides.",
            "Don't let your elbows move forward."
          ],
          "shoulder": [
            "Keep your shoulders down and back.",
            "Don't shrug your shoulders."
          ],
          "wrist": [
            "Keep your wrists straight.",
            "Don't bend your wrists."
          ]
        }
      },
      
      "Dumbbell Shoulder Press": {
        form: [
          "Keep your core engaged.",
          "Press the weights directly upward.",
          "Lower the weights with control.",
          "Keep your back straight."
        ],
        breathing: [
          "Exhale as you press up, inhale as you lower.",
          "Breathe out during the pressing phase."
        ],
        corrections: {
          "elbow": [
            "Keep your elbows at 90 degrees at the bottom.",
            "Don't flare your elbows too far out."
          ],
          "shoulder": [
            "Keep your shoulders down away from your ears.",
            "Don't shrug as you press."
          ],
          "back": [
            "Maintain a neutral spine.",
            "Don't arch your lower back."
          ]
        }
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
  
  // Load available voices
  loadVoices() {
    // Get all available voices
    const allVoices = this.synth.getVoices();
    console.log(`Total available voices: ${allVoices.length}`);
    
    // Filter voices by language (English, Spanish, Portuguese)
    this.voices = allVoices.filter(voice => {
      const lang = voice.lang.toLowerCase();
      return lang.startsWith('en') || lang.startsWith('es') || lang.startsWith('pt');
    });
    
    console.log(`Loaded ${this.voices.length} voices for speech synthesis (English, Spanish, Portuguese only)`);
    
    // Log the selected voices for debugging
    this.voices.forEach(voice => {
      console.log(`Available voice: ${voice.name} (${voice.lang})`);
    });
    
    // Set default voice to English if available
    if (this.voices.length > 0) {
      // Find an English voice to use as default
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
      this.stop(); // Stop any ongoing speech
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
    
    // Add to queue with priority
    this.speechQueue.push({
      text,
      priority: priority === 'high' ? 2 : (priority === 'normal' ? 1 : 0)
    });
    
    // Sort queue by priority (high to low)
    this.speechQueue.sort((a, b) => b.priority - a.priority);
    
    // Process queue if not already speaking
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
      
      // Create utterance
      const utterance = new SpeechSynthesisUtterance(item.text);
      
      // Set voice options
      utterance.volume = this.options.volume;
      utterance.rate = this.options.rate;
      utterance.pitch = this.options.pitch;
      
      // Set voice if available
      if (this.voices.length > 0) {
        const voiceIndex = Math.min(this.options.voiceIndex, this.voices.length - 1);
        utterance.voice = this.voices[voiceIndex];
      }
      
      // Handle utterance completion
      utterance.onend = () => {
        setTimeout(() => this.processQueue(), 250); // Small delay between utterances
      };
      
      utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event);
        this.isSpeaking = false; // Reset speaking state
        setTimeout(() => this.processQueue(), 500); // Continue with next item after a delay
      };
      
      // Check if synthesis is already speaking and cancel if needed
      if (this.synth.speaking) {
        console.warn('Speech synthesis was already active, canceling previous speech');
        this.synth.cancel();
        // Add a small delay before speaking the new utterance
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
        // Speak the utterance
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
      // Try to continue with the next item after a delay
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
    // Check cooldown to avoid too frequent counting
    const now = Date.now();
    if (now - this.lastFeedbackTime.rep < this.feedbackCooldown.rep) {
      return;
    }
    
    this.lastFeedbackTime.rep = now;
    this.speak(`${count}`, 'normal');
    
    // Add encouragement occasionally
    if (count > 0 && count % 5 === 0) {
      this.provideEncouragement();
    }
  }
  
  // Announce partial reps
  announcePartialRep(quality) {
    // Check cooldown to avoid too frequent counting
    const now = Date.now();
    if (now - this.lastFeedbackTime.rep < this.feedbackCooldown.rep) {
      return;
    }
    
    this.lastFeedbackTime.rep = now;
    
    // Different messages based on rep quality
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
    // Check cooldown to avoid too frequent form feedback
    const now = Date.now();
    if (now - this.lastFeedbackTime.form < this.feedbackCooldown.form) {
      return;
    }
    
    // Skip if no issues or exercise not recognized
    if (!formIssues || formIssues.length === 0 || !this.phrases[exerciseName]) {
      return;
    }
    
    // Find the first issue we have a correction for
    let feedbackProvided = false;
    
    for (const issue of formIssues) {
      // Find which correction category this issue falls under
      for (const [category, phrases] of Object.entries(this.phrases[exerciseName].corrections)) {
        if (issue.toLowerCase().includes(category.toLowerCase())) {
          // Get a random correction phrase for this category
          const phrase = phrases[Math.floor(Math.random() * phrases.length)];
          this.speak(phrase, 'high');
          feedbackProvided = true;
          break;
        }
      }
      
      if (feedbackProvided) break; // Only provide one correction at a time
    }
    
    if (feedbackProvided) {
      this.lastFeedbackTime.form = now;
    }
  }
  
  // Provide breathing cues
  provideBreathingCue(exerciseName, repState) {
    // Only provide breathing cues in certain states and not too frequently
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
    // Check cooldown to avoid too frequent encouragement
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
    
    // Add form quality feedback
    if (metrics.formQuality) {
      if (metrics.formQuality === "good" || metrics.formQuality === "excellent") {
        summary += "Your form was good throughout the exercise. ";
      } else {
        summary += "There's room for improvement in your form. ";
        
        // Add specific form issues if available
        if (metrics.formIssues && metrics.formIssues.length > 0) {
          summary += `Focus on: ${metrics.formIssues.join(', ')}. `;
        }
      }
    }
    
    // Add encouragement to end
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
