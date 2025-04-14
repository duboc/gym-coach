// Import the environment loader
import { loadEnv } from './env-loader.js';

// Class to handle Gemini API integration
class GeminiAPI {
  constructor() {
    this.apiKey = null;
    this.apiEndpoint = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent';
    this.initialized = false;
  }

  // Initialize the API with the key from .env
  async initialize() {
    try {
      // Try to load from .env file
      const env = await loadEnv();
      
      // Check if we got an API key from the .env file
      if (env['gemini-apikey']) {
        this.apiKey = env['gemini-apikey'];
        this.initialized = true;
        console.log('Gemini API initialized successfully from .env file');
        return true;
      }
      
      // If we couldn't get a key from .env, use the hardcoded fallback
      // In a production environment, you should handle this more securely
      console.warn('Could not load API key from .env file, using fallback method');
      this.apiKey = ''; // Fallback to the key in the .env file
      
      if (this.apiKey) {
        this.initialized = true;
        console.log('Gemini API initialized successfully with fallback key');
        return true;
      } else {
        console.error('No API key available. Gemini API will not function.');
        return false;
      }
    } catch (error) {
      console.error('Failed to initialize Gemini API:', error);
      // Try fallback method as a last resort
      this.apiKey = '';
      if (this.apiKey) {
        this.initialized = true;
        console.log('Gemini API initialized with emergency fallback key after error');
        return true;
      }
      return false;
    }
  }

  // Create a prompt for the Gemini API
  createFeedbackPrompt(formattedData) {
    if (!formattedData) {
      return "Please provide exercise feedback based on available data.";
    }

    // Include more exercise-specific context
    let exerciseContext = "";
    switch(formattedData.exerciseName) {
      case "Dumbbell Bicep Curls":
        exerciseContext = "Bicep curls should have minimal shoulder movement, elbows fixed at sides, wrists straight, and full range of motion from extension to contraction.";
        break;
      case "Dumbbell Shoulder Press":
        exerciseContext = "Shoulder presses should maintain neutral spine, symmetrical arm movement, and avoid excessive arching of lower back.";
        break;
      case "Dumbbell Lateral Raises":
        exerciseContext = "Lateral raises should have slight elbow bend, controlled movement, and hands should not rise above shoulder level.";
        break;
      default:
        exerciseContext = "Proper form includes controlled movements, appropriate range of motion, and stable core.";
    }

    const prompt = `
You are an expert fitness coach analyzing exercise data. I need detailed, structured feedback for a user performing ${formattedData.exerciseName}.

EXERCISE CONTEXT:
${exerciseContext}

USER'S EXERCISE DATA:
- Exercise: ${formattedData.exerciseName}
- Current rep count: ${formattedData.repCount}
- Target muscles: ${formattedData.targetMuscles.join(', ')}
- Form quality assessment: ${formattedData.formQuality === "good" ? "Good" : "Needs improvement"}
${formattedData.formIssues && formattedData.formIssues.length > 0 ? `- Form issues detected: ${formattedData.formIssues.join(', ')}` : '- No specific form issues detected'}
${formattedData.jointAngles ? `
KEY JOINT ANGLES:
${Object.entries(formattedData.jointAngles).map(([joint, angle]) => `- ${joint}: ${Math.round(angle)}°`).join('\n')}` : ''}

INSTRUCTIONS:
Provide a structured response with exactly these sections, clearly labeled:

FORM_ASSESSMENT:
Write 2-3 sentences analyzing what the user is doing well and what needs improvement in their form. Be specific about body positioning.

IMPROVEMENT_TIP:
Provide ONE specific, actionable tip that would most improve their form based on the data. Make it clear and immediately applicable.

PROGRESS_FEEDBACK:
Give encouraging feedback about their progress (they've completed ${formattedData.repCount}/${formattedData.repCount >= 12 ? 'their goal of 12' : 'working toward 12'} reps). Mention something positive.

BREATHING_REMINDER:
Provide a brief, exercise-specific reminder about proper breathing technique for this specific exercise.

Each section should be 1-3 sentences, clear, actionable, and motivational. Use simple language. Total response should be under 150 words.
`;

    return prompt;
  }

  // Format the Gemini API response into structured feedback sections
  formatFeedbackResponse(responseText) {
    try {
      // Define the sections we expect
      const sectionKeys = ['FORM_ASSESSMENT', 'IMPROVEMENT_TIP', 'PROGRESS_FEEDBACK', 'BREATHING_REMINDER'];
      const sections = {};
      
      // Default values in case parsing fails
      sectionKeys.forEach(key => {
        sections[key] = "No feedback available for this section.";
      });
      
      // Extract each section from the response
      let currentSection = null;
      let currentContent = [];
      
      // Split by lines and process
      const lines = responseText.split('\n');
      
      for (const line of lines) {
        // Check if this line is a section header
        const sectionMatch = line.match(/^([A-Z_]+):$/);
        
        if (sectionMatch && sectionKeys.includes(sectionMatch[1])) {
          // If we were already collecting content for a section, save it
          if (currentSection) {
            sections[currentSection] = currentContent.join(' ').trim();
            currentContent = [];
          }
          
          // Start a new section
          currentSection = sectionMatch[1];
        } 
        // If we're in a section and this line has content, add it
        else if (currentSection && line.trim()) {
          currentContent.push(line.trim());
        }
      }
      
      // Save the last section if there is one
      if (currentSection && currentContent.length > 0) {
        sections[currentSection] = currentContent.join(' ').trim();
      }
      
      // If we didn't extract any sections properly, try a simpler approach
      const hasContent = Object.values(sections).some(content => 
        content !== "No feedback available for this section.");
        
      if (!hasContent) {
        // Fall back to a simpler division
        const paragraphs = responseText.split('\n\n').filter(p => p.trim());
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
        FORM_ASSESSMENT: "Your form looks generally good. Focus on maintaining proper posture.",
        IMPROVEMENT_TIP: "Keep your movements controlled and deliberate throughout the exercise.",
        PROGRESS_FEEDBACK: "You're making good progress. Keep up the great work!",
        BREATHING_REMINDER: "Remember to breathe - exhale during exertion and inhale during the relaxation phase."
      };
    }
  }

  // Generate exercise feedback based on performance data
  async generateExerciseFeedback(exerciseData) {
    if (!this.initialized) {
      await this.initialize();
      if (!this.initialized) {
        return {
          success: false,
          feedback: "Unable to generate AI feedback. API not initialized.",
          sections: null
        };
      }
    }

    try {
      // Format the exercise data for the prompt
      const formattedData = this.formatExerciseData(exerciseData);
      
      // Create prompt for the Gemini API
      const prompt = this.createFeedbackPrompt(formattedData);
      
      console.log("Sending request to Gemini API:", this.apiEndpoint);
      
      // Make the API request with updated format
      const response = await fetch(`${this.apiEndpoint}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          // Updated request format
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.15,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Gemini API error:', errorData);
        return {
          success: false,
          feedback: "Error generating feedback. Please try again later.",
          sections: null
        };
      }

      const data = await response.json();
      console.log("Gemini API response:", data);
      
      // Extract and format the response
      let feedbackText;
      try {
        // Try to extract from the response format
        feedbackText = data.candidates[0].content.parts[0].text;
      } catch (e) {
        console.warn("Error extracting feedback text from response:", e);
        feedbackText = "Based on your form, focus on maintaining good posture. Keep your movements controlled and remember to breathe properly - exhale during exertion and inhale during the relaxation phase. You're making good progress!";
      }
      
      // Format the response into sections
      const feedbackSections = this.formatFeedbackResponse(feedbackText);
      
      return {
        success: true,
        feedback: feedbackText,
        sections: feedbackSections
      };
    } catch (error) {
      console.error('Error generating exercise feedback:', error);
      return {
        success: false,
        feedback: "Error generating feedback. Please check your internet connection.",
        sections: null
      };
    }
  }

  // Format exercise data for the prompt
  formatExerciseData(exerciseData) {
    if (!exerciseData || exerciseData.length === 0) {
      return null;
    }

    // Get the most recent metrics
    const mostRecent = exerciseData[exerciseData.length - 1];
    
    // Calculate average metrics across all data points
    const averages = this.calculateAverages(exerciseData);
    
    return {
      exerciseName: mostRecent.exerciseName,
      repCount: mostRecent.repCount,
      targetMuscles: mostRecent.targetMuscles,
      formQuality: mostRecent.formQuality,
      formIssues: mostRecent.formIssues || [],
      jointAngles: mostRecent.jointAngles,
      averages: averages,
      totalDataPoints: exerciseData.length
    };
  }

  // Calculate average metrics across all data points
  calculateAverages(exerciseData) {
    if (!exerciseData || exerciseData.length === 0) return {};
    
    // Initialize counters
    const totals = {};
    const counts = {};
    
    // Sum up all numeric values
    exerciseData.forEach(data => {
      Object.entries(data).forEach(([key, value]) => {
        // Skip non-numeric values and certain fields
        if (
          typeof value === 'number' && 
          !['id', 'timestamp', 'repCount'].includes(key)
        ) {
          totals[key] = (totals[key] || 0) + value;
          counts[key] = (counts[key] || 0) + 1;
        }
        
        // Handle nested objects like jointAngles
        if (key === 'jointAngles' && typeof value === 'object') {
          if (!totals.jointAngles) totals.jointAngles = {};
          if (!counts.jointAngles) counts.jointAngles = {};
          
          Object.entries(value).forEach(([angleKey, angleValue]) => {
            if (typeof angleValue === 'number') {
              totals.jointAngles[angleKey] = (totals.jointAngles[angleKey] || 0) + angleValue;
              counts.jointAngles[angleKey] = (counts.jointAngles[angleKey] || 0) + 1;
            }
          });
        }
      });
    });
    
    // Calculate averages
    const averages = {};
    Object.entries(totals).forEach(([key, total]) => {
      if (key === 'jointAngles') {
        averages.jointAngles = {};
        Object.entries(totals.jointAngles).forEach(([angleKey, angleTotal]) => {
          averages.jointAngles[angleKey] = angleTotal / counts.jointAngles[angleKey];
        });
      } else {
        averages[key] = total / counts[key];
      }
    });
    
    return averages;
  }
}

// Export the GeminiAPI class
export const geminiAPI = new GeminiAPI(); 
