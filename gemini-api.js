// Import the environment loader
import { loadEnv } from './env-loader.js';

// Class to handle Gemini API integration
class GeminiAPI {
  constructor() {
    this.apiKey = null;
    this.apiEndpoint = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent';
    this.initialized = false;
    this.apiKeyModalId = 'gemini-api-key-modal';
  }

  // Initialize the API with the key from server, .env, or prompt user for input
  async initialize() {
    try {
      // First try to get the API key from the server
      try {
        const response = await fetch('/api/config');
        if (response.ok) {
          const config = await response.json();
          if (config.hasApiKey && config.apiKey) {
            this.apiKey = config.apiKey;
            this.initialized = true;
            console.log('Gemini API initialized successfully from server config');
            return true;
          }
        }
      } catch (serverError) {
        console.warn('Failed to get API key from server:', serverError);
        // Continue to other methods if server fails
      }

      // Next check if we already have a key in localStorage
      const savedKey = localStorage.getItem('gemini-apikey');
      if (savedKey) {
        this.apiKey = savedKey;
        this.initialized = true;
        console.log('Gemini API initialized successfully from localStorage');
        return true;
      }
      
      // Try to load from .env file
      const env = await loadEnv();
      
      // Check if we got an API key from the .env file
      if (env['gemini-apikey']) {
        this.apiKey = env['gemini-apikey'];
        this.initialized = true;
        console.log('Gemini API initialized successfully from .env file');
        return true;
      }
      
      // If we couldn't get a key from server, localStorage, or .env, prompt the user
      console.warn('No API key found from server, localStorage, or .env file, prompting user for input');
      
      // Create and show the API key input modal
      return await this.promptForApiKey();
    } catch (error) {
      console.error('Failed to initialize Gemini API:', error);
      return await this.promptForApiKey();
    }
  }
  
  // Prompt the user for an API key via a modal dialog
  async promptForApiKey() {
    return new Promise((resolve) => {
      // Check if modal already exists
      let modal = document.getElementById(this.apiKeyModalId);
      
      // If modal doesn't exist, create it
      if (!modal) {
        modal = document.createElement('div');
        modal.id = this.apiKeyModalId;
        modal.className = 'api-key-modal';
        
        const modalContent = `
          <div class="api-key-modal-content">
            <h2><i class="fas fa-key"></i> Gemini API Key Required</h2>
            <p>To use AI-powered exercise feedback, please enter your Gemini API key.</p>
            <p class="api-key-instructions">
              You can get a Gemini API key from 
              <a href="https://aistudio.google.com/app/apikey" target="_blank">Google AI Studio</a>.
            </p>
            <form id="api-key-form">
              <div class="form-group">
                <label for="api-key-input">API Key:</label>
                <input type="text" id="api-key-input" placeholder="Enter your Gemini API key" required>
              </div>
              <div class="form-actions">
                <button type="submit" class="btn btn-primary">Save API Key</button>
              </div>
            </form>
          </div>
        `;
        
        modal.innerHTML = modalContent;
        document.body.appendChild(modal);
        
        // Add event listener to the form
        const form = document.getElementById('api-key-form');
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const apiKeyInput = document.getElementById('api-key-input');
          const apiKey = apiKeyInput.value.trim();
          
          if (apiKey) {
            // Save the API key
            this.saveApiKey(apiKey);
            
            // Close the modal
            modal.style.display = 'none';
            
            // Resolve the promise
            resolve(true);
          }
        });
      } else {
        // If modal exists, just show it
        modal.style.display = 'flex';
      }
    });
  }
  
  // Save the API key to localStorage
  saveApiKey(apiKey) {
    this.apiKey = apiKey;
    this.initialized = true;
    
    // Save to localStorage for persistence
    try {
      localStorage.setItem('gemini-apikey', apiKey);
      console.log('API key saved to localStorage');
    } catch (error) {
      console.warn('Failed to save API key to localStorage:', error);
    }
  }

  // Create a prompt for the Gemini API
  createFeedbackPrompt(formattedData) {
    if (!formattedData) {
      return "Please provide exercise feedback based on available data.";
    }

    // Create detailed exercise-specific context and coaching cues
    let exerciseContext = "";
    let formCriteria = "";
    let commonErrors = "";
    let breathingTechnique = "";
    
    // Exercise-specific coaching information
    switch(formattedData.exerciseName) {
      case "Dumbbell Bicep Curls":
        exerciseContext = "Bicep curls target the biceps brachii with secondary activation of the forearms. This isolation exercise is fundamental for arm strength and definition.";
        
        formCriteria = "- Elbows should remain fixed at sides throughout the movement (minimal forward/backward movement)\n- Wrists should remain straight, not flexed or extended\n- Full range of motion from full extension to full contraction\n- Controlled tempo on both concentric and eccentric phases\n- Shoulders should remain level and stable";
        
        commonErrors = "- Using momentum/swinging the weights\n- Moving elbows forward during lifting phase\n- Incomplete range of motion\n- Excessive shoulder involvement\n- Uneven lifting (one arm working harder)";
        
        breathingTechnique = "Exhale during the concentric phase (lifting the weight), inhale during the eccentric phase (lowering the weight). Focus on maintaining core engagement throughout.";
        break;
        
      case "Dumbbell Shoulder Press":
        exerciseContext = "Shoulder press primarily targets the deltoids with secondary activation of the triceps and upper chest. This compound movement is essential for shoulder strength and stability.";
        
        formCriteria = "- Maintain neutral spine alignment throughout the movement\n- Symmetrical arm movement on both sides\n- Elbows should be at approximately 90° in the starting position\n- Wrists should be stacked over elbows\n- Full extension at the top without locking elbows";
        
        commonErrors = "- Excessive arching of lower back\n- Uneven pressing (one arm higher than the other)\n- Flaring elbows too far forward\n- Incomplete range of motion\n- Shrugging shoulders during the press";
        
        breathingTechnique = "Exhale during the pressing phase (pushing weights up), inhale during the lowering phase. Maintain core bracing to protect the lower back.";
        break;
        
      case "Dumbbell Lateral Raises":
        exerciseContext = "Lateral raises isolate the lateral deltoids, crucial for shoulder width and definition. This exercise requires strict form to be effective and safe.";
        
        formCriteria = "- Slight bend in the elbows maintained throughout\n- Controlled movement without momentum\n- Hands should rise to shoulder level, not above\n- Thumbs should be slightly higher than pinkies (slight external rotation)\n- Shoulders should remain depressed (away from ears)";
        
        commonErrors = "- Using too much weight and compromising form\n- Swinging/using momentum\n- Shrugging shoulders during the lift\n- Raising arms too high (above shoulder level)\n- Internal rotation of shoulders";
        
        breathingTechnique = "Exhale as you raise the weights, inhale as you lower them. Focus on controlled breathing to maintain stability.";
        break;
        
      case "Dumbbell Bent-Over Rows":
        exerciseContext = "Bent-over rows target the latissimus dorsi, rhomboids, and rear deltoids. This compound pull exercise is essential for back strength and posture.";
        
        formCriteria = "- Maintain flat back position throughout (neutral spine)\n- Hinge at hips with slight knee bend\n- Pull elbows close to body, not flared out\n- Squeeze shoulder blades together at top of movement\n- Controlled lowering phase";
        
        commonErrors = "- Rounding the back during the exercise\n- Using momentum/jerking the weights\n- Insufficient range of motion\n- Lifting torso during the pull\n- Flaring elbows too wide";
        
        breathingTechnique = "Exhale during the pulling phase, inhale during the lowering phase. Maintain braced core to protect the lower back.";
        break;
        
      default:
        exerciseContext = "This resistance exercise requires proper form for effectiveness and safety. Focus on controlled movements and proper alignment.";
        
        formCriteria = "- Maintain proper joint alignment\n- Use controlled movements (avoid momentum)\n- Complete full range of motion\n- Keep core engaged for stability\n- Maintain symmetry between left and right sides";
        
        commonErrors = "- Using momentum instead of muscle control\n- Incomplete range of motion\n- Poor posture/alignment\n- Uneven effort between sides\n- Holding breath during exertion";
        
        breathingTechnique = "Generally, exhale during the exertion phase (against resistance) and inhale during the return phase. Never hold your breath during resistance training.";
    }

    // Extract relevant metrics for analysis
    const jointAnglesText = formattedData.jointAngles ? 
      Object.entries(formattedData.jointAngles)
        .map(([joint, angle]) => `- ${joint}: ${Math.round(angle)}°`)
        .join('\n') : '';
    
    const postureText = formattedData.posture ? 
      `- Spine alignment: ${formattedData.posture.spineAlignment}\n- Shoulder alignment: ${formattedData.posture.shoulderAlignment}` : '';
    
    const symmetryText = formattedData.symmetry ? 
      `- Left/right balance: ${formattedData.symmetry.leftRightBalance}` : '';
    
    const movementText = formattedData.movement && formattedData.movement.smoothness ? 
      `- Movement quality: ${formattedData.movement.smoothness}` : '';

    // Create comprehensive prompt
    const prompt = `
You are an expert fitness coach analyzing exercise data from a real-time workout. I need detailed, personalized feedback for a user performing ${formattedData.exerciseName}.

EXERCISE CONTEXT:
${exerciseContext}

PROPER FORM CRITERIA:
${formCriteria}

COMMON ERRORS:
${commonErrors}

USER'S CURRENT METRICS:
- Exercise: ${formattedData.exerciseName}
- Current rep count: ${formattedData.repCount}${formattedData.repGoal ? ` of ${formattedData.repGoal} target` : ''}
- Target muscles: ${formattedData.targetMuscles.join(', ')}
- Form quality assessment: ${formattedData.formQuality === "good" ? "Good" : "Needs improvement"}
${formattedData.formIssues && formattedData.formIssues.length > 0 ? `- Form issues detected: ${formattedData.formIssues.join(', ')}` : '- No specific form issues detected'}

DETAILED MEASUREMENTS:
${jointAnglesText ? `JOINT ANGLES:\n${jointAnglesText}\n` : ''}
${postureText ? `POSTURE:\n${postureText}\n` : ''}
${symmetryText ? `SYMMETRY:\n${symmetryText}\n` : ''}
${movementText ? `MOVEMENT:\n${movementText}\n` : ''}

PROPER BREATHING TECHNIQUE:
${breathingTechnique}

INSTRUCTIONS:
Provide a structured response with exactly these sections, clearly labeled:

FORM_ASSESSMENT:
Write 2-3 sentences analyzing what the user is doing well and what needs improvement in their form. Be specific about body positioning and reference the actual joint angles and measurements from their data.

IMPROVEMENT_TIP:
Provide ONE specific, actionable tip that would most improve their form based on the data. Make it clear, immediately applicable, and exercise-specific. Reference the proper form criteria.

PROGRESS_FEEDBACK:
Give encouraging feedback about their progress (they've completed ${formattedData.repCount}${formattedData.repGoal ? ` of ${formattedData.repGoal}` : ''} reps). Be motivational but honest about their performance.

BREATHING_REMINDER:
Provide a brief, exercise-specific reminder about proper breathing technique that relates to this specific exercise and the user's current form.

Each section should be 1-3 sentences, clear, actionable, and motivational. Use simple language. Total response should be under 150 words. Focus on being a supportive coach who provides precise, personalized guidance.
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
      
      // Start background processing of historical data
      this.processHistoricalDataInBackground(exerciseData);
      
      // Create prompt for the Gemini API
      const prompt = this.createFeedbackPrompt(formattedData);
      
      console.log("Sending request to Gemini API for real-time feedback");
      
      // Make the API request with updated format
      const response = await this.makeGeminiAPIRequest(prompt);
      
      if (!response.success) {
        return response; // Return error response
      }
      
      // Extract and format the response
      const feedbackText = response.text || "Based on your form, focus on maintaining good posture. Keep your movements controlled and remember to breathe properly.";
      
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
  
  // Make a request to the Gemini API
  async makeGeminiAPIRequest(prompt, temperature = 0.15) {
    try {
      const response = await fetch(`${this.apiEndpoint}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: temperature,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Gemini API error:', errorData);
        
        // Check if the error is related to the API key
        const errorMessage = errorData.error?.message || '';
        if (errorMessage.includes('API key') || errorMessage.includes('apiKey') || 
            errorMessage.includes('authentication') || errorMessage.includes('auth') ||
            errorMessage.includes('invalid key') || errorMessage.includes('key not valid')) {
          
          console.warn('API key error detected, prompting for a new key');
          
          // Clear the current API key
          this.apiKey = null;
          this.initialized = false;
          
          // Remove from localStorage
          try {
            localStorage.removeItem('gemini-apikey');
          } catch (e) {
            console.warn('Failed to remove API key from localStorage:', e);
          }
          
          // Prompt for a new API key
          const reinitialized = await this.promptForApiKey();
          
          if (reinitialized) {
            // Try again with the new key (recursive call)
            return this.makeGeminiAPIRequest(prompt, temperature);
          }
        }
        
        return {
          success: false,
          error: "Error generating content. Please check your API key or try again later."
        };
      }

      const data = await response.json();
      
      // Extract text from response
      let text;
      try {
        text = data.candidates[0].content.parts[0].text;
      } catch (e) {
        console.warn("Error extracting text from response:", e);
        return {
          success: false,
          error: "Error parsing API response."
        };
      }
      
      return {
        success: true,
        text: text,
        rawResponse: data
      };
    } catch (error) {
      console.error('Error making Gemini API request:', error);
      return {
        success: false,
        error: "Network error when contacting Gemini API."
      };
    }
  }
  
  // Process historical exercise data in the background
  async processHistoricalDataInBackground(exerciseData) {
    if (!exerciseData || exerciseData.length < 5) {
      console.log("Not enough historical data for background processing");
      return;
    }
    
    try {
      // Store exercise data in localStorage for trend analysis
      this.storeExerciseData(exerciseData);
      
      // Generate progress insights in the background
      this.generateProgressInsights(exerciseData)
        .then(insights => {
          if (insights.success) {
            console.log("Generated exercise progress insights:", insights);
            localStorage.setItem('exercise-insights', JSON.stringify({
              timestamp: Date.now(),
              exerciseName: exerciseData[0].exerciseName,
              insights: insights.text
            }));
          }
        })
        .catch(error => {
          console.error("Error generating progress insights:", error);
        });
      
      // Generate personalized recommendations in the background
      this.generateWorkoutRecommendations(exerciseData)
        .then(recommendations => {
          if (recommendations.success) {
            console.log("Generated workout recommendations:", recommendations);
            localStorage.setItem('workout-recommendations', JSON.stringify({
              timestamp: Date.now(),
              exerciseName: exerciseData[0].exerciseName,
              recommendations: recommendations.text
            }));
          }
        })
        .catch(error => {
          console.error("Error generating workout recommendations:", error);
        });
    } catch (error) {
      console.error("Error in background processing:", error);
    }
  }
  
  // Store exercise data for trend analysis
  storeExerciseData(exerciseData) {
    if (!exerciseData || exerciseData.length === 0) return;
    
    try {
      const exerciseName = exerciseData[0].exerciseName;
      
      // Get existing data from localStorage
      let storedData = {};
      try {
        const existingData = localStorage.getItem('exercise-history');
        if (existingData) {
          storedData = JSON.parse(existingData);
        }
      } catch (e) {
        console.warn("Error parsing stored exercise data:", e);
      }
      
      // Create entry for this exercise if it doesn't exist
      if (!storedData[exerciseName]) {
        storedData[exerciseName] = [];
      }
      
      // Add new session data
      const sessionSummary = {
        timestamp: Date.now(),
        repCount: exerciseData[exerciseData.length - 1].repCount,
        formQuality: this.calculateAverageFormQuality(exerciseData),
        duration: exerciseData[exerciseData.length - 1].timestamp - exerciseData[0].timestamp,
        rangeOfMotion: this.calculateAverageRangeOfMotion(exerciseData)
      };
      
      // Add to stored data (limit to last 10 sessions)
      storedData[exerciseName].push(sessionSummary);
      if (storedData[exerciseName].length > 10) {
        storedData[exerciseName] = storedData[exerciseName].slice(-10);
      }
      
      // Save back to localStorage
      localStorage.setItem('exercise-history', JSON.stringify(storedData));
      console.log(`Stored session data for ${exerciseName}`);
    } catch (error) {
      console.error("Error storing exercise data:", error);
    }
  }
  
  // Calculate average form quality from exercise data
  calculateAverageFormQuality(exerciseData) {
    if (!exerciseData || exerciseData.length === 0) return "unknown";
    
    const goodCount = exerciseData.filter(data => data.formQuality === "good").length;
    const percentage = (goodCount / exerciseData.length) * 100;
    
    if (percentage >= 80) return "excellent";
    if (percentage >= 60) return "good";
    if (percentage >= 40) return "fair";
    return "needs_improvement";
  }
  
  // Calculate average range of motion from exercise data
  calculateAverageRangeOfMotion(exerciseData) {
    if (!exerciseData || exerciseData.length === 0) return {};
    
    // Find data points with range of motion information
    const dataWithROM = exerciseData.filter(data => 
      data.rangeOfMotion && 
      data.rangeOfMotion.maxAngles && 
      data.rangeOfMotion.minAngles
    );
    
    if (dataWithROM.length === 0) return {};
    
    // Calculate average ROM for each joint
    const joints = new Set();
    dataWithROM.forEach(data => {
      Object.keys(data.rangeOfMotion.maxAngles).forEach(joint => joints.add(joint));
    });
    
    const result = {};
    joints.forEach(joint => {
      let totalRange = 0;
      let count = 0;
      
      dataWithROM.forEach(data => {
        if (data.rangeOfMotion.maxAngles[joint] !== undefined && 
            data.rangeOfMotion.minAngles[joint] !== undefined) {
          const range = data.rangeOfMotion.maxAngles[joint] - data.rangeOfMotion.minAngles[joint];
          totalRange += range;
          count++;
        }
      });
      
      if (count > 0) {
        result[joint] = totalRange / count;
      }
    });
    
    return result;
  }
  
  // Generate insights about exercise progress over time
  async generateProgressInsights(exerciseData) {
    if (!this.initialized || !exerciseData || exerciseData.length === 0) {
      return { success: false, error: "Not initialized or no data available" };
    }
    
    try {
      const exerciseName = exerciseData[0].exerciseName;
      
      // Get historical data
      let historicalData = [];
      try {
        const storedData = localStorage.getItem('exercise-history');
        if (storedData) {
          const parsedData = JSON.parse(storedData);
          historicalData = parsedData[exerciseName] || [];
        }
      } catch (e) {
        console.warn("Error parsing historical exercise data:", e);
      }
      
      if (historicalData.length < 2) {
        return { success: false, error: "Not enough historical data for insights" };
      }
      
      // Create prompt for progress insights
      const prompt = `
You are an expert fitness coach analyzing a user's exercise progress over time. Generate insights about their progress with ${exerciseName}.

HISTORICAL DATA (from oldest to newest):
${historicalData.map((session, index) => `
Session ${index + 1}:
- Date: ${new Date(session.timestamp).toLocaleDateString()}
- Reps completed: ${session.repCount}
- Form quality: ${session.formQuality}
- Session duration: ${Math.round(session.duration / 1000)} seconds
${Object.keys(session.rangeOfMotion).length > 0 ? 
  `- Range of motion: ${Object.entries(session.rangeOfMotion)
    .map(([joint, range]) => `${joint}: ${Math.round(range)}°`)
    .join(', ')}` : 
  '- Range of motion: Not available'
}
`).join('\n')}

CURRENT SESSION:
- Date: ${new Date().toLocaleDateString()}
- Reps completed: ${exerciseData[exerciseData.length - 1].repCount}
- Form quality: ${this.calculateAverageFormQuality(exerciseData)}
- Session duration: ${Math.round((exerciseData[exerciseData.length - 1].timestamp - exerciseData[0].timestamp) / 1000)} seconds

INSTRUCTIONS:
Analyze the user's progress over time and provide insights in these specific areas:

1. STRENGTH_PROGRESS: How has the user's strength progressed based on rep counts and consistency?

2. FORM_IMPROVEMENT: How has the user's form quality changed over sessions?

3. RANGE_OF_MOTION: Any changes in the user's range of motion over time?

4. EFFICIENCY: Is the user becoming more efficient (completing more reps in less time)?

5. NEXT_MILESTONE: What should be the user's next milestone or goal based on their progress?

Keep each section to 1-2 sentences. Be specific, data-driven, and encouraging. Total response should be under 200 words.
`;
      
      // Make API request in the background
      return await this.makeGeminiAPIRequest(prompt, 0.2);
    } catch (error) {
      console.error("Error generating progress insights:", error);
      return { success: false, error: "Error generating progress insights" };
    }
  }
  
  // Generate personalized workout recommendations
  async generateWorkoutRecommendations(exerciseData) {
    if (!this.initialized || !exerciseData || exerciseData.length === 0) {
      return { success: false, error: "Not initialized or no data available" };
    }
    
    try {
      const exerciseName = exerciseData[0].exerciseName;
      const targetMuscles = exerciseData[0].targetMuscles || [];
      const formQuality = this.calculateAverageFormQuality(exerciseData);
      
      // Create prompt for workout recommendations
      const prompt = `
You are an expert fitness coach creating personalized workout recommendations. The user has been performing ${exerciseName}, which targets ${targetMuscles.join(', ')}.

USER'S CURRENT STATUS:
- Exercise: ${exerciseName}
- Target muscles: ${targetMuscles.join(', ')}
- Form quality: ${formQuality}
- Reps completed in last session: ${exerciseData[exerciseData.length - 1].repCount}

INSTRUCTIONS:
Based on the user's current exercise and performance, provide personalized workout recommendations in these specific areas:

1. COMPLEMENTARY_EXERCISES: Suggest 2-3 complementary exercises that would pair well with ${exerciseName} to create a balanced workout for the same muscle groups.

2. PROGRESSION_PLAN: Recommend how the user should progress with ${exerciseName} over the next 2 weeks (e.g., increase reps, sets, or weight).

3. FORM_FOCUS: Based on their form quality (${formQuality}), suggest a specific form-focused drill or technique to improve their ${exerciseName} performance.

4. RECOVERY_TIPS: Provide 1-2 recovery tips specific to the muscle groups worked by ${exerciseName}.

5. VARIATION_SUGGESTION: Suggest one variation of ${exerciseName} they could try for muscle confusion or to target slightly different aspects of the same muscle groups.

Keep each section to 1-2 sentences. Be specific, actionable, and personalized. Total response should be under 200 words.
`;
      
      // Make API request in the background
      return await this.makeGeminiAPIRequest(prompt, 0.3);
    } catch (error) {
      console.error("Error generating workout recommendations:", error);
      return { success: false, error: "Error generating workout recommendations" };
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
