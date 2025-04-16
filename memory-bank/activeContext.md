# Active Context: Fitness Tracker with MediaPipe

## Current Focus

The project is currently in the **initial development phase**. The core functionality has been implemented, including:

1. Real-time pose detection using MediaPipe Holistic
2. Exercise library with 8 dumbbell exercises
3. Form analysis and rep counting
4. Visual feedback on exercise form
5. Audio coaching with speech synthesis
6. AI-powered feedback via Gemini API
7. Basic analytics and progress tracking

The current focus is on:

- **Enhancing form analysis and feedback**: Improving angle calculation accuracy and providing immediate visual feedback on form issues
- **Stabilizing core functionality**: Ensuring reliable pose detection and exercise tracking
- **Improving user experience**: Making the interface more intuitive and responsive
- **Expanding AI feedback capabilities**: Improving the quality and relevance of Gemini API prompts

## Recent Changes

- Enhanced Dumbbell Bicep Curls exercise with improved metrics:
  - Added bilateral symmetry detection to compare left and right arms
  - Implemented shoulder stability monitoring to detect shoulder elevation
  - Enhanced rep counting with partial rep detection (0.5 reps)
  - Added side-specific feedback for more targeted form corrections
- Fixed speech synthesis errors in audio-coach.js with improved error handling
- Fixed reference error for determineFeedbackSeverity function
- Improved error handling in MediaPipe processing to prevent camera crashes
- Updated documentation with enhanced feedback system information
- Implemented advanced analytics module for tracking exercise progress over time
- Added audio coaching with configurable voice settings
- Integrated Gemini API for AI-powered exercise feedback
- Enhanced visualization with form correction overlays
- Implemented local storage for exercise history and user preferences
- Added responsive design for different screen sizes
- Improved error handling for camera access and API calls

## Active Decisions

### Form Analysis Approach

We're currently using a joint angle-based approach for form analysis, where specific angles between key body points are measured and compared to ideal ranges. This works well for exercises with clear angular movements (like bicep curls), but needs enhancement to provide more immediate and actionable feedback.

**Decision**: Enhance the angle-based approach with:
1. Improved angle calculation algorithms with better smoothing and normalization
2. Real-time visual indicators showing current angles vs. ideal angles
3. Color-coded feedback to quickly identify form issues (green for good, yellow for warning, red for correction needed)
4. Immediate on-screen text feedback for specific angle issues
5. Bilateral symmetry detection to compare left and right sides
6. Partial rep detection and counting for more accurate workout tracking
7. Side-specific feedback for more targeted form corrections

### Feedback Frequency

Finding the right balance for feedback frequency is crucial - too much feedback can be overwhelming, while too little might not be helpful.

**Current approach**:
- Visual feedback: Continuous
- Audio feedback: Throttled with cooldown periods
- AI feedback: Every 30 seconds during exercise

**Decision**: Maintain current approach but add user controls to adjust feedback frequency.

### Data Privacy

All processing happens client-side, with no user data sent to servers except for anonymized exercise snippets to the Gemini API.

**Decision**: Maintain the privacy-focused approach and add clear user notifications about data usage.

## Key Insights

1. **Joint Angle Calculation**: The accuracy of joint angle calculation is highly dependent on the quality of pose detection. Adding smoothing and filtering has significantly improved stability.

2. **Exercise State Machines**: Different exercises require different state machine logic for accurate rep counting. The current approach of exercise-specific analysis functions works well but could benefit from a more formalized framework.

3. **User Feedback**: Initial testing shows that users prefer immediate visual feedback combined with occasional audio cues, rather than constant audio feedback.

4. **Performance Optimization**: The MediaPipe Holistic model is computationally intensive. Setting `modelComplexity: 1` (medium) provides a good balance between accuracy and performance.

5. **AI Prompt Engineering**: The quality of Gemini API feedback is highly dependent on prompt structure. Structured prompts with clear sections yield more consistent and useful feedback.

## Next Steps

### Short-term (Next 2 Weeks)

1. Enhance remaining exercises with the same improvements applied to Bicep Curls:
   - Add bilateral symmetry detection
   - Implement shoulder stability monitoring
   - Add partial rep detection
   - Provide side-specific feedback
2. Implement enhanced angle calculation with improved accuracy and stability
3. Add real-time angle visualization with ideal range indicators
4. Develop immediate visual feedback system for form corrections
5. Refine form analysis for shoulder press and lateral raises
6. Improve visualization of movement guides
7. Add user settings for feedback preferences

### Medium-term (Next 1-2 Months)

1. Add support for workout routines (sequences of exercises)
2. Implement more detailed progress visualization
3. Add export/import functionality for workout data
4. Improve mobile device support
5. Add offline mode with cached models

### Long-term (3+ Months)

1. Expand exercise library to include bodyweight exercises
2. Implement custom exercise creation
3. Add social sharing features
4. Develop guided workout programs
5. Explore integration with fitness wearables

## Current Challenges

1. **Pose Detection Limitations**: MediaPipe sometimes loses tracking during rapid movements or unusual angles.

2. **Form Analysis Complexity**: Different body types and exercise variations make universal form rules challenging.

3. **Performance on Mobile**: The application is resource-intensive, which can affect performance on mobile devices.

4. **API Key Management**: Managing Gemini API keys securely while maintaining ease of use.

5. **Cross-browser Compatibility**: Ensuring consistent behavior across different browsers and devices.

## Development Patterns and Preferences

1. **Code Organization**: Maintain modular structure with clear separation of concerns.

2. **Documentation**: Document complex algorithms and key decisions inline.

3. **Error Handling**: Graceful degradation when features are unavailable.

4. **User Experience**: Prioritize clarity and simplicity over feature richness.

5. **Testing**: Manual testing of exercise tracking with different body types and environments.
