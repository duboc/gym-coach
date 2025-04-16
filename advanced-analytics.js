// Advanced Analytics module for enhanced data collection and analysis
class AdvancedAnalytics {
  constructor() {
    this.exerciseData = {};
    this.sessionData = {
      startTime: null,
      endTime: null,
      exerciseName: null,
      reps: [],
      formQuality: [],
      repDurations: [],
      restPeriods: [],
      jointAngles: {},
      velocities: {},
      formConsistency: 0
    };
  }
  
  // Start a new exercise session
  startSession(exerciseName) {
    this.sessionData = {
      startTime: Date.now(),
      endTime: null,
      exerciseName: exerciseName,
      reps: [],
      formQuality: [],
      repDurations: [],
      restPeriods: [],
      jointAngles: {},
      velocities: {},
      formConsistency: 0
    };
    
    console.log(`Advanced analytics: Started tracking session for ${exerciseName}`);
    
    // Create or reset exercise data structure if needed
    if (!this.exerciseData[exerciseName]) {
      this.exerciseData[exerciseName] = {
        sessions: [],
        totalReps: 0,
        averageFormQuality: 0,
        formImprovementTrend: 0,
        bestSession: null
      };
    }
  }
  
  // End the current exercise session
  endSession() {
    if (!this.sessionData.startTime) return;
    
    this.sessionData.endTime = Date.now();
    const sessionDuration = (this.sessionData.endTime - this.sessionData.startTime) / 1000;
    
    // Calculate session metrics
    const avgFormQuality = this.sessionData.formQuality.reduce((sum, val) => sum + val, 0) / 
                          (this.sessionData.formQuality.length || 1);
    
    const sessionSummary = {
      date: new Date(),
      duration: sessionDuration,
      exerciseName: this.sessionData.exerciseName,
      repCount: this.sessionData.reps.length,
      avgFormQuality: avgFormQuality,
      formConsistency: this.sessionData.formConsistency,
      avgRepDuration: this.sessionData.repDurations.reduce((sum, val) => sum + val, 0) / 
                     (this.sessionData.repDurations.length || 1),
      jointAngles: this.calculateAverageJointAngles()
    };
    
    // Add to exercise history
    if (this.exerciseData[this.sessionData.exerciseName]) {
      this.exerciseData[this.sessionData.exerciseName].sessions.push(sessionSummary);
      this.exerciseData[this.sessionData.exerciseName].totalReps += sessionSummary.repCount;
      
      // Update average form quality
      const sessions = this.exerciseData[this.sessionData.exerciseName].sessions;
      const totalQuality = sessions.reduce((sum, session) => sum + session.avgFormQuality, 0);
      this.exerciseData[this.sessionData.exerciseName].averageFormQuality = totalQuality / sessions.length;
      
      // Calculate form improvement trend
      if (sessions.length >= 2) {
        const firstSession = sessions[0].avgFormQuality;
        const lastSession = sessions[sessions.length - 1].avgFormQuality;
        this.exerciseData[this.sessionData.exerciseName].formImprovementTrend = lastSession - firstSession;
      }
      
      // Determine best session
      if (!this.exerciseData[this.sessionData.exerciseName].bestSession || 
          this.exerciseData[this.sessionData.exerciseName].bestSession.avgFormQuality < avgFormQuality) {
        this.exerciseData[this.sessionData.exerciseName].bestSession = sessionSummary;
      }
    }
    
    // Save to localStorage
    this.saveExerciseData();
    
    console.log(`Advanced analytics: Ended tracking session for ${this.sessionData.exerciseName}`);
    console.log('Session summary:', sessionSummary);
    
    return sessionSummary;
  }
  
  // Record data for a completed rep
  recordRep(repData) {
    if (!this.sessionData.startTime || !repData) return;
    
    // Extract relevant data
    const repNumber = this.sessionData.reps.length + 1;
    const timestamp = Date.now();
    const formQuality = repData.formQuality === 'good' ? 1 : 
                       (repData.formQuality === 'fair' ? 0.5 : 0);
    
    // Calculate rest period if not the first rep
    let restPeriod = 0;
    if (this.sessionData.reps.length > 0) {
      const lastRep = this.sessionData.reps[this.sessionData.reps.length - 1];
      restPeriod = (timestamp - lastRep.endTime) / 1000;
    }
    
    // Create rep record
    const rep = {
      number: repNumber,
      startTime: repData.startTime || timestamp - 2000, // Estimate if not provided
      endTime: timestamp,
      duration: repData.duration || 2, // Estimate if not provided
      formQuality: formQuality,
      formIssues: repData.formIssues || [],
      jointAngles: repData.jointAngles || {},
      velocity: repData.movement?.velocity || {},
      smoothness: repData.movement?.smoothness || 'unknown'
    };
    
    // Add to session data
    this.sessionData.reps.push(rep);
    this.sessionData.formQuality.push(formQuality);
    this.sessionData.repDurations.push(rep.duration);
    
    if (restPeriod > 0) {
      this.sessionData.restPeriods.push(restPeriod);
    }
    
    // Track joint angles
    Object.entries(rep.jointAngles).forEach(([joint, angle]) => {
      if (!this.sessionData.jointAngles[joint]) {
        this.sessionData.jointAngles[joint] = [];
      }
      this.sessionData.jointAngles[joint].push(angle);
    });
    
    // Track velocities
    Object.entries(rep.velocity).forEach(([joint, velocity]) => {
      if (!this.sessionData.velocities[joint]) {
        this.sessionData.velocities[joint] = [];
      }
      this.sessionData.velocities[joint].push(velocity);
    });
    
    // Calculate form consistency
    this.calculateFormConsistency();
    
    console.log(`Advanced analytics: Recorded rep #${repNumber}`);
    
    return rep;
  }
  
  // Calculate form consistency across reps
  calculateFormConsistency() {
    if (this.sessionData.reps.length < 2) {
      this.sessionData.formConsistency = 1; // Perfect consistency with only one rep
      return;
    }
    
    // Calculate consistency based on joint angles
    const jointConsistencies = [];
    
    Object.entries(this.sessionData.jointAngles).forEach(([joint, angles]) => {
      if (angles.length < 2) return;
      
      // Calculate standard deviation
      const mean = angles.reduce((sum, val) => sum + val, 0) / angles.length;
      const squaredDiffs = angles.map(angle => Math.pow(angle - mean, 2));
      const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / angles.length;
      const stdDev = Math.sqrt(variance);
      
      // Convert to a consistency score (0-1)
      // Lower standard deviation = higher consistency
      const maxExpectedDev = 15; // degrees
      const consistency = Math.max(0, Math.min(1, 1 - (stdDev / maxExpectedDev)));
      
      jointConsistencies.push(consistency);
    });
    
    // Average all joint consistencies
    if (jointConsistencies.length > 0) {
      this.sessionData.formConsistency = jointConsistencies.reduce((sum, val) => sum + val, 0) / 
                                        jointConsistencies.length;
    }
  }
  
  // Calculate average joint angles for the session
  calculateAverageJointAngles() {
    const avgAngles = {};
    
    Object.entries(this.sessionData.jointAngles).forEach(([joint, angles]) => {
      if (angles.length > 0) {
        avgAngles[joint] = angles.reduce((sum, val) => sum + val, 0) / angles.length;
      }
    });
    
    return avgAngles;
  }
  
  // Save exercise data to localStorage
  saveExerciseData() {
    try {
      localStorage.setItem('advanced-exercise-data', JSON.stringify(this.exerciseData));
    } catch (e) {
      console.warn('Failed to save exercise data to localStorage:', e);
    }
  }
  
  // Load exercise data from localStorage
  loadExerciseData() {
    try {
      const storedData = localStorage.getItem('advanced-exercise-data');
      if (storedData) {
        this.exerciseData = JSON.parse(storedData);
        console.log('Loaded exercise data from localStorage');
      }
    } catch (e) {
      console.warn('Failed to load exercise data from localStorage:', e);
    }
  }
  
  
  // Generate a comprehensive progress report
  generateProgressReport() {
    if (!this.sessionData.exerciseName) return null;
    
    const exerciseData = this.exerciseData[this.sessionData.exerciseName];
    if (!exerciseData || !exerciseData.sessions || exerciseData.sessions.length === 0) {
      return {
        exerciseName: this.sessionData.exerciseName,
        totalSessions: 0,
        message: "Not enough historical data to generate a progress report."
      };
    }
    
    // Calculate progress metrics
    const totalSessions = exerciseData.sessions.length;
    const totalReps = exerciseData.totalReps;
    const averageFormQuality = exerciseData.averageFormQuality;
    const formImprovementTrend = exerciseData.formImprovementTrend;
    
    // Calculate average reps per session
    const avgRepsPerSession = totalReps / totalSessions;
    
    // Calculate consistency across sessions
    const formQualityValues = exerciseData.sessions.map(session => session.avgFormQuality);
    const formQualityStdDev = this.calculateStandardDeviation(formQualityValues);
    const consistencyScore = Math.max(0, Math.min(1, 1 - (formQualityStdDev / 0.5)));
    
    // Determine areas of improvement
    const latestSession = exerciseData.sessions[exerciseData.sessions.length - 1];
    const areasOfImprovement = [];
    
    if (formImprovementTrend <= 0) {
      areasOfImprovement.push("Form quality");
    }
    
    if (exerciseData.sessions.length >= 2) {
      const prevSession = exerciseData.sessions[exerciseData.sessions.length - 2];
      if (latestSession.repCount <= prevSession.repCount) {
        areasOfImprovement.push("Rep count");
      }
      if (latestSession.formConsistency <= prevSession.formConsistency) {
        areasOfImprovement.push("Movement consistency");
      }
    }
    
    // Generate recommendations
    const recommendations = [];
    
    if (formImprovementTrend < 0) {
      recommendations.push("Focus on maintaining proper form throughout each rep.");
    } else if (formImprovementTrend > 0.1) {
      recommendations.push("Your form is improving well. Consider increasing weight or difficulty.");
    }
    
    if (consistencyScore < 0.7) {
      recommendations.push("Work on maintaining consistent form across all sessions.");
    }
    
    if (areasOfImprovement.includes("Rep count")) {
      recommendations.push("Gradually increase rep count to build endurance.");
    }
    
    // Create the report
    return {
      exerciseName: this.sessionData.exerciseName,
      totalSessions: totalSessions,
      totalReps: totalReps,
      averageFormQuality: averageFormQuality,
      formImprovementTrend: formImprovementTrend,
      avgRepsPerSession: avgRepsPerSession,
      consistencyScore: consistencyScore,
      areasOfImprovement: areasOfImprovement.length > 0 ? areasOfImprovement : ["None identified"],
      recommendations: recommendations.length > 0 ? recommendations : ["Continue with your current program."],
      bestSession: exerciseData.bestSession ? {
        date: new Date(exerciseData.bestSession.date).toLocaleDateString(),
        formQuality: exerciseData.bestSession.avgFormQuality,
        repCount: exerciseData.bestSession.repCount
      } : null
    };
  }
  
  // Helper function to calculate standard deviation
  calculateStandardDeviation(values) {
    if (!values || values.length === 0) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    
    return Math.sqrt(variance);
  }
}

// Export the AdvancedAnalytics class
export default AdvancedAnalytics;
