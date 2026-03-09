// Documentation module for displaying exercise metrics and form guidance
import { baseMetrics, exerciseMetrics } from './exercise-metrics.js';

class DocumentationManager {
  constructor() {
    this.container = null;
    this.currentTab = 'exercise-form';
    this.currentExercise = null;
    this.isVisible = false;
    
    // Bind methods
    this.initialize = this.initialize.bind(this);
    this.createDocumentationTab = this.createDocumentationTab.bind(this);
    this.showDocumentation = this.showDocumentation.bind(this);
    this.hideDocumentation = this.hideDocumentation.bind(this);
    this.switchTab = this.switchTab.bind(this);
    this.renderContent = this.renderContent.bind(this);
    this.setExercise = this.setExercise.bind(this);
  }
  
  // Initialize the documentation manager
  initialize() {
    // Create the documentation tab if it doesn't exist
    if (!document.getElementById('documentation-tab')) {
      this.createDocumentationTab();
    }
    
    // Set up event listeners
    document.getElementById('toggle-documentation').addEventListener('click', () => {
      if (this.isVisible) {
        this.hideDocumentation();
      } else {
        this.showDocumentation();
      }
    });
    
    // Set up tab switching
    const tabButtons = document.querySelectorAll('.doc-tab-button');
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        this.switchTab(button.dataset.tab);
      });
    });
  }
  
  // Create the documentation tab in the UI
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
  
  // Show the documentation tab
  showDocumentation() {
    if (this.container) {
      this.container.style.display = 'flex';
      this.isVisible = true;
      
      // Re-render content in case exercise changed
      this.renderContent();
    }
  }
  
  // Hide the documentation tab
  hideDocumentation() {
    if (this.container) {
      this.container.style.display = 'none';
      this.isVisible = false;
    }
  }
  
  // Switch between documentation tabs
  switchTab(tabId) {
    // Update active tab
    this.currentTab = tabId;
    
    // Update tab button styles
    const tabButtons = document.querySelectorAll('.doc-tab-button');
    tabButtons.forEach(button => {
      if (button.dataset.tab === tabId) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });
    
    // Render the content for the selected tab
    this.renderContent();
  }
  
  // Set the current exercise
  setExercise(exercise) {
    this.currentExercise = exercise;
    
    // Re-render content if documentation is visible
    if (this.isVisible) {
      this.renderContent();
    }
  }
  
  // Render the content for the current tab
  renderContent() {
    const contentContainer = document.getElementById('documentation-content');
    if (!contentContainer) return;
    
    // Clear current content
    contentContainer.innerHTML = '';
    
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
  
  // Render exercise form guide
  renderExerciseFormGuide(container) {
    // If no exercise is selected, show a list of all exercises
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
      
      // Add event listeners to view details buttons
      const viewButtons = container.querySelectorAll('.view-exercise-details');
      viewButtons.forEach(button => {
        button.addEventListener('click', () => {
          const exerciseName = button.dataset.exercise;
          // Find the exercise in the exercises list and set it as current
          this.setExercise(exerciseMetrics[exerciseName]);
          this.renderContent();
        });
      });
      
      return;
    }
    
    // Show details for the selected exercise
    const exercise = this.currentExercise;
    const exerciseName = Object.keys(exerciseMetrics).find(
      name => exerciseMetrics[name] === exercise
    );
    
    // Create back button
    const backButton = document.createElement('button');
    backButton.className = 'btn btn-small back-button';
    backButton.innerHTML = '<i class="fas fa-arrow-left"></i> Back to Exercise List';
    backButton.addEventListener('click', () => {
      this.currentExercise = null;
      this.renderContent();
    });
    
    container.appendChild(backButton);
    
    // Exercise details
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
    
    // Metrics implementation details
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
    
    // Rep counting strategy
    const repCountingSection = document.createElement('div');
    repCountingSection.className = 'doc-section';
    repCountingSection.innerHTML = `
      <h4>Rep Counting Strategy</h4>
      <p><strong>States:</strong> ${exercise.repCountingStrategy.states.join(' → ')}</p>
      <p><strong>Count on:</strong> ${exercise.repCountingStrategy.countOn}</p>
    `;
    
    container.appendChild(repCountingSection);
  }
  
  // Render metrics explanation
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
  
  // Render camera setup guide
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
  
  // Render feedback system explanation
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
