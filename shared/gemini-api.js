// Gemini API integration — proxied through server (Vertex AI with ADC)
// No API key needed on the client; all AI calls go through the Express server.

class GeminiAPI {
  constructor() {
    this.initialized = false;
    this._exerciseContextProvider = null;
    this._frameSnapshotFn = null;
  }

  // Set the exercise context provider function
  // providerFn(exerciseName) => { exerciseContext, formCriteria, commonErrors, breathingTechnique }
  setExerciseContextProvider(providerFn) {
    this._exerciseContextProvider = providerFn;
  }

  // Set a function that captures the current frame as base64 JPEG
  setFrameSnapshotProvider(fn) {
    this._frameSnapshotFn = fn;
  }

  // Initialize — check server availability
  async initialize() {
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const config = await response.json();
        this.initialized = !!config.hasVertexAI;
        if (this.initialized) {
          console.log('Gemini API initialized (server-proxied Vertex AI)');
        }
        return this.initialized;
      }
    } catch (error) {
      console.warn('Server not available for AI feedback:', error);
    }
    this.initialized = false;
    return false;
  }

  // Generate exercise feedback via server endpoint
  async generateExerciseFeedback(exerciseData) {
    if (!this.initialized) {
      await this.initialize();
      if (!this.initialized) {
        return {
          success: false,
          feedback: 'AI feedback unavailable — server not connected.',
          sections: null,
        };
      }
    }

    try {
      const formattedData = this.formatExerciseData(exerciseData);
      if (!formattedData) {
        return {
          success: false,
          feedback: 'No exercise data available.',
          sections: null,
        };
      }

      // Build context from provider
      let exerciseContext = {};
      if (this._exerciseContextProvider) {
        exerciseContext = this._exerciseContextProvider(formattedData.exerciseName);
      }

      // Capture frame snapshot if provider is set
      let frameSnapshot = null;
      if (this._frameSnapshotFn) {
        try {
          frameSnapshot = this._frameSnapshotFn();
        } catch (e) {
          console.warn('Failed to capture frame snapshot:', e);
        }
      }

      // Store historical data in localStorage
      this.processHistoricalDataInBackground(exerciseData);

      console.log('Sending exercise data to server for AI analysis');

      const response = await fetch('/api/realtime/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exerciseData: formattedData,
          exerciseContext,
          frameSnapshot,
          exerciseType: formattedData.exerciseName,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error('Server feedback error:', err);
        return {
          success: false,
          feedback: 'Error generating feedback. Please try again.',
          sections: null,
        };
      }

      const result = await response.json();

      if (result.success) {
        const feedbackText = result.feedback || '';
        const feedbackSections = result.sections || this.formatFeedbackResponse(feedbackText);
        return {
          success: true,
          feedback: feedbackText,
          sections: feedbackSections,
        };
      }

      return {
        success: false,
        feedback: result.error || 'Server returned an error.',
        sections: null,
      };
    } catch (error) {
      console.error('Error generating exercise feedback:', error);
      return {
        success: false,
        feedback: 'Network error when contacting server.',
        sections: null,
      };
    }
  }

  // Format the server response into structured feedback sections
  formatFeedbackResponse(responseText) {
    try {
      const sectionKeys = ['FORM_ASSESSMENT', 'IMPROVEMENT_TIP', 'PROGRESS_FEEDBACK', 'BREATHING_REMINDER'];
      const sections = {};

      sectionKeys.forEach((key) => {
        sections[key] = 'No feedback available for this section.';
      });

      let currentSection = null;
      let currentContent = [];

      const lines = responseText.split('\n');

      for (const line of lines) {
        const sectionMatch = line.match(/^([A-Z_]+):$/);

        if (sectionMatch && sectionKeys.includes(sectionMatch[1])) {
          if (currentSection) {
            sections[currentSection] = currentContent.join(' ').trim();
            currentContent = [];
          }
          currentSection = sectionMatch[1];
        } else if (currentSection && line.trim()) {
          currentContent.push(line.trim());
        }
      }

      if (currentSection && currentContent.length > 0) {
        sections[currentSection] = currentContent.join(' ').trim();
      }

      const hasContent = Object.values(sections).some(
        (content) => content !== 'No feedback available for this section.'
      );

      if (!hasContent) {
        const paragraphs = responseText.split('\n\n').filter((p) => p.trim());
        if (paragraphs.length >= 4) {
          sections.FORM_ASSESSMENT = paragraphs[0].replace(/^FORM_ASSESSMENT:?\s*/i, '');
          sections.IMPROVEMENT_TIP = paragraphs[1].replace(/^IMPROVEMENT_TIP:?\s*/i, '');
          sections.PROGRESS_FEEDBACK = paragraphs[2].replace(/^PROGRESS_FEEDBACK:?\s*/i, '');
          sections.BREATHING_REMINDER = paragraphs[3].replace(/^BREATHING_REMINDER:?\s*/i, '');
        }
      }

      return sections;
    } catch (error) {
      console.error('Error formatting feedback response:', error);
      return {
        FORM_ASSESSMENT: 'Your form looks generally good. Focus on maintaining proper posture.',
        IMPROVEMENT_TIP: 'Keep your movements controlled and deliberate throughout the exercise.',
        PROGRESS_FEEDBACK: "You're making good progress. Keep up the great work!",
        BREATHING_REMINDER: 'Remember to breathe — exhale during exertion, inhale during the relaxation phase.',
      };
    }
  }

  // Process historical exercise data in the background (localStorage)
  processHistoricalDataInBackground(exerciseData) {
    if (!exerciseData || exerciseData.length < 5) return;

    try {
      this.storeExerciseData(exerciseData);
    } catch (error) {
      console.error('Error in background processing:', error);
    }
  }

  // Store exercise data for trend analysis
  storeExerciseData(exerciseData) {
    if (!exerciseData || exerciseData.length === 0) return;

    try {
      const exerciseName = exerciseData[0].exerciseName;

      let storedData = {};
      try {
        const existingData = localStorage.getItem('exercise-history');
        if (existingData) {
          storedData = JSON.parse(existingData);
        }
      } catch (e) {
        console.warn('Error parsing stored exercise data:', e);
      }

      if (!storedData[exerciseName]) {
        storedData[exerciseName] = [];
      }

      const sessionSummary = {
        timestamp: Date.now(),
        repCount: exerciseData[exerciseData.length - 1].repCount,
        formQuality: this.calculateAverageFormQuality(exerciseData),
        duration: exerciseData[exerciseData.length - 1].timestamp - exerciseData[0].timestamp,
      };

      storedData[exerciseName].push(sessionSummary);
      if (storedData[exerciseName].length > 10) {
        storedData[exerciseName] = storedData[exerciseName].slice(-10);
      }

      localStorage.setItem('exercise-history', JSON.stringify(storedData));
    } catch (error) {
      console.error('Error storing exercise data:', error);
    }
  }

  calculateAverageFormQuality(exerciseData) {
    if (!exerciseData || exerciseData.length === 0) return 'unknown';
    const goodCount = exerciseData.filter((data) => data.formQuality === 'good').length;
    const percentage = (goodCount / exerciseData.length) * 100;
    if (percentage >= 80) return 'excellent';
    if (percentage >= 60) return 'good';
    if (percentage >= 40) return 'fair';
    return 'needs_improvement';
  }

  // Format exercise data for the server request
  formatExerciseData(exerciseData) {
    if (!exerciseData || exerciseData.length === 0) return null;

    const mostRecent = exerciseData[exerciseData.length - 1];

    return {
      exerciseName: mostRecent.exerciseName,
      repCount: mostRecent.repCount,
      repGoal: mostRecent.repGoal,
      targetMuscles: mostRecent.targetMuscles,
      formQuality: mostRecent.formQuality,
      formIssues: mostRecent.formIssues || [],
      jointAngles: mostRecent.jointAngles,
      posture: mostRecent.posture,
      symmetry: mostRecent.symmetry,
      movement: mostRecent.movement,
      totalDataPoints: exerciseData.length,
    };
  }
}

// Export the GeminiAPI class
export const geminiAPI = new GeminiAPI();
