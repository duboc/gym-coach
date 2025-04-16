# Technical Context: Fitness Tracker with MediaPipe

## Technology Stack

### Core Technologies

| Technology | Purpose | Implementation |
|------------|---------|----------------|
| **HTML5** | Structure and content | Standard semantic HTML with responsive layout |
| **CSS3** | Styling and layout | Custom CSS with variables for theming |
| **JavaScript (ES6+)** | Application logic | Modular JS with ES6 modules |
| **MediaPipe** | Pose detection | Holistic model for full-body tracking |
| **Canvas API** | Visualization | Drawing pose landmarks and visual feedback |
| **Web Speech API** | Audio feedback | Speech synthesis for voice coaching |
| **Fetch API** | Network requests | API calls to Gemini and loading resources |
| **LocalStorage API** | Data persistence | Storing user preferences and exercise history |

### External Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| **MediaPipe Holistic** | CDN | Full-body pose, face, and hand tracking |
| **MediaPipe Drawing Utils** | CDN | Utilities for rendering pose landmarks |
| **MediaPipe Camera Utils** | CDN | Camera access and processing |
| **Font Awesome** | 6.4.2 | Icons for UI elements |
| **Google Gemini API** | 2.0-flash | AI-powered exercise feedback |

## Development Environment

The application is developed as a client-side web application with no build process or bundling. Files are loaded directly by the browser using ES6 module imports.

### File Structure

```
/
├── index.html           # Main HTML entry point
├── styles.css           # Global styles
├── script.js            # Main application logic
├── exercises.js         # Exercise definitions
├── visualization.js     # Form visualization module
├── audio-coach.js       # Audio feedback module
├── gemini-api.js        # Gemini API integration
├── advanced-analytics.js # Exercise analytics
├── env-loader.js        # Environment configuration
├── .env                 # Environment variables (gitignored)
├── run.sh               # Helper script to start local server
└── favicon.ico          # Application icon
```

### Local Development

The application can be run using any local HTTP server. A helper script `run.sh` is provided that starts a Python HTTP server on port 8000.

## Technical Constraints

### Browser Compatibility

- **Modern browsers only**: Chrome, Firefox, Edge, Safari (latest versions)
- Requires support for:
  - ES6 Modules
  - Canvas API
  - Web Speech API
  - MediaDevices API (for camera access)
  - Fetch API
  - LocalStorage API

### Security Requirements

- **HTTPS or localhost**: Camera access requires a secure context
- **Gemini API Key**: Required for AI-powered feedback
- **User Permissions**: Camera access requires explicit user permission

### Performance Considerations

- **CPU Usage**: Real-time pose detection is computationally intensive
- **Memory Usage**: Tracking exercise history and analytics data
- **Network Usage**: 
  - Initial loading of MediaPipe models (~13MB)
  - Periodic API calls to Gemini for feedback

### Responsiveness

- **Desktop-first design**: Optimized for desktop/laptop use with webcam
- **Responsive breakpoints**: Adapts to different screen sizes
- **Mobile limitations**: Camera positioning may be challenging on mobile devices

## Integration Points

### MediaPipe Integration

```javascript
// Initialize MediaPipe Holistic
holistic = new Holistic({
  locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
  }
});

// Configure model options
holistic.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  enableSegmentation: true,
  smoothSegmentation: true,
  refineFaceLandmarks: false,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

// Set up result handler
holistic.onResults(onResults);
```

### Gemini API Integration

```javascript
// API endpoint
const apiEndpoint = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent';

// Request format
const requestBody = {
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
};
```

## Technical Decisions

### Why MediaPipe?

- **Accuracy**: High-quality pose detection with minimal latency
- **Client-side processing**: No need for server-side processing
- **Comprehensive tracking**: Includes pose, hand, and face landmarks
- **Web integration**: Designed to work well in browser environments

### Why Gemini API?

- **Advanced language capabilities**: Provides detailed, contextual feedback
- **Structured output**: Can generate formatted feedback in specific sections
- **Low latency**: Fast enough for near-real-time feedback
- **Customizable**: Adjustable parameters for response style

### Why No Backend?

- **Simplicity**: Reduces deployment complexity
- **Privacy**: All processing happens on the client
- **Cost**: No server infrastructure needed
- **Offline potential**: Could work offline except for API calls

### Why ES6 Modules?

- **Code organization**: Clean separation of concerns
- **No build step**: Direct browser loading without bundling
- **Modern standard**: Well-supported in target browsers
- **Explicit dependencies**: Clear import/export relationships

## Future Technical Considerations

1. **Performance Optimization**:
   - Worker threads for analytics processing
   - Reduced model complexity option for lower-end devices

2. **Offline Support**:
   - Service Worker for offline access
   - Caching of MediaPipe models
   - Offline fallback for Gemini API

3. **Build Process**:
   - Consider adding bundling for production
   - Code minification and optimization
   - Asset optimization

4. **Backend Integration**:
   - Optional backend for data persistence
   - User accounts and progress syncing
   - Shared workout programs

5. **Mobile Optimization**:
   - Dedicated mobile interface
   - Device orientation handling
   - Touch-optimized controls
