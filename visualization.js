// Visualization module for enhanced graphic responses
import { calculateAngle, smoothAngle, determineFeedbackSeverity, exerciseMetrics } from './exercise-metrics.js';

class FormVisualizer {
  constructor(canvasElement, canvasContext) {
    this.canvas = canvasElement;
    this.ctx = canvasContext;
    this.showGuides = true;
    this.showCorrections = true;
    this.showHeatmap = false;
    this.isActive = false; // Track if visualizer is active to prevent duplicate overlays
    
    // Colors for visualization
    this.colors = {
      good: '#30c39e',      // Green for good form
      warning: '#ffc107',   // Yellow for minor issues
      error: '#ff3a5e',     // Red for significant issues
      guide: 'rgba(58, 134, 255, 0.3)', // Blue for guides
      highlight: 'rgba(255, 255, 255, 0.7)' // White highlight
    };
    
    // Initialize any additional properties
    this.lastPoseData = null;
    this.idealPose = null;
    this.formIssues = [];
  }
  
  // Update the visualizer with new pose data and form analysis
  update(poseData, formQuality, formIssues, exerciseType) {
    this.lastPoseData = poseData;
    this.formQuality = formQuality;
    this.formIssues = formIssues || [];
    this.exerciseType = exerciseType;
    this.isActive = true; // Set visualizer as active when updated
    
    // Load ideal pose reference based on exercise type and current pose
    this.updateIdealPose();
  }
  
  // Update the ideal pose reference based on current exercise and pose
  updateIdealPose() {
    if (!this.lastPoseData || !this.exerciseType) return;
    
    // In a real implementation, this would load or calculate the ideal pose
    // based on the current exercise and pose position
    // For now, we'll use a simplified version
    
    this.idealPose = { ...this.lastPoseData };
    
    // Adjust ideal pose based on exercise type
    if (this.exerciseType === "Dumbbell Bicep Curls") {
      // Adjust for ideal bicep curl form
      // This is simplified - in a real implementation, this would be more sophisticated
    } else if (this.exerciseType === "Dumbbell Shoulder Press") {
      // Adjust for ideal shoulder press form
    }
  }
  
  // Draw form correction overlays on the canvas
  drawFormCorrections() {
    if (!this.lastPoseData || !this.showCorrections) return;
    
    const pose = this.lastPoseData.pose;
    if (!pose) return;
    
    // Draw correction highlights based on form issues
    this.formIssues.forEach(issue => {
      if (issue.includes("elbow")) {
        this.highlightJoint(pose[14], this.colors.error, "Fix elbow position"); // Right elbow
        this.highlightJoint(pose[13], this.colors.error, "Fix elbow position"); // Left elbow
      } else if (issue.includes("shoulder")) {
        this.highlightJoint(pose[12], this.colors.error, "Level shoulders"); // Right shoulder
        this.highlightJoint(pose[11], this.colors.error, "Level shoulders"); // Left shoulder
      } else if (issue.includes("wrist")) {
        this.highlightJoint(pose[16], this.colors.error, "Align wrist"); // Right wrist
        this.highlightJoint(pose[15], this.colors.error, "Align wrist"); // Left wrist
      }
    });
    
    // Highlight good form aspects
    if (this.formQuality === "good") {
      // Highlight joints with good positioning
      if (this.exerciseType === "Dumbbell Bicep Curls") {
        this.highlightJoint(pose[14], this.colors.good, "Good elbow position"); // Right elbow
        this.highlightJoint(pose[13], this.colors.good, "Good elbow position"); // Left elbow
      }
    }
  }
  
  // Draw movement guides to show ideal form
  drawMovementGuides() {
    if (!this.lastPoseData || !this.idealPose || !this.showGuides) return;
    
    const pose = this.lastPoseData.pose;
    const ideal = this.idealPose.pose;
    if (!pose || !ideal) return;
    
    this.ctx.save();
    this.ctx.globalAlpha = 0.4;
    this.ctx.strokeStyle = this.colors.guide;
    this.ctx.lineWidth = 3;
    
    // Draw guide lines for key joints
    // This is a simplified version - a real implementation would be more sophisticated
    if (this.exerciseType === "Dumbbell Bicep Curls") {
      // Draw guide for arm position
      this.drawGuideLine(pose[12], pose[14], ideal[12], ideal[14]); // Shoulder to elbow
      this.drawGuideLine(pose[14], pose[16], ideal[14], ideal[16]); // Elbow to wrist
    } else if (this.exerciseType === "Dumbbell Shoulder Press") {
      // Draw guide for arm position
      this.drawGuideLine(pose[12], pose[14], ideal[12], ideal[14]); // Shoulder to elbow
      this.drawGuideLine(pose[14], pose[16], ideal[14], ideal[16]); // Elbow to wrist
    }
    
    this.ctx.restore();
  }
  
  // Draw a guide line between current position and ideal position
  drawGuideLine(currentStart, currentEnd, idealStart, idealEnd) {
    if (!currentStart || !currentEnd || !idealStart || !idealEnd) return;
    
    const startX1 = currentStart.x * this.canvas.width;
    const startY1 = currentStart.y * this.canvas.height;
    const endX1 = currentEnd.x * this.canvas.width;
    const endY1 = currentEnd.y * this.canvas.height;
    
    const startX2 = idealStart.x * this.canvas.width;
    const startY2 = idealStart.y * this.canvas.height;
    const endX2 = idealEnd.x * this.canvas.width;
    const endY2 = idealEnd.y * this.canvas.height;
    
    // Draw current position
    this.ctx.beginPath();
    this.ctx.moveTo(startX1, startY1);
    this.ctx.lineTo(endX1, endY1);
    this.ctx.stroke();
    
    // Draw ideal position
    this.ctx.setLineDash([5, 5]);
    this.ctx.beginPath();
    this.ctx.moveTo(startX2, startY2);
    this.ctx.lineTo(endX2, endY2);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    
    // Draw arrow from current to ideal if they're significantly different
    const distance = Math.sqrt(Math.pow(endX1 - endX2, 2) + Math.pow(endY1 - endY2, 2));
    if (distance > 20) {
      this.drawArrow(endX1, endY1, endX2, endY2);
    }
  }
  
  // Draw an arrow from (x1,y1) to (x2,y2)
  drawArrow(x1, y1, x2, y2) {
    const headLength = 10;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
    
    // Draw the arrow head
    this.ctx.beginPath();
    this.ctx.moveTo(x2, y2);
    this.ctx.lineTo(
      x2 - headLength * Math.cos(angle - Math.PI/6),
      y2 - headLength * Math.sin(angle - Math.PI/6)
    );
    this.ctx.lineTo(
      x2 - headLength * Math.cos(angle + Math.PI/6),
      y2 - headLength * Math.sin(angle + Math.PI/6)
    );
    this.ctx.closePath();
    this.ctx.fillStyle = this.colors.guide;
    this.ctx.fill();
  }
  
  // Highlight a joint with a circle and label
  highlightJoint(joint, color, label) {
    if (!joint) return;
    
    const x = joint.x * this.canvas.width;
    const y = joint.y * this.canvas.height;
    const radius = 25;
    
    // Draw highlight circle
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 3;
    this.ctx.stroke();
    
    // Add pulsing effect
    this.ctx.globalAlpha = 0.3 + 0.2 * Math.sin(Date.now() / 200);
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius + 5, 0, 2 * Math.PI);
    this.ctx.fillStyle = color;
    this.ctx.fill();
    
    // Add label if provided
    if (label) {
      this.ctx.globalAlpha = 1;
      this.ctx.font = '14px Arial';
      this.ctx.fillStyle = this.colors.highlight;
      this.ctx.strokeStyle = 'black';
      this.ctx.lineWidth = 3;
      this.ctx.strokeText(label, x - radius, y - radius - 5);
      this.ctx.fillText(label, x - radius, y - radius - 5);
    }
    
    this.ctx.restore();
  }
  
  // Draw a heatmap overlay showing muscle engagement
  drawMuscleHeatmap() {
    if (!this.showHeatmap || !this.lastPoseData) return;
    
    // This would be a more complex implementation in a real app
    // For now, we'll just show a simplified version based on exercise type
    
    this.ctx.save();
    this.ctx.globalAlpha = 0.3;
    
    if (this.exerciseType === "Dumbbell Bicep Curls") {
      // Highlight bicep areas
      this.drawHeatmapRegion(0.3, 0.3, 0.1, 0.2, 'rgba(255, 0, 0, 0.7)'); // Right bicep
      this.drawHeatmapRegion(0.7, 0.3, 0.1, 0.2, 'rgba(255, 0, 0, 0.7)'); // Left bicep
    } else if (this.exerciseType === "Dumbbell Shoulder Press") {
      // Highlight shoulder areas
      this.drawHeatmapRegion(0.3, 0.2, 0.1, 0.1, 'rgba(255, 0, 0, 0.7)'); // Right shoulder
      this.drawHeatmapRegion(0.7, 0.2, 0.1, 0.1, 'rgba(255, 0, 0, 0.7)'); // Left shoulder
    }
    
    this.ctx.restore();
  }
  
  // Draw a heatmap region at the specified position
  drawHeatmapRegion(x, y, width, height, color) {
    const centerX = x * this.canvas.width;
    const centerY = y * this.canvas.height;
    const radiusX = width * this.canvas.width;
    const radiusY = height * this.canvas.height;
    
    // Create radial gradient
    const gradient = this.ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, Math.max(radiusX, radiusY)
    );
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    // Draw ellipse with gradient
    this.ctx.beginPath();
    this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
    this.ctx.fillStyle = gradient;
    this.ctx.fill();
  }
  
  // Draw angle visualizations based on exercise metrics
  drawAngleVisualizations(metrics) {
    if (!this.lastPoseData || !this.exerciseType || !metrics) return;
    
    const pose = this.lastPoseData.pose;
    if (!pose) return;
    
    // Get exercise-specific metrics
    const exerciseMetricsData = exerciseMetrics[this.exerciseType];
    if (!exerciseMetricsData) return;
    
    // Draw angles for key metrics
    if (exerciseMetricsData.metricImplementations) {
      Object.entries(exerciseMetricsData.metricImplementations).forEach(([metricKey, implementation]) => {
        if (implementation.measure && metrics.jointAngles && metrics.jointAngles[metricKey]) {
          // Get the angle value and ideal range
          const angle = metrics.jointAngles[metricKey];
          const measureResult = implementation.measure(pose);
          
          if (measureResult && measureResult.idealRange) {
            // Determine feedback severity
            const severity = determineFeedbackSeverity(angle, measureResult.idealRange);
            
            // Get color based on severity
            let color = this.colors.good;
            if (severity === "warning") color = this.colors.warning;
            if (severity === "error") color = this.colors.error;
            
            // Draw angle visualization based on the metric
            this.drawAngleVisualization(metricKey, angle, measureResult.idealRange, color, pose);
          }
        }
      });
    }
  }
  
  // Draw a specific angle visualization
  drawAngleVisualization(metricKey, angle, idealRange, color, pose) {
    // Different visualizations based on the metric type
    if (metricKey === "rightElbow" || metricKey === "leftElbow") {
      // Draw elbow angle
      const shoulderIndex = metricKey === "rightElbow" ? 12 : 11;
      const elbowIndex = metricKey === "rightElbow" ? 14 : 13;
      const wristIndex = metricKey === "rightElbow" ? 16 : 15;
      
      if (pose[shoulderIndex] && pose[elbowIndex] && pose[wristIndex]) {
        this.drawJointAngle(
          pose[shoulderIndex], 
          pose[elbowIndex], 
          pose[wristIndex], 
          angle, 
          idealRange, 
          color
        );
      }
    } else if (metricKey === "shoulderStability") {
      // Draw shoulder stability indicator
      if (pose[11] && pose[12]) {
        this.drawShoulderLevelness(pose[11], pose[12], angle, idealRange, color);
      }
    } else if (metricKey === "wristPosition") {
      // Draw wrist position indicator
      const elbowIndex = metricKey.includes("right") ? 14 : 13;
      const wristIndex = metricKey.includes("right") ? 16 : 15;
      
      if (pose[elbowIndex] && pose[wristIndex]) {
        this.drawWristAlignment(pose[elbowIndex], pose[wristIndex], angle, idealRange, color);
      }
    }
  }
  
  // Draw joint angle with ideal range indicator
  drawJointAngle(pointA, pointB, pointC, angle, idealRange, color) {
    const [minIdeal, maxIdeal] = idealRange;
    
    // Convert to canvas coordinates
    const ax = pointA.x * this.canvas.width;
    const ay = pointA.y * this.canvas.height;
    const bx = pointB.x * this.canvas.width;
    const by = pointB.y * this.canvas.height;
    const cx = pointC.x * this.canvas.width;
    const cy = pointC.y * this.canvas.height;
    
    // Draw angle arc
    this.ctx.save();
    this.ctx.beginPath();
    
    // Calculate vectors
    const v1x = ax - bx;
    const v1y = ay - by;
    const v2x = cx - bx;
    const v2y = cy - by;
    
    // Calculate angle between vectors
    const startAngle = Math.atan2(v1y, v1x);
    const endAngle = Math.atan2(v2y, v2x);
    
    // Draw arc
    const radius = 30;
    this.ctx.beginPath();
    this.ctx.arc(bx, by, radius, startAngle, endAngle, false);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 3;
    this.ctx.stroke();
    
    // Draw ideal range indicator
    this.ctx.beginPath();
    this.ctx.arc(bx, by, radius + 5, 0, 2 * Math.PI);
    this.ctx.strokeStyle = this.colors.guide;
    this.ctx.setLineDash([3, 3]);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    
    // Draw angle text
    this.ctx.font = '16px Arial';
    this.ctx.fillStyle = color;
    this.ctx.fillText(`${Math.round(angle)}°`, bx + radius + 5, by);
    
    // Draw ideal range text
    this.ctx.font = '12px Arial';
    this.ctx.fillStyle = this.colors.guide;
    this.ctx.fillText(`Ideal: ${minIdeal}°-${maxIdeal}°`, bx + radius + 5, by + 20);
    
    this.ctx.restore();
  }
  
  // Draw shoulder levelness indicator
  drawShoulderLevelness(leftShoulder, rightShoulder, difference, idealRange, color) {
    const leftX = leftShoulder.x * this.canvas.width;
    const leftY = leftShoulder.y * this.canvas.height;
    const rightX = rightShoulder.x * this.canvas.width;
    const rightY = rightShoulder.y * this.canvas.height;
    
    this.ctx.save();
    
    // Draw line connecting shoulders
    this.ctx.beginPath();
    this.ctx.moveTo(leftX, leftY);
    this.ctx.lineTo(rightX, rightY);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 3;
    this.ctx.stroke();
    
    // Draw horizontal reference line
    this.ctx.beginPath();
    this.ctx.moveTo(leftX, leftY);
    this.ctx.lineTo(rightX, leftY);
    this.ctx.strokeStyle = this.colors.guide;
    this.ctx.setLineDash([5, 5]);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    
    // Draw difference text
    const midX = (leftX + rightX) / 2;
    const midY = (leftY + rightY) / 2;
    this.ctx.font = '14px Arial';
    this.ctx.fillStyle = color;
    this.ctx.fillText(`Δ${Math.round(difference * 100)}%`, midX, midY - 10);
    
    this.ctx.restore();
  }
  
  // Draw wrist alignment indicator
  drawWristAlignment(elbow, wrist, alignment, idealRange, color) {
    const elbowX = elbow.x * this.canvas.width;
    const elbowY = elbow.y * this.canvas.height;
    const wristX = wrist.x * this.canvas.width;
    const wristY = wrist.y * this.canvas.height;
    
    this.ctx.save();
    
    // Draw line from elbow to wrist
    this.ctx.beginPath();
    this.ctx.moveTo(elbowX, elbowY);
    this.ctx.lineTo(wristX, wristY);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 3;
    this.ctx.stroke();
    
    // Draw vertical reference line
    this.ctx.beginPath();
    this.ctx.moveTo(elbowX, elbowY);
    this.ctx.lineTo(elbowX, wristY);
    this.ctx.strokeStyle = this.colors.guide;
    this.ctx.setLineDash([5, 5]);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    
    // Draw alignment text
    this.ctx.font = '14px Arial';
    this.ctx.fillStyle = color;
    this.ctx.fillText(`${Math.round(alignment * 100)}°`, (elbowX + wristX) / 2, (elbowY + wristY) / 2 - 10);
    
    this.ctx.restore();
  }
  
  // Draw feedback based on metrics
  drawMetricsFeedback(metrics) {
    if (!metrics || !this.exerciseType) return;
    
    const exerciseMetricsData = exerciseMetrics[this.exerciseType];
    if (!exerciseMetricsData) return;
    
    // Collect feedback messages
    const feedbackMessages = [];
    
    // Check each metric implementation
    if (exerciseMetricsData.metricImplementations) {
      Object.entries(exerciseMetricsData.metricImplementations).forEach(([metricKey, implementation]) => {
        if (metrics.jointAngles && metrics.jointAngles[metricKey]) {
          const angle = metrics.jointAngles[metricKey];
          const measureResult = implementation.measure && implementation.measure(this.lastPoseData.pose);
          
          if (measureResult && measureResult.idealRange && measureResult.feedbackText) {
            // Determine feedback severity
            const severity = determineFeedbackSeverity(angle, measureResult.idealRange);
            
            // Add feedback message based on severity
            if (severity === "error" && measureResult.feedbackText.error) {
              feedbackMessages.push({
                text: measureResult.feedbackText.error,
                severity: "error"
              });
            } else if (severity === "warning" && measureResult.feedbackText.warning) {
              feedbackMessages.push({
                text: measureResult.feedbackText.warning,
                severity: "warning"
              });
            } else if (severity === "good" && measureResult.feedbackText.good) {
              feedbackMessages.push({
                text: measureResult.feedbackText.good,
                severity: "good"
              });
            }
          }
        }
      });
    }
    
    // Display feedback messages
    if (feedbackMessages.length > 0) {
      this.drawFeedbackPanel(feedbackMessages);
    }
  }
  
  // Draw feedback panel
  drawFeedbackPanel(messages) {
    const x = this.canvas.width - 250;
    const y = 20;
    const width = 230;
    const lineHeight = 24;
    const padding = 10;
    
    // Calculate panel height based on number of messages
    const height = (messages.length * lineHeight) + (padding * 2);
    
    this.ctx.save();
    
    // Draw panel background
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(x, y, width, height);
    
    // Draw panel border
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x, y, width, height);
    
    // Draw title
    this.ctx.font = 'bold 16px Arial';
    this.ctx.fillStyle = 'white';
    this.ctx.fillText('Form Feedback', x + padding, y + padding + 16);
    
    // Draw messages
    this.ctx.font = '14px Arial';
    messages.forEach((message, index) => {
      // Set color based on severity
      if (message.severity === "good") {
        this.ctx.fillStyle = this.colors.good;
      } else if (message.severity === "warning") {
        this.ctx.fillStyle = this.colors.warning;
      } else {
        this.ctx.fillStyle = this.colors.error;
      }
      
      // Draw message
      this.ctx.fillText(
        message.text, 
        x + padding, 
        y + padding + 16 + lineHeight + (index * lineHeight)
      );
    });
    
    this.ctx.restore();
  }
  
  // Draw performance metrics visualization
  drawPerformanceMetrics(metrics) {
    // This would be implemented with a charting library in a real app
    // For now, we'll just draw a simple representation
    
    if (!metrics) return;
    
    const x = 20;
    const y = 20;
    const width = 200;
    const height = 100;
    
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    this.ctx.fillRect(x, y, width, height);
    
    // Draw metrics
    this.ctx.font = '14px Arial';
    this.ctx.fillStyle = 'white';
    this.ctx.fillText(`Form Quality: ${metrics.formQuality || 'N/A'}`, x + 10, y + 20);
    this.ctx.fillText(`Rep Count: ${metrics.repCount || 0}`, x + 10, y + 40);
    
    if (metrics.symmetry && metrics.symmetry.leftRightBalance) {
      this.ctx.fillText(`Balance: ${metrics.symmetry.leftRightBalance}`, x + 10, y + 60);
    }
    
    if (metrics.movement && metrics.movement.smoothness) {
      this.ctx.fillText(`Movement: ${metrics.movement.smoothness}`, x + 10, y + 80);
    }
    
    this.ctx.restore();
  }
  
  // Main render method to be called in the animation loop
  render(metrics) {
    // Only proceed if we have pose data
    if (!this.lastPoseData) return;
    
    // Draw various visualization elements
    this.drawFormCorrections();
    this.drawMovementGuides();
    this.drawMuscleHeatmap();
    
    if (metrics) {
      // Draw new angle visualizations and feedback
      this.drawAngleVisualizations(metrics);
      this.drawMetricsFeedback(metrics);
      
      // Draw performance metrics
      this.drawPerformanceMetrics(metrics);
      
      // Set isActive to true when rendering with metrics
      this.isActive = true;
    } else {
      // If no metrics provided, set isActive to false
      this.isActive = false;
    }
  }
}

// Export the FormVisualizer class
export default FormVisualizer;
