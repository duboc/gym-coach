/**
 * @file Manages the in-app documentation tab, displaying exercise guides,
 * metric explanations, and other helpful information.
 */
import { baseMetrics, exerciseMetrics } from './exercise-metrics.js';

/**
 * Manages the documentation UI, including rendering different tabs and content.
 * @class
 */
class DocumentationManager {
  /**
   * Initializes the DocumentationManager.
   */
  constructor() {
    /** @type {HTMLElement|null} The main container for the documentation tab. */
    this.container = null;
    /** @type {string} The ID of the currently active tab. */
    this.currentTab = 'exercise-form';
    /** @type {Object|null} The currently selected exercise object. */
    this.currentExercise = null;
    /** @type {boolean} Whether the documentation tab is currently visible. */
    this.isVisible = false;
    
    // Bind methods to ensure 'this' context is correct
    this.initialize = this.initialize.bind(this);
    this.createDocumentationTab = this.createDocumentationTab.bind(this);
    this.showDocumentation = this.showDocumentation.bind(this);
    this.hideDocumentation = this.hideDocumentation.bind(this);
    this.switchTab = this.switchTab.bind(this);
    this.renderContent = this.renderContent.bind(this);
    this.setExercise = this.setExercise.bind(this);
  }
  
  /**
   * Initializes the documentation manager by creating the tab and setting up event listeners.
   * @returns {void}
   */
  initialize() {
    // Create the documentation tab if it doesn't already exist
    if (!document.getElementById('documentation-tab')) {
      this.createDocumentationTab();
    }
    
    // Set up event listener for the main toggle button
    document.getElementById('toggle-documentation').addEventListener('click', () => {
      if (this.isVisible) {
        this.hideDocumentation();
      } else {
        this.showDocumentation();
      }
    });
    
    // Set up event listeners for tab switching
    const tabButtons = document.querySelectorAll('.doc-tab-button');
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        this.switchTab(button.dataset.tab);
      });
    });
  }
  
  /**
   * Creates the documentation tab element and appends it to the DOM.
   * @private
   * @returns {void}
   */
  createDocumentationTab() {
    // Create container
    this.container = document.createElement('div');
    this.container.id = 'documentation-tab';
    this.container.className = 'documentation-tab';
    
    // Create header
    const header = document.createElement('div');
    header.className = 'documentation-header';
    header.innerHTML = `
      <h2><i class="fas fa-book"></i> Exercise Documentation</h2>
      <button id="close-documentation" class="btn"><i class="fas fa-times"></i></button>
    `;
    
    // Create tabs
    const tabs = document.createElement('div');
    tabs.className = 'documentation-tabs';
    tabs.innerHTML = `
      <button class="doc-tab-button active" data-tab="exercise-form">
        <i class="fas fa-dumbbell"></i> Exercise Form Guide
      </button>
      <button class="doc-tab-button" data-tab="metrics-explanation">
        <i class="fas fa-chart-bar"></i> Metrics Explanation
      </button>
      <button class="doc-tab-button" data-tab="camera-setup">
        <i class="fas fa-camera"></i> Camera Setup Guide
      </button>
      <button class="doc-tab-button" data-tab="feedback-system">
        <i class="fas fa-comments"></i> Feedback System
      </button>
    `;
    
    // Create content area
    const content = document.createElement('div');
    content.className = 'documentation-content';
    content.id = 'documentation-content';
    
    // Assemble the tab
    this.container.appendChild(header);
    this.container.appendChild(tabs);
    this.container.appendChild(content);
    
    // Add to the page
    document.querySelector('.app-container').appendChild(this.container);
    
    // Set up close button
    document.getElementById('close-documentation').addEventListener('click', this.hideDocumentation);
    
    // Initially hide the documentation
    this.container.style.display = 'none';
    
    // Render initial content
    this.renderContent();
  }
  
  /**
   * Shows the documentation tab and re-renders its content.
   * @returns {void}
   */
  showDocumentation() {
    if (this.container) {
      this.container.style.display = 'flex';
      this.isVisible = true;
      
      // Re-render content in case the selected exercise has changed
      this.renderContent();
    }
  }
  
  /**
   * Hides the documentation tab.
   * @returns {void}
   */
  hideDocumentation() {
    if (this.container) {
      this.container.style.display = 'none';
      this.isVisible = false;
    }
  }
  
  /**
   * Switches the visible content to the selected tab.
   * @param {string} tabId - The ID of the tab to display (e.g., 'exercise-form').
   * @returns {void}
   */
  switchTab(tabId) {
    // Update the active tab state
    this.currentTab = tabId;
    
    // Update the visual style of the tab buttons
    const tabButtons = document.querySelectorAll('.doc-tab-button');
    tabButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.tab === tabId);
    });
    
    // Render the content for the newly selected tab
    this.renderContent();
  }
  
  /**
   * Sets the current exercise to be displayed in the documentation.
   * @param {Object} exercise - The exercise object from `exerciseMetrics.js`.
   * @returns {void}
   */
  setExercise(exercise) {
    this.currentExercise = exercise;
    
    // Re-render content if the documentation tab is currently visible
    if (this.isVisible) {
      this.renderContent();
    }
  }
  
  /**
   * Renders the content for the currently active tab.
   * @private
   * @returns {void}
   */
  renderContent() {
    const contentContainer = document.getElementById('documentation-content');
    if (!contentContainer) return;
    
    // Clear current content
    contentContainer.innerHTML = '';
    
    // Route to the appropriate rendering function based on the active tab
    switch (this.currentTab) {
      case 'exercise-form':
        this.renderExerciseFormGuide(contentContainer);
        break;
      case 'metrics-explanation':
        this.renderMetricsExplanation(contentContainer);
        break;
      case 'camera-setup':
        this.renderCameraSetupGuide(contentContainer);
        break;
      case 'feedback-system':
        this.renderFeedbackSystem(contentContainer);
        break;
      default:
        contentContainer.innerHTML = '<p>Select a tab to view documentation.</p>';
    }
  }
  
  /**
   * Renders the exercise form guide, showing a list of exercises or details for a selected one.
   * @private
   * @param {HTMLElement} container - The HTML element to render the content into.
   * @returns {void}
   */
  renderExerciseFormGuide(container) {
    // If no exercise is selected, show a list of all available exercises
    if (!this.currentExercise) {
      container.innerHTML = `
        <div class="doc-section">
          <h3>Exercise Form Guides</h3>
          <p>Select an exercise from the list to view detailed form guidance:</p>
          <div class="exercise-doc-list"></div>
        </div>
      `;
      
      const exerciseList = container.querySelector('.exercise-doc-list');
      
      // Add each exercise to the list
      Object.keys(exerciseMetrics).forEach(exerciseName => {
        const exercise = exerciseMetrics[exerciseName];
        const exerciseItem = document.createElement('div');
        exerciseItem.className = 'exercise-doc-item';
        exerciseItem.innerHTML = `
          <h4>${exerciseName}</h4>
          <p><strong>Primary View:</strong> ${exercise.primaryView}</p>
          <button class="btn btn-small view-exercise-details" data-exercise="${exerciseName}">
            View Details
          </button>
        `;
        exerciseList.appendChild(exerciseItem);
      });
      
      // Add event listeners to the "View Details" buttons
      container.querySelectorAll('.view-exercise-details').forEach(button => {
        button.addEventListener('click', () => {
          const exerciseName = button.dataset.exercise;
          // Set the selected exercise and re-render the content to show its details
          this.setExercise(exerciseMetrics[exerciseName]);
          this.renderContent();
        });
      });
      
      return;
    }
    
    // If an exercise is selected, show its detailed documentation
    const exercise = this.currentExercise;
    const exerciseName = Object.keys(exerciseMetrics).find(
      name => exerciseMetrics[name] === exercise
    );
    
    // Create a "Back" button to return to the exercise list
    const backButton = document.createElement('button');
    backButton.className = 'btn btn-small back-button';
    backButton.innerHTML = '<i class="fas fa-arrow-left"></i> Back to Exercise List';
    backButton.addEventListener('click', () => {
      this.currentExercise = null;
      this.renderContent();
    });
    
    container.appendChild(backButton);
    
    // Render exercise details
    const detailsSection = document.createElement('div');
    detailsSection.className = 'doc-section';
    detailsSection.innerHTML = `
      <h3>${exerciseName}</h3>
      <p><strong>Primary Camera View:</strong> ${exercise.primaryView}</p>
      <p><strong>Key Metrics:</strong> ${exercise.keyMetrics.map(metric => 
        `<span class="metric-tag">${metric}</span>`
      ).join(' ')}</p>
      
      <h4>Form Guidance</h4>
      <ol class="form-guidance-list">
        ${exercise.formGuidance.map(guidance => 
          `<li>${guidance}</li>`
        ).join('')}
      </ol>
    `;
    
    container.appendChild(detailsSection);
    
    // Render metrics implementation details for the selected exercise
    const metricsSection = document.createElement('div');
    metricsSection.className = 'doc-section';
    metricsSection.innerHTML = `
      <h4>Metrics Implementation</h4>
      <div class="metrics-details">
        ${exercise.keyMetrics.map(metricKey => {
          const baseMetric = baseMetrics[metricKey];
          const implementation = exercise.metricImplementations[metricKey];
          
          return `
            <div class="metric-detail">
              <h5>${metricKey} <span class="priority-tag">${baseMetric.priority}</span></h5>
              <p>${baseMetric.description}</p>
              <p><strong>Ideal View:</strong> ${baseMetric.idealView}</p>
              ${implementation ? `
                <div class="implementation-detail">
                  <p><strong>Feedback:</strong></p>
                  <ul>
                    <li class="feedback-good">Good: ${implementation.feedbackText?.good || baseMetric.feedbackText.good}</li>
                    <li class="feedback-warning">Warning: ${implementation.feedbackText?.warning || baseMetric.feedbackText.warning}</li>
                    <li class="feedback-error">Error: ${implementation.feedbackText?.error || baseMetric.feedbackText.error}</li>
                  </ul>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
    
    container.appendChild(metricsSection);
    
    // Render rep counting strategy
    const repCountingSection = document.createElement('div');
    repCountingSection.className = 'doc-section';
    repCountingSection.innerHTML = `
      <h4>Rep Counting Strategy</h4>
      <p><strong>States:</strong> ${exercise.repCountingStrategy.states.join(' → ')}</p>
      <p><strong>Count on:</strong> ${exercise.repCountingStrategy.countOn}</p>
    `;
    
    container.appendChild(repCountingSection);
  }
  
  /**
   * Renders the metrics explanation tab with a table of all base metrics.
   * @private
   * @param {HTMLElement} container - The HTML element to render the content into.
   * @returns {void}
   */
  renderMetricsExplanation(container) {
    container.innerHTML = `
      <div class="doc-section">
        <h3>Exercise Metrics Explanation</h3>
        <p>These metrics are used to analyze exercise form and provide feedback:</p>
        
        <div class="metrics-table">
          <div class="metrics-table-header">
            <div class="metric-name">Metric</div>
            <div class="metric-priority">Priority</div>
            <div class="metric-description">Description</div>
            <div class="metric-view">Ideal View</div>
          </div>
          
          ${Object.entries(baseMetrics).map(([key, metric]) => `
            <div class="metrics-table-row">
              <div class="metric-name">${key}</div>
              <div class="metric-priority">
                <span class="priority-tag">${metric.priority}</span>
              </div>
              <div class="metric-description">${metric.description}</div>
              <div class="metric-view">${metric.idealView}</div>
            </div>
          `).join('')}
        </div>
        
        <div class="metrics-priority-legend">
          <h4>Priority Levels:</h4>
          <ul>
            <li><span class="priority-tag">P0</span> - Critical for safety and effectiveness</li>
            <li><span class="priority-tag">P1</span> - Important for optimal performance</li>
            <li><span class="priority-tag">P2</span> - Beneficial for advanced form refinement</li>
          </ul>
        </div>
      </div>
    `;
  }
  
  /**
   * Renders the camera setup guide with tips and recommendations.
   * @private
   * @param {HTMLElement} container - The HTML element to render the content into.
   * @returns {void}
   */
  renderCameraSetupGuide(container) {
    container.innerHTML = `
      <div class="doc-section">
        <h3>Camera Setup Guide</h3>
        <p>Proper camera positioning is crucial for accurate form analysis. Follow these guidelines:</p>
        
        <div class="camera-views">
          <div class="camera-view">
            <h4>Side View</h4>
            <div class="camera-view-image side-view">
              <i class="fas fa-user-alt"></i>
              <i class="fas fa-camera"></i>
            </div>
            <h5>Best For:</h5>
            <ul>
              <li>Spinal alignment</li>
              <li>Joint angles in sagittal plane</li>
              <li>Depth of movement</li>
              <li>Bicep curls</li>
              <li>Shoulder press</li>
              <li>Bent-over rows</li>
            </ul>
            <h5>Setup Tips:</h5>
            <ul>
              <li>Position camera at hip height</li>
              <li>Stand perpendicular to camera</li>
              <li>Ensure full body is visible</li>
              <li>Keep 8-10 feet distance</li>
            </ul>
          </div>
          
          <div class="camera-view">
            <h4>Front View</h4>
            <div class="camera-view-image front-view">
              <i class="fas fa-user-alt"></i>
              <i class="fas fa-camera"></i>
            </div>
            <h5>Best For:</h5>
            <ul>
              <li>Symmetry between sides</li>
              <li>Joint alignment in frontal plane</li>
              <li>Lateral raises</li>
              <li>Russian twists</li>
            </ul>
            <h5>Setup Tips:</h5>
            <ul>
              <li>Position camera at chest height</li>
              <li>Face directly toward camera</li>
              <li>Ensure full body is visible</li>
              <li>Keep 8-10 feet distance</li>
            </ul>
          </div>
        </div>
        
        <div class="camera-recommendations">
          <h4>Exercise-Specific Camera Recommendations</h4>
          <div class="exercise-camera-table">
            <div class="exercise-camera-row header">
              <div>Exercise</div>
              <div>Recommended View</div>
              <div>Alternative View</div>
            </div>
            ${Object.entries(exerciseMetrics).map(([name, exercise]) => `
              <div class="exercise-camera-row">
                <div>${name}</div>
                <div>${exercise.primaryView} View</div>
                <div>${exercise.primaryView === 'Side' ? 'Front' : 'Side'} View (Limited)</div>
              </div>
            `).join('')}
          </div>
        </div>
        
        <div class="camera-limitations">
          <h4>Single Camera Limitations</h4>
          <p>Be aware of these limitations when using a single camera view:</p>
          <ul>
            <li>Cannot assess depth of movement in frontal view</li>
            <li>Cannot assess symmetry in side view</li>
            <li>Limited ability to detect rotation</li>
            <li>Some angles may be obscured</li>
          </ul>
          <p>For comprehensive analysis, consider alternating between side and front views for different sets.</p>
        </div>
      </div>
    `;
  }
  
  /**
   * Renders the feedback system explanation tab.
   * @private
   * @param {HTMLElement} container - The HTML element to render the content into.
   * @returns {void}
   */
  renderFeedbackSystem(container) {
    container.innerHTML = `
      <div class="doc-section">
        <h3>Feedback System</h3>
        <p>The application provides real-time feedback through multiple channels:</p>
        
        <div class="feedback-types">
          <div class="feedback-type">
            <h4><i class="fas fa-eye"></i> Visual Feedback</h4>
            <div class="feedback-details">
              <h5>Angle Visualization</h5>
              <p>Joint angles are displayed numerically and graphically on the screen.</p>
              
              <h5>Color-Coded Indicators</h5>
              <ul>
                <li class="feedback-good">Green: Good form - angle within ideal range</li>
                <li class="feedback-warning">Yellow: Warning - angle slightly outside ideal range</li>
                <li class="feedback-error">Red: Error - angle significantly outside ideal range</li>
              </ul>
              
              <h5>Movement Guides</h5>
              <p>Visual guides show the ideal path of movement for the exercise.</p>
              
              <h5>Form Correction Overlays</h5>
              <p>Highlighted areas indicate joints that need adjustment.</p>
              
              <h5>Symmetry Detection</h5>
              <p>Visual indicators show differences between left and right sides to help maintain balanced form.</p>
            </div>
          </div>
          
          <div class="feedback-type">
            <h4><i class="fas fa-volume-up"></i> Audio Feedback</h4>
            <div class="feedback-details">
              <h5>Voice Coaching</h5>
              <p>Verbal cues provide guidance on form corrections.</p>
              
              <h5>Rep Counting</h5>
              <p>Audible counting of completed repetitions, including partial rep detection.</p>
              
              <h5>Encouragement</h5>
              <p>Motivational cues to maintain proper form.</p>
              
              <h5>Breathing Reminders</h5>
              <p>Cues for proper breathing technique during exercise.</p>
              
              <h5>Side-Specific Feedback</h5>
              <p>Targeted audio cues for left or right side form corrections when asymmetry is detected.</p>
            </div>
          </div>
          
          <div class="feedback-type">
            <h4><i class="fas fa-brain"></i> AI-Powered Feedback</h4>
            <div class="feedback-details">
              <h5>Form Assessment</h5>
              <p>Comprehensive analysis of your overall form.</p>
              
              <h5>Improvement Tips</h5>
              <p>Personalized suggestions for improving technique.</p>
              
              <h5>Progress Tracking</h5>
              <p>Analysis of improvement over time.</p>
              
              <h5>Exercise-Specific Insights</h5>
              <p>Tailored feedback based on the specific exercise being performed.</p>
            </div>
          </div>
        </div>
        
        <div class="feedback-severity">
          <h4>Understanding Feedback Severity</h4>
          <p>The system uses thresholds to determine the severity of form issues:</p>
          
          <div class="severity-example">
            <h5>Example: Bicep Curl Elbow Angle</h5>
            <ul>
              <li class="feedback-good">Good: 40° - 160° (Ideal range)</li>
              <li class="feedback-warning">Warning: 30° - 40° or 160° - 170° (Slightly outside ideal)</li>
              <li class="feedback-error">Error: &lt; 30° or &gt; 170° (Significantly outside ideal)</li>
            </ul>
          </div>
          
          <div class="severity-example">
            <h5>Example: Bicep Curl Shoulder Stability</h5>
            <ul>
              <li class="feedback-good">Good: Shoulders remain down and back, minimal elevation</li>
              <li class="feedback-warning">Warning: Slight shoulder elevation during curl</li>
              <li class="feedback-error">Error: Significant shoulder shrugging or forward movement</li>
            </ul>
          </div>
          
          <div class="severity-example">
            <h5>Example: Bicep Curl Symmetry</h5>
            <ul>
              <li class="feedback-good">Good: Left and right arms move at similar angles (< 10° difference)</li>
              <li class="feedback-warning">Warning: Moderate asymmetry (10-20° difference)</li>
              <li class="feedback-error">Error: Significant asymmetry (> 20° difference)</li>
            </ul>
          </div>
          
          <p>These thresholds are customized for each exercise and metric to provide accurate feedback.</p>
        </div>
        
        <div class="doc-section">
          <h4>Partial Rep Detection</h4>
          <p>The system can detect and count partial repetitions:</p>
          <ul>
            <li><strong>Full Rep (1.0):</strong> Complete range of motion through the entire exercise</li>
            <li><strong>Partial Rep (0.5):</strong> Limited range of motion that still engages target muscles</li>
            <li><strong>Non-Counting Movement:</strong> Insufficient movement to count as a repetition</li>
          </ul>
          <p>Partial rep detection helps provide more accurate workout tracking and can be useful for advanced training techniques like drop sets.</p>
        </div>
      </div>
    `;
  }
}

// Create and export a singleton instance
const documentationManager = new DocumentationManager();
export default documentationManager;
