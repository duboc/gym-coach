# System Patterns: Fitness Tracker with MediaPipe

## Architecture Overview

The Fitness Tracker application follows a modular, component-based architecture that separates concerns and promotes maintainability. The system is built entirely as a client-side web application with no backend dependencies except for API calls to external services.

```
┌─────────────────────────────────────────────────────────────┐
│                      Main Application                        │
│                                                             │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐   │
│  │ Exercise    │   │ MediaPipe   │   │ User Interface  │   │
│  │ Management  │   │ Integration │   │ Components      │   │
│  └─────────────┘   └─────────────┘   └─────────────────┘   │
│                                                             │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐   │
│  │ Form        │   │ Analytics   │   │ Gemini API      │   │
│  │ Visualization│   │ Engine     │   │ Integration     │   │
│  └─────────────┘   └─────────────┘   └─────────────────┘   │
│                                                             │
│  ┌─────────────┐   ┌─────────────┐                         │
│  │ Audio       │   │ Environment │                         │
│  │ Feedback    │   │ Management  │                         │
│  └─────────────┘   └─────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

## Core Design Patterns

### 1. Module Pattern

The application is organized into distinct JavaScript modules, each with a specific responsibility:

- **script.js**: Main application logic and initialization
- **exercises.js**: Exercise definitions and metadata
- **visualization.js**: Form visualization and feedback rendering
- **audio-coach.js**: Audio feedback and voice coaching
- **gemini-api.js**: Integration with Google's Gemini API
- **advanced-analytics.js**: Exercise data analysis and insights
- **env-loader.js**: Environment configuration management

Each module exports a clean interface for other modules to consume, hiding implementation details.

### 2. Observer Pattern

The application uses an event-driven approach for handling pose detection and updates:

- MediaPipe's Holistic model emits results that the application observes
- The main application acts as a central hub, distributing pose data to various components
- Components (visualization, analytics, audio) react to pose data changes

### 3. Factory Pattern

Exercise objects are created using a factory pattern in exercises.js, providing a consistent structure for all exercise definitions with properties like:

- Basic metadata (name, description, difficulty)
- Target muscles
- Instructions
- Key form points
- Rep goals

### 4. Strategy Pattern

Different strategies are employed for analyzing different exercise types:

- Each exercise has specific form analysis logic
- Joint angle calculations vary based on exercise type
- Rep counting uses different state machines depending on the exercise

### 5. Command Pattern

User interactions trigger commands that are executed by the application:

- Starting/stopping camera
- Selecting exercises
- Starting/stopping exercise tracking
- Toggling visualization options

## Data Flow

```
┌──────────────┐    ┌───────────────┐    ┌────────────────┐
│ Camera Input │───▶│ MediaPipe     │───▶│ Pose Detection │
└──────────────┘    │ Holistic Model│    │ Results        │
                    └───────────────┘    └────────┬───────┘
                                                  │
                                                  ▼
┌──────────────┐    ┌───────────────┐    ┌────────────────┐
│ Form         │◀───│ Exercise      │◀───│ Pose Analysis  │
│ Feedback     │    │ Analysis      │    │ & Processing   │
└──────────────┘    └───────────────┘    └────────────────┘
       │                    │                     │
       ▼                    ▼                     ▼
┌──────────────┐    ┌───────────────┐    ┌────────────────┐
│ Visual       │    │ Audio         │    │ Analytics      │
│ Feedback     │    │ Feedback      │    │ & Tracking     │
└──────────────┘    └───────────────┘    └────────────────┘
                                                  │
                                                  ▼
                                         ┌────────────────┐
                                         │ Gemini API     │
                                         │ Integration    │
                                         └────────────────┘
                                                  │
                                                  ▼
                                         ┌────────────────┐
                                         │ AI-Powered     │
                                         │ Feedback       │
                                         └────────────────┘
```

## Key Implementation Patterns

### 1. Real-time Pose Analysis

- Camera feed is processed frame-by-frame
- MediaPipe Holistic model extracts pose landmarks
- Landmarks are normalized to canvas coordinates
- Joint angles are calculated using vector mathematics
- Form quality is assessed based on exercise-specific criteria

#### Enhanced Angle Calculation System

The angle calculation system is being enhanced with the following components:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Raw Landmark    │────▶│ Landmark        │────▶│ Angle           │
│ Detection       │     │ Filtering       │     │ Calculation     │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ User Feedback   │◀────│ Form Quality    │◀────│ Angle           │
│ Generation      │     │ Assessment      │     │ Normalization   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

- **Landmark Filtering**: Applies temporal smoothing to reduce jitter in detected landmarks
- **Angle Calculation**: Uses vector mathematics to calculate angles between key body points
- **Angle Normalization**: Adjusts for individual body proportions and camera perspective
- **Form Quality Assessment**: Compares calculated angles to ideal ranges for the specific exercise
- **User Feedback Generation**: Creates visual and textual feedback based on angle discrepancies

The system uses a weighted moving average for landmark smoothing:

```javascript
// Pseudocode for landmark smoothing
function smoothLandmark(newLandmark, previousLandmarks, weight = 0.3) {
  if (!previousLandmarks.length) return newLandmark;
  
  const avgLandmark = {
    x: previousLandmarks.reduce((sum, l) => sum + l.x, 0) / previousLandmarks.length,
    y: previousLandmarks.reduce((sum, l) => sum + l.y, 0) / previousLandmarks.length,
    z: previousLandmarks.reduce((sum, l) => sum + l.z, 0) / previousLandmarks.length
  };
  
  return {
    x: newLandmark.x * weight + avgLandmark.x * (1 - weight),
    y: newLandmark.y * weight + avgLandmark.y * (1 - weight),
    z: newLandmark.z * weight + avgLandmark.z * (1 - weight)
  };
}
```

### 2. Exercise State Machine

Each exercise implements a state machine for rep counting:

```
┌─────────────┐
│  Waiting    │
└──────┬──────┘
       │
       ▼
┌─────────────┐         ┌─────────────┐
│    Down     │────────▶│     Up      │
└──────┬──────┘         └──────┬──────┘
       │                       │
       └───────────────────────┘
```

- **Waiting**: Initial state before exercise begins
- **Down**: Bottom position of the exercise (e.g., arms extended in bicep curl)
- **Up**: Top position of the exercise (e.g., arms flexed in bicep curl)

Transitions between states are triggered by specific joint angle thresholds.

### 3. Feedback Prioritization and Visualization

#### Feedback Prioritization

The application uses a priority queue for audio feedback:

- High priority: Form corrections and safety issues
- Medium priority: Rep counting and exercise state changes
- Low priority: General encouragement and breathing cues

This ensures the most important feedback is delivered first.

#### Visual Feedback System

The enhanced visual feedback system provides immediate, actionable feedback on form:

```
┌─────────────────────────────────────────────────────────────┐
│                      Visual Feedback                         │
│                                                             │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐   │
│  │ Angle       │   │ Color-coded │   │ Text Overlay    │   │
│  │ Visualization│   │ Indicators  │   │ Feedback       │   │
│  └─────────────┘   └─────────────┘   └─────────────────┘   │
│                                                             │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐   │
│  │ Ideal Range │   │ Correction  │   │ Progress        │   │
│  │ Indicators  │   │ Arrows      │   │ Indicators      │   │
│  └─────────────┘   └─────────────┘   └─────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

Components of the visual feedback system:

1. **Angle Visualization**: Displays current joint angles numerically and graphically
2. **Color-coded Indicators**: 
   - Green: Angle within ideal range
   - Yellow: Angle slightly outside ideal range
   - Red: Angle significantly outside ideal range
3. **Text Overlay Feedback**: Concise text instructions for correcting form
4. **Ideal Range Indicators**: Visual representation of target angle ranges
5. **Correction Arrows**: Directional indicators showing how to adjust position
6. **Progress Indicators**: Shows improvement in form over time

The system uses a threshold-based approach to determine feedback severity:

```javascript
// Pseudocode for feedback severity determination
function determineFeedbackSeverity(currentAngle, idealRange) {
  const [minIdeal, maxIdeal] = idealRange;
  const minWarningThreshold = minIdeal - 10;
  const maxWarningThreshold = maxIdeal + 10;
  
  if (currentAngle >= minIdeal && currentAngle <= maxIdeal) {
    return "good"; // Green
  } else if (currentAngle >= minWarningThreshold && currentAngle <= maxWarningThreshold) {
    return "warning"; // Yellow
  } else {
    return "error"; // Red
  }
}
```

### 4. Progressive Enhancement

The application follows a progressive enhancement approach:

- Core functionality works with basic webcam and pose detection
- Enhanced features (AI feedback, analytics) are added when available
- Graceful fallbacks when advanced features aren't available

### 5. Local Storage for Persistence

- Exercise history and analytics are stored in localStorage
- API keys are securely saved for future sessions
- User preferences for visualization and audio are persisted

## Critical Implementation Paths

1. **Camera Initialization → MediaPipe Setup → Pose Detection**
   - Critical for basic functionality
   - Must handle permissions and errors gracefully

2. **Exercise Selection → Form Analysis → Rep Counting**
   - Core workout tracking functionality
   - Exercise-specific analysis must be accurate

3. **Pose Data → Analytics → Insights Generation**
   - Provides value through personalized feedback
   - Depends on sufficient historical data

4. **Gemini API Integration → AI Feedback → User Presentation**
   - Enhanced feedback capability
   - Must handle API limitations and errors
