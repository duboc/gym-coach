// Documentation module for displaying football technique metrics and form guidance
import { baseMetrics, techniqueMetrics } from './technique-metrics.js';

class DocumentationManager {
  constructor() {
    this.container = null;
    this.currentTab = 'technique-form';
    this.currentTechnique = null;
    this.isVisible = false;

    this.initialize = this.initialize.bind(this);
    this.createDocumentationTab = this.createDocumentationTab.bind(this);
    this.showDocumentation = this.showDocumentation.bind(this);
    this.hideDocumentation = this.hideDocumentation.bind(this);
    this.switchTab = this.switchTab.bind(this);
    this.renderContent = this.renderContent.bind(this);
    this.setExercise = this.setExercise.bind(this);
  }

  initialize() {
    if (!document.getElementById('documentation-tab')) {
      this.createDocumentationTab();
    }

    document.getElementById('toggle-documentation').addEventListener('click', () => {
      if (this.isVisible) {
        this.hideDocumentation();
      } else {
        this.showDocumentation();
      }
    });

    const tabButtons = document.querySelectorAll('.doc-tab-button');
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        this.switchTab(button.dataset.tab);
      });
    });
  }

  createDocumentationTab() {
    this.container = document.createElement('div');
    this.container.id = 'documentation-tab';
    this.container.className = 'documentation-tab';

    const header = document.createElement('div');
    header.className = 'documentation-header';
    header.innerHTML = `
      <h2><i class="fas fa-book"></i> Football Technique Guide</h2>
      <button id="close-documentation" class="btn"><i class="fas fa-times"></i></button>
    `;

    const tabs = document.createElement('div');
    tabs.className = 'documentation-tabs';
    tabs.innerHTML = `
      <button class="doc-tab-button active" data-tab="technique-form">
        <i class="fas fa-futbol"></i> Technique Guide
      </button>
      <button class="doc-tab-button" data-tab="metrics-explanation">
        <i class="fas fa-chart-bar"></i> Metrics
      </button>
      <button class="doc-tab-button" data-tab="camera-setup">
        <i class="fas fa-camera"></i> Camera Setup
      </button>
      <button class="doc-tab-button" data-tab="feedback-system">
        <i class="fas fa-comments"></i> Feedback System
      </button>
    `;

    const content = document.createElement('div');
    content.className = 'documentation-content';
    content.id = 'documentation-content';

    this.container.appendChild(header);
    this.container.appendChild(tabs);
    this.container.appendChild(content);

    document.querySelector('.app-container').appendChild(this.container);
    document.getElementById('close-documentation').addEventListener('click', this.hideDocumentation);
    this.container.style.display = 'none';
    this.renderContent();
  }

  showDocumentation() {
    if (this.container) {
      this.container.style.display = 'flex';
      this.isVisible = true;
      this.renderContent();
    }
  }

  hideDocumentation() {
    if (this.container) {
      this.container.style.display = 'none';
      this.isVisible = false;
    }
  }

  switchTab(tabId) {
    this.currentTab = tabId;
    const tabButtons = document.querySelectorAll('.doc-tab-button');
    tabButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.tab === tabId);
    });
    this.renderContent();
  }

  setExercise(technique) {
    this.currentTechnique = technique;
    if (this.isVisible) {
      this.renderContent();
    }
  }

  renderContent() {
    const contentContainer = document.getElementById('documentation-content');
    if (!contentContainer) return;
    contentContainer.innerHTML = '';

    switch (this.currentTab) {
      case 'technique-form':
        this.renderTechniqueFormGuide(contentContainer);
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

  renderTechniqueFormGuide(container) {
    if (!this.currentTechnique) {
      container.innerHTML = `
        <div class="doc-section">
          <h3>Football Technique Guides</h3>
          <p>Select a technique from the list to view detailed form guidance:</p>
          <div class="exercise-doc-list"></div>
        </div>
      `;

      const techniqueList = container.querySelector('.exercise-doc-list');
      Object.keys(techniqueMetrics).forEach(techniqueName => {
        const technique = techniqueMetrics[techniqueName];
        const item = document.createElement('div');
        item.className = 'exercise-doc-item';
        item.innerHTML = `
          <h4>${techniqueName}</h4>
          <p><strong>Primary View:</strong> ${technique.primaryView}</p>
          <button class="btn btn-small view-exercise-details" data-exercise="${techniqueName}">View Details</button>
        `;
        techniqueList.appendChild(item);
      });

      container.querySelectorAll('.view-exercise-details').forEach(button => {
        button.addEventListener('click', () => {
          this.setExercise(techniqueMetrics[button.dataset.exercise]);
          this.renderContent();
        });
      });
      return;
    }

    const technique = this.currentTechnique;
    const techniqueName = Object.keys(techniqueMetrics).find(name => techniqueMetrics[name] === technique);

    const backButton = document.createElement('button');
    backButton.className = 'btn btn-small back-button';
    backButton.innerHTML = '<i class="fas fa-arrow-left"></i> Back to Technique List';
    backButton.addEventListener('click', () => { this.currentTechnique = null; this.renderContent(); });
    container.appendChild(backButton);

    const detailsSection = document.createElement('div');
    detailsSection.className = 'doc-section';
    detailsSection.innerHTML = `
      <h3>${techniqueName}</h3>
      <p><strong>Primary Camera View:</strong> ${technique.primaryView}</p>
      <p><strong>Key Metrics:</strong> ${technique.keyMetrics.map(m => `<span class="metric-tag">${m}</span>`).join(' ')}</p>
      <h4>Form Guidance</h4>
      <ol class="form-guidance-list">
        ${technique.formGuidance.map(g => `<li>${g}</li>`).join('')}
      </ol>
    `;
    container.appendChild(detailsSection);

    const metricsSection = document.createElement('div');
    metricsSection.className = 'doc-section';
    metricsSection.innerHTML = `
      <h4>Metrics Implementation</h4>
      <div class="metrics-details">
        ${technique.keyMetrics.map(metricKey => {
          const baseMetric = baseMetrics[metricKey];
          const implementation = technique.metricImplementations[metricKey];
          if (!baseMetric) return '';
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

    const repSection = document.createElement('div');
    repSection.className = 'doc-section';
    repSection.innerHTML = `
      <h4>Rep/Movement Counting</h4>
      <p><strong>States:</strong> ${technique.repCountingStrategy.states.join(' → ')}</p>
      <p><strong>Count on:</strong> ${technique.repCountingStrategy.countOn}</p>
    `;
    container.appendChild(repSection);
  }

  renderMetricsExplanation(container) {
    container.innerHTML = `
      <div class="doc-section">
        <h3>Football Technique Metrics</h3>
        <p>These metrics analyze technique form and provide feedback:</p>
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
              <div class="metric-priority"><span class="priority-tag">${metric.priority}</span></div>
              <div class="metric-description">${metric.description}</div>
              <div class="metric-view">${metric.idealView}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  renderCameraSetupGuide(container) {
    container.innerHTML = `
      <div class="doc-section">
        <h3>Camera Setup for Football</h3>
        <p>Position your camera properly for accurate technique analysis:</p>
        <div class="camera-views">
          <div class="camera-view">
            <h4>Side View</h4>
            <div class="camera-view-image side-view">
              <i class="fas fa-user-alt"></i>
              <i class="fas fa-camera"></i>
            </div>
            <h5>Best For:</h5>
            <ul>
              <li>Kicking technique (instep, volley)</li>
              <li>Heading motion</li>
              <li>Throw-in form</li>
              <li>Hip and knee angles</li>
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
              <li>Dribbling posture</li>
              <li>Goalkeeper stance</li>
              <li>Inside foot pass alignment</li>
              <li>Balance and symmetry</li>
            </ul>
          </div>
        </div>
        <div class="camera-recommendations">
          <h4>Technique-Specific Camera Recommendations</h4>
          <div class="exercise-camera-table">
            <div class="exercise-camera-row header">
              <div>Technique</div><div>Recommended View</div><div>Alternative</div>
            </div>
            ${Object.entries(techniqueMetrics).map(([name, tech]) => `
              <div class="exercise-camera-row">
                <div>${name}</div>
                <div>${tech.primaryView} View</div>
                <div>${tech.primaryView === 'Side' ? 'Front' : 'Side'} View (Limited)</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  renderFeedbackSystem(container) {
    container.innerHTML = `
      <div class="doc-section">
        <h3>Feedback System</h3>
        <p>The app provides real-time feedback through visual overlays, audio coaching, and AI-powered analysis.</p>
        <div class="feedback-types">
          <div class="feedback-type">
            <h4><i class="fas fa-eye"></i> Visual Feedback</h4>
            <div class="feedback-details">
              <p>Color-coded indicators show technique quality:</p>
              <ul>
                <li class="feedback-good">Green: Good form</li>
                <li class="feedback-warning">Yellow: Needs adjustment</li>
                <li class="feedback-error">Red: Significant correction needed</li>
              </ul>
            </div>
          </div>
          <div class="feedback-type">
            <h4><i class="fas fa-volume-up"></i> Audio Feedback</h4>
            <div class="feedback-details">
              <p>Voice coaching provides real-time technique corrections, rep counting, and encouragement.</p>
            </div>
          </div>
          <div class="feedback-type">
            <h4><i class="fas fa-brain"></i> AI Feedback</h4>
            <div class="feedback-details">
              <p>AI-powered analysis provides comprehensive form assessment and personalized improvement tips.</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

const documentationManager = new DocumentationManager();
export default documentationManager;
