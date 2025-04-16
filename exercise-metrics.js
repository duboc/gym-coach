// Exercise Metrics Documentation and Implementation
// This file defines the metrics used to analyze exercise form and provide feedback

/**
 * Metrics Priority Levels:
 * P0 - Critical for safety and effectiveness
 * P1 - Important for optimal performance
 * P2 - Beneficial for advanced form refinement
 */

// Common angle calculation function
function calculateAngle(pointA, pointB, pointC) {
  const radians = Math.atan2(pointC.y - pointB.y, pointC.x - pointB.x) - 
                  Math.atan2(pointA.y - pointB.y, pointA.x - pointB.x);
  let angle = Math.abs(radians * 180.0 / Math.PI);
  
  if (angle > 180.0) {
    angle = 360 - angle;
  }
  
  return angle;
}

// Enhanced smoothing function for angle measurements with larger window and outlier rejection
function smoothAngle(newAngle, previousAngles, weight = 0.2) {
  if (!previousAngles || previousAngles.length === 0) return newAngle;
  
  // Sort angles to identify outliers
  const sortedAngles = [...previousAngles].sort((a, b) => a - b);
  
  // Remove potential outliers (top and bottom 10% if we have enough samples)
  let filteredAngles = previousAngles;
  if (previousAngles.length >= 10) {
    const cutoff = Math.floor(previousAngles.length * 0.1);
    filteredAngles = sortedAngles.slice(cutoff, sortedAngles.length - cutoff);
  }
  
  // Calculate average of filtered angles
  const avgAngle = filteredAngles.reduce((sum, angle) => sum + angle, 0) / filteredAngles.length;
  
  // Apply exponential smoothing with lower weight for new values to reduce jitter
  return newAngle * weight + avgAngle * (1 - weight);
}

// Enhanced feedback severity determination with hysteresis to prevent flickering
function determineFeedbackSeverity(currentValue, idealRange, warningThreshold = 10, previousSeverity = null) {
  const [minIdeal, maxIdeal] = idealRange;
  const minWarningThreshold = minIdeal - warningThreshold;
  const maxWarningThreshold = maxIdeal + warningThreshold;
  
  // Add hysteresis buffer to prevent rapid switching between states
  const hysteresisBuffer = 3;
  
  let newSeverity;
  if (currentValue >= minIdeal && currentValue <= maxIdeal) {
    newSeverity = "good"; // Green
  } else if (currentValue >= minWarningThreshold && currentValue <= maxWarningThreshold) {
    newSeverity = "warning"; // Yellow
  } else {
    newSeverity = "error"; // Red
  }
  
  // Apply hysteresis if we have a previous severity
  if (previousSeverity) {
    // If we're at the boundary between good and warning
    if (previousSeverity === "good" && newSeverity === "warning") {
      // Stay in "good" if we're just barely into warning territory
      if (currentValue >= minIdeal - hysteresisBuffer && currentValue < minIdeal) {
        return "good";
      }
      if (currentValue > maxIdeal && currentValue <= maxIdeal + hysteresisBuffer) {
        return "good";
      }
    }
    // If we're at the boundary between warning and error
    else if (previousSeverity === "warning" && newSeverity === "error") {
      // Stay in "warning" if we're just barely into error territory
      if (currentValue >= minWarningThreshold - hysteresisBuffer && currentValue < minWarningThreshold) {
        return "warning";
      }
      if (currentValue > maxWarningThreshold && currentValue <= maxWarningThreshold + hysteresisBuffer) {
        return "warning";
      }
    }
    // Similar logic for transitions from worse to better states
    else if (previousSeverity === "warning" && newSeverity === "good") {
      // Require a bit more improvement before switching to "good"
      if (currentValue >= minIdeal && currentValue <= minIdeal + hysteresisBuffer) {
        return "warning";
      }
      if (currentValue >= maxIdeal - hysteresisBuffer && currentValue <= maxIdeal) {
        return "warning";
      }
    }
    else if (previousSeverity === "error" && newSeverity === "warning") {
      // Require a bit more improvement before switching to "warning"
      if (currentValue >= minWarningThreshold && currentValue <= minWarningThreshold + hysteresisBuffer) {
        return "error";
      }
      if (currentValue >= maxWarningThreshold - hysteresisBuffer && currentValue <= maxWarningThreshold) {
        return "error";
      }
    }
  }
  
  return newSeverity;
}

// Base metrics applicable to all exercises
const baseMetrics = {
  setupAndStance: {
    priority: "P0",
    description: "Initial body positioning, foot placement, core engagement, and neutral spine established before movement.",
    idealView: "Side (Preferred) or Front",
    feedbackText: {
      good: "Good starting position.",
      warning: "Check your starting position.",
      error: "Incorrect starting position. Reset and try again."
    }
  },
  spinalAlignment: {
    priority: "P0",
    description: "Maintaining a neutral spine (avoiding excessive arching or rounding) throughout the entire movement.",
    idealView: "Side (Required)",
    feedbackText: {
      good: "Good spine alignment.",
      warning: "Watch your back position.",
      error: "Fix your spine position - avoid arching or rounding."
    }
  },
  jointAlignment: {
    priority: "P1",
    description: "Proper alignment/tracking of key joints relevant to the view (e.g., knees over ankles from side, knee cave-in from front).",
    idealView: "Side or Front (Choose best for exercise)",
    feedbackText: {
      good: "Good joint alignment.",
      warning: "Check your joint alignment.",
      error: "Incorrect joint alignment. Adjust your position."
    }
  },
  rangeOfMotion: {
    priority: "P1",
    description: "Achieving the appropriate depth or extent of movement for the targeted muscle and exercise goals, without compromising form.",
    idealView: "Side (Preferred for sagittal plane) or Front (for frontal plane)",
    feedbackText: {
      good: "Good range of motion.",
      warning: "Try to achieve full range of motion.",
      error: "Incomplete range of motion. Extend the movement further."
    }
  },
  movementPath: {
    priority: "P1",
    description: "Smooth, controlled, and intended path of the dumbbells/body segments within the camera's 2D plane.",
    idealView: "Side or Front",
    feedbackText: {
      good: "Smooth movement path.",
      warning: "Keep your movement path consistent.",
      error: "Inconsistent movement path. Follow a smooth trajectory."
    }
  },
  tempoAndControl: {
    priority: "P1",
    description: "Speed of the concentric/eccentric phases. Control during lowering.",
    idealView: "Side (Preferred)",
    feedbackText: {
      good: "Good tempo and control.",
      warning: "Control your movement speed.",
      error: "Too fast or uncontrolled. Slow down and maintain control."
    }
  },
  shoulderStability: {
    priority: "P1",
    description: "Maintaining appropriate shoulder blade position; avoiding excessive elevation.",
    idealView: "Side or Front (Limited Assessment)",
    feedbackText: {
      good: "Good shoulder stability.",
      warning: "Watch your shoulder position.",
      error: "Shoulders rising or unstable. Keep shoulders down and back."
    }
  },
  wristPosition: {
    priority: "P2",
    description: "Keeping wrists neutral or stable, avoiding excessive flexion/extension.",
    idealView: "Side or Front",
    feedbackText: {
      good: "Good wrist position.",
      warning: "Check your wrist alignment.",
      error: "Wrists are bent. Keep wrists straight and aligned."
    }
  },
  repCompletionAndConsistency: {
    priority: "P1",
    description: "Successfully completing reps with consistent form based on the visible metrics.",
    idealView: "Side (Preferred) or Front",
    feedbackText: {
      good: "Consistent rep performance.",
      warning: "Try to maintain consistency between reps.",
      error: "Inconsistent reps. Focus on maintaining form throughout the set."
    }
  },
  symmetry: {
    priority: "P2",
    description: "Balanced movement between left and right sides.",
    idealView: "Front (Required)",
    feedbackText: {
      good: "Good symmetry between sides.",
      warning: "Try to keep movement balanced between sides.",
      error: "Uneven movement. Balance effort between left and right sides."
    }
  }
};

// Exercise-specific metrics and implementations
const exerciseMetrics = {
  // 1. Dumbbell Bicep Curls
  "Dumbbell Bicep Curls": {
    primaryView: "Side",
    keyMetrics: ["jointAlignment", "rangeOfMotion", "tempoAndControl", "wristPosition", "shoulderStability", "symmetry"],
    metricImplementations: {
      // Elbow position relative to torso
      jointAlignment: {
        measure: function(pose) {
          // Check if elbows are fixed relative to shoulders (both arms)
          if (!pose[11] || !pose[12] || !pose[13] || !pose[14]) return null; // Shoulders and elbows
          
          // Calculate horizontal displacement for both arms
          const leftShoulderX = pose[11].x;
          const leftElbowX = pose[13].x;
          const rightShoulderX = pose[12].x;
          const rightElbowX = pose[14].x;
          
          const leftDisplacement = Math.abs(leftElbowX - leftShoulderX);
          const rightDisplacement = Math.abs(rightElbowX - rightShoulderX);
          
          // Use the average displacement
          const avgDisplacement = (leftDisplacement + rightDisplacement) / 2;
          
          // Store individual displacements for symmetry check
          const result = {
            value: avgDisplacement,
            idealRange: [0, 0.05], // Normalized coordinates, minimal movement
            leftDisplacement: leftDisplacement,
            rightDisplacement: rightDisplacement,
            feedbackText: {
              good: "Elbows are stable at your sides.",
              warning: "Keep your elbows closer to your body.",
              error: "Elbows moving too much. Keep them fixed at your sides."
            }
          };
          
          // Add specific feedback for which arm needs correction
          if (leftDisplacement > 0.05 && rightDisplacement <= 0.05) {
            result.feedbackText.warning = "Left elbow drifting forward. Keep it fixed at your side.";
            result.feedbackText.error = "Left elbow moving too much. Keep it fixed at your side.";
          } else if (rightDisplacement > 0.05 && leftDisplacement <= 0.05) {
            result.feedbackText.warning = "Right elbow drifting forward. Keep it fixed at your side.";
            result.feedbackText.error = "Right elbow moving too much. Keep it fixed at your side.";
          }
          
          return result;
        }
      },
      // Elbow angle from extension to flexion (both arms)
      rangeOfMotion: {
        measure: function(pose) {
          // Calculate elbow angles for both arms
          if (!pose[11] || !pose[12] || !pose[13] || !pose[14] || !pose[15] || !pose[16]) return null; // Shoulders, elbows, wrists
          
          const leftAngle = calculateAngle(
            {x: pose[11].x, y: pose[11].y}, // Left shoulder
            {x: pose[13].x, y: pose[13].y}, // Left elbow
            {x: pose[15].x, y: pose[15].y}  // Left wrist
          );
          
          const rightAngle = calculateAngle(
            {x: pose[12].x, y: pose[12].y}, // Right shoulder
            {x: pose[14].x, y: pose[14].y}, // Right elbow
            {x: pose[16].x, y: pose[16].y}  // Right wrist
          );
          
          // Use the average angle for primary feedback
          const avgAngle = (leftAngle + rightAngle) / 2;
          
          // Store individual angles for symmetry check
          const result = {
            value: avgAngle,
            idealRange: [40, 160], // Full range of motion
            leftAngle: leftAngle,
            rightAngle: rightAngle,
            feedbackText: {
              good: "Good elbow range of motion.",
              warning: "Try to achieve fuller range of motion.",
              error: "Incomplete range of motion. Extend arms more at bottom and curl higher at top."
            }
          };
          
          // Add specific feedback for which arm needs correction
          if (leftAngle > 160 && rightAngle < 160) {
            result.feedbackText.warning = "Left arm not curling high enough. Bring the weight closer to your shoulder.";
          } else if (rightAngle > 160 && leftAngle < 160) {
            result.feedbackText.warning = "Right arm not curling high enough. Bring the weight closer to your shoulder.";
          } else if (leftAngle > 60 && rightAngle < 60) {
            result.feedbackText.warning = "Left arm not extending fully. Straighten your arm more at the bottom.";
          } else if (rightAngle > 60 && leftAngle < 60) {
            result.feedbackText.warning = "Right arm not extending fully. Straighten your arm more at the bottom.";
          }
          
          return result;
        }
      },
      // Wrist position (both wrists)
      wristPosition: {
        measure: function(pose) {
          // Check wrist alignment for both arms
          if (!pose[13] || !pose[14] || !pose[15] || !pose[16]) return null; // Elbows and wrists
          
          // Calculate angle between forearm and hand for both wrists
          const leftWristAngle = Math.abs(90 - calculateAngle(
            {x: pose[13].x, y: pose[13].y}, // Left elbow
            {x: pose[15].x, y: pose[15].y}, // Left wrist
            {x: pose[15].x + 0.1, y: pose[15].y} // Projected point to represent left hand
          ));
          
          const rightWristAngle = Math.abs(90 - calculateAngle(
            {x: pose[14].x, y: pose[14].y}, // Right elbow
            {x: pose[16].x, y: pose[16].y}, // Right wrist
            {x: pose[16].x + 0.1, y: pose[16].y} // Projected point to represent right hand
          ));
          
          // Use the average angle for primary feedback
          const avgAngle = (leftWristAngle + rightWristAngle) / 2;
          
          // Store individual angles for symmetry check
          const result = {
            value: avgAngle,
            idealRange: [0, 15], // Minimal deviation from neutral
            leftWristAngle: leftWristAngle,
            rightWristAngle: rightWristAngle,
            feedbackText: {
              good: "Wrists are straight and stable.",
              warning: "Try to keep your wrists straighter.",
              error: "Wrists are bent. Maintain neutral wrist position."
            }
          };
          
          // Add specific feedback for which wrist needs correction
          if (leftWristAngle > 15 && rightWristAngle <= 15) {
            result.feedbackText.warning = "Left wrist is bending. Keep it straight and aligned with your forearm.";
            result.feedbackText.error = "Left wrist is too bent. Straighten it to align with your forearm.";
          } else if (rightWristAngle > 15 && leftWristAngle <= 15) {
            result.feedbackText.warning = "Right wrist is bending. Keep it straight and aligned with your forearm.";
            result.feedbackText.error = "Right wrist is too bent. Straighten it to align with your forearm.";
          }
          
          return result;
        }
      },
      // Tempo and control (both arms)
      tempoAndControl: {
        measure: function(pose, previousPose) {
          if (!pose[15] || !pose[16] || !previousPose || !previousPose[15] || !previousPose[16]) return null; // Wrists
          
          // Calculate vertical velocity of both wrists
          const leftCurrentY = pose[15].y;
          const leftPreviousY = previousPose[15].y;
          const rightCurrentY = pose[16].y;
          const rightPreviousY = previousPose[16].y;
          
          const leftVelocity = Math.abs(leftCurrentY - leftPreviousY);
          const rightVelocity = Math.abs(rightCurrentY - rightPreviousY);
          
          // Use the average velocity for primary feedback
          const avgVelocity = (leftVelocity + rightVelocity) / 2;
          
          // Determine if we're in the lowering phase (eccentric)
          const isLowering = (leftCurrentY > leftPreviousY) || (rightCurrentY > rightPreviousY);
          
          // Adjust ideal range based on phase (slower for eccentric/lowering)
          const idealRange = isLowering ? [0, 0.01] : [0, 0.015];
          
          return {
            value: avgVelocity,
            idealRange: idealRange,
            isLowering: isLowering,
            feedbackText: {
              good: isLowering ? "Good controlled lowering tempo." : "Good controlled curling tempo.",
              warning: isLowering ? "Slow down the lowering phase for better control." : "Control your curling speed.",
              error: isLowering ? "Lowering too fast. Slow down for better muscle engagement." : "Movement too fast. Control the weight throughout the curl."
            }
          };
        }
      },
      // Shoulder stability (avoid shoulder elevation)
      shoulderStability: {
        measure: function(pose) {
          // Check for shoulder elevation
          if (!pose[11] || !pose[12] || !pose[23] || !pose[24]) return null; // Shoulders and hips
          
          // Calculate shoulder height relative to baseline
          const shoulderHeight = (pose[11].y + pose[12].y) / 2;
          const hipHeight = (pose[23].y + pose[24].y) / 2;
          const shoulderToHipRatio = (hipHeight - shoulderHeight) / hipHeight;
          
          // Calculate individual shoulder heights for asymmetry detection
          const leftShoulderToHipRatio = (hipHeight - pose[11].y) / hipHeight;
          const rightShoulderToHipRatio = (hipHeight - pose[12].y) / hipHeight;
          
          return {
            value: shoulderToHipRatio,
            idealRange: [0.25, 0.35], // Typical ratio for neutral shoulders
            leftRatio: leftShoulderToHipRatio,
            rightRatio: rightShoulderToHipRatio,
            feedbackText: {
              good: "Shoulders are down and relaxed.",
              warning: "Keep your shoulders down away from your ears.",
              error: "Shoulders rising during curl. Keep them pulled down and back."
            }
          };
        }
      },
      // Symmetry between left and right arms
      symmetry: {
        measure: function(pose, previousPose, metrics) {
          // This metric depends on other metrics being calculated first
          if (!metrics || !metrics.rangeOfMotion) return null;
          
          // Extract angle data from other metrics
          const leftElbowAngle = metrics.rangeOfMotion.leftAngle;
          const rightElbowAngle = metrics.rangeOfMotion.rightAngle;
          
          // Calculate angle difference between arms
          const angleDifference = Math.abs(leftElbowAngle - rightElbowAngle);
          
          return {
            value: angleDifference,
            idealRange: [0, 10], // Minimal angle difference
            feedbackText: {
              good: "Good symmetry between arms.",
              warning: "Try to keep both arms moving at the same pace.",
              error: "Uneven arm movement. Balance effort between left and right arms."
            }
          };
        }
      }
    },
    repCountingStrategy: {
      // Enhanced state machine for bicep curl rep counting
      states: ["waiting", "down", "up", "partial_up", "partial_down"],
      transitions: {
        waiting: [
          {
            to: "down",
            condition: (metrics) => {
              // More lenient condition to transition from waiting to down
              // Check if we have any angle data in the metrics
              if (metrics.jointAngles) {
                // Try to use rangeOfMotion first (preferred)
                if (metrics.rangeOfMotion && metrics.rangeOfMotion.value > 130) {
                  return true;
                }
                
                // Fallback to individual elbow angles if available
                if (metrics.jointAngles.rightElbow && metrics.jointAngles.rightElbow > 130) {
                  return true;
                }
                
                if (metrics.jointAngles.leftElbow && metrics.jointAngles.leftElbow > 130) {
                  return true;
                }
              }
              return false;
            }
          },
          {
            to: "up",
            condition: (metrics) => {
              // Also allow starting in the "up" position if arms are bent
              if (metrics.jointAngles) {
                // Try to use rangeOfMotion first (preferred)
                if (metrics.rangeOfMotion && metrics.rangeOfMotion.value < 80) {
                  return true;
                }
                
                // Fallback to individual elbow angles if available
                if (metrics.jointAngles.rightElbow && metrics.jointAngles.rightElbow < 80) {
                  return true;
                }
                
                if (metrics.jointAngles.leftElbow && metrics.jointAngles.leftElbow < 80) {
                  return true;
                }
              }
              return false;
            }
          }
        ],
        down: [
          {
            to: "up",
            condition: (metrics) => {
              // More lenient condition for transitioning to up state
              if (metrics.jointAngles) {
                // Try to use rangeOfMotion first (preferred)
                if (metrics.rangeOfMotion && metrics.rangeOfMotion.value < 80) {
                  return true;
                }
                
                // Fallback to individual elbow angles if available
                if (metrics.jointAngles.rightElbow && metrics.jointAngles.rightElbow < 80) {
                  return true;
                }
                
                if (metrics.jointAngles.leftElbow && metrics.jointAngles.leftElbow < 80) {
                  return true;
                }
              }
              return false;
            }
          },
          {
            to: "partial_up",
            condition: (metrics) => {
              // More lenient condition for partial up
              if (metrics.jointAngles) {
                // Try to use rangeOfMotion first (preferred)
                if (metrics.rangeOfMotion && metrics.rangeOfMotion.value < 110 && metrics.rangeOfMotion.value >= 80) {
                  return true;
                }
                
                // Fallback to individual elbow angles
                const rightAngle = metrics.jointAngles.rightElbow;
                const leftAngle = metrics.jointAngles.leftElbow;
                
                if (rightAngle && rightAngle < 110 && rightAngle >= 80) {
                  return true;
                }
                
                if (leftAngle && leftAngle < 110 && leftAngle >= 80) {
                  return true;
                }
              }
              return false;
            }
          }
        ],
        up: [
          {
            to: "down",
            condition: (metrics) => {
              // More lenient condition for transitioning to down state
              if (metrics.jointAngles) {
                // Try to use rangeOfMotion first (preferred)
                if (metrics.rangeOfMotion && metrics.rangeOfMotion.value > 130) {
                  return true;
                }
                
                // Fallback to individual elbow angles if available
                if (metrics.jointAngles.rightElbow && metrics.jointAngles.rightElbow > 130) {
                  return true;
                }
                
                if (metrics.jointAngles.leftElbow && metrics.jointAngles.leftElbow > 130) {
                  return true;
                }
              }
              return false;
            }
          },
          {
            to: "partial_down",
            condition: (metrics) => {
              // More lenient condition for partial down
              if (metrics.jointAngles) {
                // Try to use rangeOfMotion first (preferred)
                if (metrics.rangeOfMotion && metrics.rangeOfMotion.value > 110 && metrics.rangeOfMotion.value <= 130) {
                  return true;
                }
                
                // Fallback to individual elbow angles
                const rightAngle = metrics.jointAngles.rightElbow;
                const leftAngle = metrics.jointAngles.leftElbow;
                
                if (rightAngle && rightAngle > 110 && rightAngle <= 130) {
                  return true;
                }
                
                if (leftAngle && leftAngle > 110 && leftAngle <= 130) {
                  return true;
                }
              }
              return false;
            }
          }
        ],
        partial_up: [
          {
            to: "down",
            condition: (metrics) => {
              if (metrics.jointAngles) {
                if (metrics.rangeOfMotion && metrics.rangeOfMotion.value > 130) {
                  return true;
                }
                
                if (metrics.jointAngles.rightElbow && metrics.jointAngles.rightElbow > 130) {
                  return true;
                }
                
                if (metrics.jointAngles.leftElbow && metrics.jointAngles.leftElbow > 130) {
                  return true;
                }
              }
              return false;
            }
          },
          {
            to: "up",
            condition: (metrics) => {
              if (metrics.jointAngles) {
                if (metrics.rangeOfMotion && metrics.rangeOfMotion.value < 80) {
                  return true;
                }
                
                if (metrics.jointAngles.rightElbow && metrics.jointAngles.rightElbow < 80) {
                  return true;
                }
                
                if (metrics.jointAngles.leftElbow && metrics.jointAngles.leftElbow < 80) {
                  return true;
                }
              }
              return false;
            }
          }
        ],
        partial_down: [
          {
            to: "up",
            condition: (metrics) => {
              if (metrics.jointAngles) {
                if (metrics.rangeOfMotion && metrics.rangeOfMotion.value < 80) {
                  return true;
                }
                
                if (metrics.jointAngles.rightElbow && metrics.jointAngles.rightElbow < 80) {
                  return true;
                }
                
                if (metrics.jointAngles.leftElbow && metrics.jointAngles.leftElbow < 80) {
                  return true;
                }
              }
              return false;
            }
          },
          {
            to: "down",
            condition: (metrics) => {
              if (metrics.jointAngles) {
                if (metrics.rangeOfMotion && metrics.rangeOfMotion.value > 130) {
                  return true;
                }
                
                if (metrics.jointAngles.rightElbow && metrics.jointAngles.rightElbow > 130) {
                  return true;
                }
                
                if (metrics.jointAngles.leftElbow && metrics.jointAngles.leftElbow > 130) {
                  return true;
                }
              }
              return false;
            }
          }
        ]
      },
      countOn: "up-to-down", // Full rep
      partialCountOn: "partial_up-to-down", // Count partial reps as 0.5
      getRepQuality: function(fromState, toState) {
        if (fromState === "up" && toState === "down") return 1.0; // Full rep
        if (fromState === "partial_up" && toState === "down") return 0.5; // Partial rep
        return 0; // Not a counted rep
      }
    },
    formGuidance: [
      "Keep your elbows fixed at your sides throughout the movement",
      "Maintain a straight wrist position - avoid flexing or extending your wrists",
      "Fully extend your arms at the bottom of the movement for full range of motion",
      "Curl the weights all the way up to your shoulders",
      "Control the weight on the way down - this is where muscle growth happens",
      "Keep your shoulders down and back - don't shrug as you curl",
      "Maintain equal tempo and range of motion with both arms",
      "Exhale as you curl up, inhale as you lower"
    ]
  },
  
  // 2. Dumbbell Shoulder Press
  "Dumbbell Shoulder Press": {
    primaryView: "Side",
    keyMetrics: ["spinalAlignment", "jointAlignment", "rangeOfMotion", "shoulderStability"],
    metricImplementations: {
      // Spinal alignment
      spinalAlignment: {
        measure: function(pose) {
          // Check for excessive arching
          if (!pose[11] || !pose[23]) return null; // Shoulder and hip
          
          // Calculate angle of torso relative to vertical
          const torsoAngle = Math.abs(90 - calculateAngle(
            {x: pose[11].x, y: pose[11].y - 0.5}, // Point above shoulder
            {x: pose[11].x, y: pose[11].y}, // Shoulder
            {x: pose[23].x, y: pose[23].y}  // Hip
          ));
          
          return {
            value: torsoAngle,
            idealRange: [0, 10], // Minimal deviation from vertical
            feedbackText: {
              good: "Good upright posture.",
              warning: "Watch your back position.",
              error: "Excessive back arching. Maintain neutral spine."
            }
          };
        }
      },
      // Joint alignment (wrist over elbow, elbow angle)
      jointAlignment: {
        measure: function(pose) {
          // Check wrist-elbow alignment
          if (!pose[14] || !pose[16]) return null; // Elbow and wrist
          
          // Calculate horizontal displacement
          const elbowX = pose[14].x;
          const wristX = pose[16].x;
          const displacement = Math.abs(wristX - elbowX);
          
          return {
            value: displacement,
            idealRange: [0, 0.05], // Minimal horizontal displacement
            feedbackText: {
              good: "Good wrist-elbow alignment.",
              warning: "Keep wrists aligned over elbows.",
              error: "Wrists not aligned with elbows. Stack wrists directly over elbows."
            }
          };
        }
      },
      // Range of motion (full extension overhead)
      rangeOfMotion: {
        measure: function(pose) {
          // Calculate elbow angle
          if (!pose[12] || !pose[14] || !pose[16]) return null; // Shoulder, elbow, wrist
          
          const angle = calculateAngle(
            {x: pose[12].x, y: pose[12].y}, // Shoulder
            {x: pose[14].x, y: pose[14].y}, // Elbow
            {x: pose[16].x, y: pose[16].y}  // Wrist
          );
          
          return {
            value: angle,
            idealRange: [160, 180], // Near full extension at top
            feedbackText: {
              good: "Good extension at the top.",
              warning: "Try to extend arms more fully overhead.",
              error: "Incomplete extension. Press the weights fully overhead."
            }
          };
        }
      },
      // Shoulder stability
      shoulderStability: {
        measure: function(pose) {
          // Check for shoulder elevation
          if (!pose[11] || !pose[12] || !pose[23] || !pose[24]) return null; // Shoulders and hips
          
          // Calculate shoulder height relative to baseline
          const shoulderHeight = (pose[11].y + pose[12].y) / 2;
          const hipHeight = (pose[23].y + pose[24].y) / 2;
          const shoulderToHipRatio = (hipHeight - shoulderHeight) / hipHeight;
          
          return {
            value: shoulderToHipRatio,
            idealRange: [0.25, 0.35], // Typical ratio for neutral shoulders
            feedbackText: {
              good: "Shoulders are stable and down.",
              warning: "Keep your shoulders down away from ears.",
              error: "Shoulders rising. Pull shoulders down and back."
            }
          };
        }
      }
    },
    repCountingStrategy: {
      // State machine for shoulder press rep counting
      states: ["waiting", "down", "up"],
      transitions: {
        waiting: {
          to: "down",
          condition: (metrics) => metrics.rangeOfMotion && metrics.rangeOfMotion.value < 100
        },
        down: {
          to: "up",
          condition: (metrics) => metrics.rangeOfMotion && metrics.rangeOfMotion.value > 160
        },
        up: {
          to: "down",
          condition: (metrics) => metrics.rangeOfMotion && metrics.rangeOfMotion.value < 100
        }
      },
      countOn: "down-to-up" // Count a rep when transitioning from down to up
    },
    formGuidance: [
      "Maintain a neutral spine throughout the movement",
      "Keep your wrists stacked over your elbows",
      "Press the weights directly upward until arms are fully extended",
      "Avoid shrugging your shoulders during the press",
      "Exhale as you press up, inhale as you lower"
    ]
  },
  
  // 3. Dumbbell Lateral Raises
  "Dumbbell Lateral Raises": {
    primaryView: "Front",
    keyMetrics: ["rangeOfMotion", "symmetry", "shoulderStability", "tempoAndControl"],
    metricImplementations: {
      // Range of motion (shoulder abduction angle)
      rangeOfMotion: {
        measure: function(pose) {
          // Calculate arm angle relative to torso
          if (!pose[11] || !pose[13] || !pose[12] || !pose[14]) return null; // Shoulders and elbows
          
          // Calculate angle for both arms
          const leftAngle = calculateAngle(
            {x: pose[11].x, y: pose[11].y - 0.2}, // Point above left shoulder
            {x: pose[11].x, y: pose[11].y}, // Left shoulder
            {x: pose[13].x, y: pose[13].y}  // Left elbow
          );
          
          const rightAngle = calculateAngle(
            {x: pose[12].x, y: pose[12].y - 0.2}, // Point above right shoulder
            {x: pose[12].x, y: pose[12].y}, // Right shoulder
            {x: pose[14].x, y: pose[14].y}  // Right elbow
          );
          
          // Use average of both arms
          const avgAngle = (leftAngle + rightAngle) / 2;
          
          return {
            value: avgAngle,
            idealRange: [80, 100], // Arms raised to shoulder level
            feedbackText: {
              good: "Good range of motion, arms at shoulder height.",
              warning: "Adjust arm height - aim for shoulder level.",
              error: "Arms too high or too low. Raise to shoulder height only."
            }
          };
        }
      },
      // Symmetry (balanced movement)
      symmetry: {
        measure: function(pose) {
          // Compare left and right arm heights
          if (!pose[13] || !pose[14]) return null; // Elbows
          
          const leftElbowY = pose[13].y;
          const rightElbowY = pose[14].y;
          const heightDifference = Math.abs(leftElbowY - rightElbowY);
          
          return {
            value: heightDifference,
            idealRange: [0, 0.03], // Minimal height difference
            feedbackText: {
              good: "Good symmetry between arms.",
              warning: "Try to keep both arms at the same height.",
              error: "Uneven arm heights. Balance effort between left and right."
            }
          };
        }
      },
      // Shoulder stability (avoid shrugging)
      shoulderStability: {
        measure: function(pose) {
          // Check for shoulder elevation
          if (!pose[11] || !pose[12] || !pose[23] || !pose[24]) return null; // Shoulders and hips
          
          // Calculate shoulder height relative to baseline
          const shoulderHeight = (pose[11].y + pose[12].y) / 2;
          const hipHeight = (pose[23].y + pose[24].y) / 2;
          const shoulderToHipRatio = (hipHeight - shoulderHeight) / hipHeight;
          
          return {
            value: shoulderToHipRatio,
            idealRange: [0.25, 0.35], // Typical ratio for neutral shoulders
            feedbackText: {
              good: "Shoulders are down and relaxed.",
              warning: "Keep your shoulders down away from ears.",
              error: "Shoulders shrugging. Pull shoulders down and back."
            }
          };
        }
      },
      // Tempo and control
      tempoAndControl: {
        measure: function(pose, previousPose) {
          if (!pose[13] || !pose[14] || !previousPose || !previousPose[13] || !previousPose[14]) return null;
          
          // Calculate average vertical velocity of elbows
          const currentY = (pose[13].y + pose[14].y) / 2;
          const previousY = (previousPose[13].y + previousPose[14].y) / 2;
          const velocity = Math.abs(currentY - previousY);
          
          return {
            value: velocity,
            idealRange: [0, 0.01], // Normalized velocity (adjust based on framerate)
            feedbackText: {
              good: "Good controlled tempo.",
              warning: "Control your lowering phase.",
              error: "Movement too fast. Slow down, especially on the way down."
            }
          };
        }
      }
    },
    repCountingStrategy: {
      // State machine for lateral raise rep counting
      states: ["waiting", "down", "up"],
      transitions: {
        waiting: {
          to: "down",
          condition: (metrics) => metrics.rangeOfMotion && metrics.rangeOfMotion.value < 30
        },
        down: {
          to: "up",
          condition: (metrics) => metrics.rangeOfMotion && metrics.rangeOfMotion.value > 80
        },
        up: {
          to: "down",
          condition: (metrics) => metrics.rangeOfMotion && metrics.rangeOfMotion.value < 30
        }
      },
      countOn: "down-to-up" // Count a rep when transitioning from down to up
    },
    formGuidance: [
      "Keep a slight bend in your elbows throughout the movement",
      "Raise arms to shoulder height, not higher",
      "Keep shoulders down away from your ears",
      "Maintain thumbs slightly higher than pinkies (slight external rotation)",
      "Control the movement, especially on the way down",
      "Exhale as you raise, inhale as you lower"
    ]
  },
  
  // Add implementations for the remaining exercises...
  // 4. Dumbbell Bent-Over Rows
  "Dumbbell Bent-Over Rows": {
    primaryView: "Side",
    keyMetrics: ["setupAndStance", "spinalAlignment", "jointAlignment", "rangeOfMotion"],
    metricImplementations: {
      // Setup and stance (hip hinge position)
      setupAndStance: {
        measure: function(pose) {
          // Check hip hinge angle
          if (!pose[11] || !pose[23] || !pose[25]) return null; // Shoulder, hip, and knee
          
          const torsoAngle = calculateAngle(
            {x: pose[11].x, y: pose[11].y}, // Shoulder
            {x: pose[23].x, y: pose[23].y}, // Hip
            {x: pose[25].x, y: pose[25].y}  // Knee
          );
          
          return {
            value: torsoAngle,
            idealRange: [45, 75], // Proper hip hinge angle
            feedbackText: {
              good: "Good hip hinge position.",
              warning: "Adjust your torso angle.",
              error: "Incorrect hip hinge. Bend more at the hips, less at the waist."
            }
          };
        }
      },
      // Spinal alignment (maintaining flat back)
      spinalAlignment: {
        measure: function(pose) {
          // Check for back flatness
          if (!pose[11] || !pose[23]) return null; // Shoulder and hip
          
          // This is simplified - in a real implementation we'd use more points
          const backAngle = calculateAngle(
            {x: pose[11].x - 0.1, y: pose[11].y}, // Point behind shoulder
            {x: pose[11].x, y: pose[11].y}, // Shoulder
            {x: pose[23].x, y: pose[23].y}  // Hip
          );
          
          return {
            value: backAngle,
            idealRange: [170, 180], // Nearly straight back
            feedbackText: {
              good: "Good flat back position.",
              warning: "Watch your back position, keep it flat.",
              error: "Back is rounded. Maintain a flat back throughout the movement."
            }
          };
        }
      },
      // Joint alignment (elbow path)
      jointAlignment: {
        measure: function(pose) {
          // Check elbow path
          if (!pose[12] || !pose[14]) return null; // Shoulder and elbow
          
          // Calculate vertical displacement
          const shoulderY = pose[12].y;
          const elbowY = pose[14].y;
          const displacement = Math.abs(elbowY - shoulderY);
          
          return {
            value: displacement,
            idealRange: [0.05, 0.15], // Elbow should travel close to body
            feedbackText: {
              good: "Good elbow path, close to body.",
              warning: "Keep elbows closer to your body.",
              error: "Elbows flaring out. Pull elbows back, not out to sides."
            }
          };
        }
      },
      // Range of motion (scapular retraction)
      rangeOfMotion: {
        measure: function(pose) {
          // Check elbow height at top of movement
          if (!pose[12] || !pose[14]) return null; // Shoulder and elbow
          
          // Calculate vertical position of elbow relative to shoulder
          const shoulderY = pose[12].y;
          const elbowY = pose[14].y;
          const relativeHeight = shoulderY - elbowY;
          
          return {
            value: relativeHeight,
            idealRange: [-0.05, 0.1], // Elbow should come up to around shoulder height
            feedbackText: {
              good: "Good range of motion, pulling elbows high.",
              warning: "Try to pull elbows higher.",
              error: "Insufficient pull height. Pull elbows higher toward ribs."
            }
          };
        }
      }
    },
    repCountingStrategy: {
      // State machine for bent-over row rep counting
      states: ["waiting", "down", "up"],
      transitions: {
        waiting: {
          to: "down",
          condition: (metrics) => metrics.rangeOfMotion && metrics.rangeOfMotion.value < 0
        },
        down: {
          to: "up",
          condition: (metrics) => metrics.rangeOfMotion && metrics.rangeOfMotion.value > 0.05
        },
        up: {
          to: "down",
          condition: (metrics) => metrics.rangeOfMotion && metrics.rangeOfMotion.value < 0
        }
      },
      countOn: "down-to-up" // Count a rep when transitioning from down to up
    },
    formGuidance: [
      "Hinge at the hips with a flat back",
      "Keep your back flat throughout the movement",
      "Pull the weights toward your lower ribs",
      "Keep elbows close to your body",
      "Squeeze your shoulder blades together at the top",
      "Exhale as you pull, inhale as you lower"
    ]
  },
  
  // 5. Dumbbell Chest Flyes
  "Dumbbell Chest Flyes": {
    primaryView: "Side",
    keyMetrics: ["rangeOfMotion", "jointAlignment", "tempoAndControl", "symmetry"],
    metricImplementations: {
      // Range of motion (arm extension)
      rangeOfMotion: {
        measure: function(pose) {
          // Calculate angle between arms and torso
          if (!pose[11] || !pose[13] || !pose[15]) return null; // Left shoulder, elbow, wrist
          
          // For chest flyes, we're measuring the angle at the shoulder
          const shoulderAngle = calculateAngle(
            {x: pose[11].x, y: pose[11].y - 0.2}, // Point above shoulder
            {x: pose[11].x, y: pose[11].y}, // Shoulder
            {x: pose[13].x, y: pose[13].y}  // Elbow
          );
          
          return {
            value: shoulderAngle,
            idealRange: [70, 170], // From close to chest to wide extension
            feedbackText: {
              good: "Good range of motion in your flyes.",
              warning: "Try to achieve fuller range of motion.",
              error: "Incomplete range of motion. Extend arms wider at bottom and bring closer at top."
            }
          };
        }
      },
      // Elbow angle (slight bend maintained)
      jointAlignment: {
        measure: function(pose) {
          // Calculate elbow angle
          if (!pose[11] || !pose[13] || !pose[15]) return null; // Shoulder, elbow, wrist
          
          const elbowAngle = calculateAngle(
            {x: pose[11].x, y: pose[11].y}, // Shoulder
            {x: pose[13].x, y: pose[13].y}, // Elbow
            {x: pose[15].x, y: pose[15].y}  // Wrist
          );
          
          return {
            value: elbowAngle,
            idealRange: [140, 160], // Slight bend in elbow
            feedbackText: {
              good: "Good elbow position with slight bend.",
              warning: "Maintain a slight bend in your elbows.",
              error: "Elbows too bent or too straight. Keep a slight bend throughout."
            }
          };
        }
      },
      // Tempo and control
      tempoAndControl: {
        measure: function(pose, previousPose) {
          if (!pose[15] || !previousPose || !previousPose[15]) return null; // Wrist
          
          // Calculate velocity of arm movement
          const currentX = pose[15].x;
          const previousX = previousPose[15].x;
          const velocity = Math.abs(currentX - previousX);
          
          return {
            value: velocity,
            idealRange: [0, 0.012], // Normalized velocity
            feedbackText: {
              good: "Good controlled tempo.",
              warning: "Control your movement speed.",
              error: "Movement too fast. Slow down for better muscle engagement."
            }
          };
        }
      },
      // Back position (flat on bench)
      spinalAlignment: {
        measure: function(pose) {
          // This is simplified since we can't easily detect the bench
          // In a real implementation, we'd use more reference points
          if (!pose[11] || !pose[23]) return null; // Shoulder and hip
          
          const backAngle = calculateAngle(
            {x: pose[11].x - 0.1, y: pose[11].y}, // Point behind shoulder
            {x: pose[11].x, y: pose[11].y}, // Shoulder
            {x: pose[23].x, y: pose[23].y}  // Hip
          );
          
          return {
            value: backAngle,
            idealRange: [170, 180], // Nearly straight back
            feedbackText: {
              good: "Good back position on bench.",
              warning: "Keep your back flat on the bench.",
              error: "Back is arching. Maintain contact with the bench."
            }
          };
        }
      }
    },
    repCountingStrategy: {
      // State machine for chest flye rep counting
      states: ["waiting", "open", "closed"],
      transitions: {
        waiting: {
          to: "open",
          condition: (metrics) => metrics.rangeOfMotion && metrics.rangeOfMotion.value > 150
        },
        open: {
          to: "closed",
          condition: (metrics) => metrics.rangeOfMotion && metrics.rangeOfMotion.value < 90
        },
        closed: {
          to: "open",
          condition: (metrics) => metrics.rangeOfMotion && metrics.rangeOfMotion.value > 150
        }
      },
      countOn: "closed-to-open" // Count a rep when transitioning from closed to open
    },
    formGuidance: [
      "Maintain a slight bend in your elbows throughout the movement",
      "Lower the weights in a wide arc until you feel a stretch in your chest",
      "Keep your back flat against the bench",
      "Bring the weights back up in a controlled motion",
      "Focus on squeezing your chest muscles at the top",
      "Exhale as you bring weights together, inhale as you lower"
    ]
  },
  
  // 6. Dumbbell Tricep Extensions
  "Dumbbell Tricep Extensions": {
    primaryView: "Side",
    keyMetrics: ["rangeOfMotion", "jointAlignment", "tempoAndControl", "wristPosition"],
    metricImplementations: {
      // Range of motion (elbow extension)
      rangeOfMotion: {
        measure: function(pose) {
          // Calculate elbow angle
          if (!pose[12] || !pose[14] || !pose[16]) return null; // Shoulder, elbow, wrist
          
          const elbowAngle = calculateAngle(
            {x: pose[12].x, y: pose[12].y}, // Shoulder
            {x: pose[14].x, y: pose[14].y}, // Elbow
            {x: pose[16].x, y: pose[16].y}  // Wrist
          );
          
          return {
            value: elbowAngle,
            idealRange: [150, 180], // Near full extension at top
            feedbackText: {
              good: "Good elbow extension.",
              warning: "Extend your arms more fully.",
              error: "Incomplete extension. Fully extend your arms at the top."
            }
          };
        }
      },
      // Upper arm position (vertical and stationary)
      jointAlignment: {
        measure: function(pose) {
          // Check if upper arm is vertical
          if (!pose[12] || !pose[14]) return null; // Shoulder and elbow
          
          // Calculate angle of upper arm relative to vertical
          const upperArmAngle = Math.abs(90 - calculateAngle(
            {x: pose[12].x, y: pose[12].y - 0.5}, // Point above shoulder
            {x: pose[12].x, y: pose[12].y}, // Shoulder
            {x: pose[14].x, y: pose[14].y}  // Elbow
          ));
          
          return {
            value: upperArmAngle,
            idealRange: [0, 15], // Close to vertical
            feedbackText: {
              good: "Good upper arm position.",
              warning: "Keep your upper arms more vertical.",
              error: "Upper arms moving too much. Keep them vertical and stationary."
            }
          };
        }
      },
      // Wrist position
      wristPosition: {
        measure: function(pose) {
          // Check wrist alignment
          if (!pose[14] || !pose[16]) return null; // Elbow and wrist
          
          // Calculate angle between forearm and hand
          const wristAngle = Math.abs(90 - calculateAngle(
            {x: pose[14].x, y: pose[14].y}, // Elbow
            {x: pose[16].x, y: pose[16].y}, // Wrist
            {x: pose[16].x + 0.1, y: pose[16].y} // Projected point to represent hand
          ));
          
          return {
            value: wristAngle,
            idealRange: [0, 15], // Minimal deviation from neutral
            feedbackText: {
              good: "Wrists are straight and stable.",
              warning: "Keep your wrists straight.",
              error: "Wrists are bent. Maintain neutral wrist position."
            }
          };
        }
      },
      // Tempo and control
      tempoAndControl: {
        measure: function(pose, previousPose) {
          if (!pose[16] || !previousPose || !previousPose[16]) return null; // Wrist
          
          // Calculate velocity of arm movement
          const currentY = pose[16].y;
          const previousY = previousPose[16].y;
          const velocity = Math.abs(currentY - previousY);
          
          return {
            value: velocity,
            idealRange: [0, 0.015], // Normalized velocity
            feedbackText: {
              good: "Good controlled tempo.",
              warning: "Control your lowering phase.",
              error: "Movement too fast. Slow down, especially on the way down."
            }
          };
        }
      }
    },
    repCountingStrategy: {
      // State machine for tricep extension rep counting
      states: ["waiting", "bent", "extended"],
      transitions: {
        waiting: {
          to: "bent",
          condition: (metrics) => metrics.rangeOfMotion && metrics.rangeOfMotion.value < 90
        },
        bent: {
          to: "extended",
          condition: (metrics) => metrics.rangeOfMotion && metrics.rangeOfMotion.value > 150
        },
        extended: {
          to: "bent",
          condition: (metrics) => metrics.rangeOfMotion && metrics.rangeOfMotion.value < 90
        }
      },
      countOn: "bent-to-extended" // Count a rep when transitioning from bent to extended
    },
    formGuidance: [
      "Keep your upper arms vertical and stationary",
      "Lower the weight behind your head until your forearms are just beyond parallel to the floor",
      "Extend your arms fully at the top by contracting your triceps",
      "Maintain a neutral wrist position throughout",
      "Control the weight, especially during the lowering phase",
      "Exhale as you extend, inhale as you lower"
    ]
  },
  
  // 7. Dumbbell Lunges
  "Dumbbell Lunges": {
    primaryView: "Side",
    keyMetrics: ["setupAndStance", "jointAlignment", "spinalAlignment", "rangeOfMotion"],
    metricImplementations: {
      // Setup and stance (step length)
      setupAndStance: {
        measure: function(pose) {
          // Check step length
          if (!pose[23] || !pose[25] || !pose[27]) return null; // Hip, knee, ankle
          
          // Calculate horizontal distance between front and back foot
          // This is simplified - in a real implementation we'd use more reference points
          const stepLength = Math.abs(pose[27].x - pose[23].x);
          
          return {
            value: stepLength,
            idealRange: [0.3, 0.6], // Normalized step length
            feedbackText: {
              good: "Good step length.",
              warning: "Adjust your step length for better balance.",
              error: "Step too short or too long. Step forward about one leg length."
            }
          };
        }
      },
      // Joint alignment (knee over ankle)
      jointAlignment: {
        measure: function(pose) {
          // Check if front knee is over ankle
          if (!pose[25] || !pose[27]) return null; // Knee and ankle
          
          // Calculate horizontal displacement between knee and ankle
          const kneeX = pose[25].x;
          const ankleX = pose[27].x;
          const displacement = Math.abs(kneeX - ankleX);
          
          return {
            value: displacement,
            idealRange: [0, 0.05], // Minimal horizontal displacement
            feedbackText: {
              good: "Good knee alignment over ankle.",
              warning: "Check your knee position.",
              error: "Knee extending past toes. Align knee over ankle."
            }
          };
        }
      },
      // Spinal alignment (upright torso)
      spinalAlignment: {
        measure: function(pose) {
          // Check for upright torso
          if (!pose[11] || !pose[23]) return null; // Shoulder and hip
          
          // Calculate angle of torso relative to vertical
          const torsoAngle = Math.abs(90 - calculateAngle(
            {x: pose[11].x, y: pose[11].y - 0.5}, // Point above shoulder
            {x: pose[11].x, y: pose[11].y}, // Shoulder
            {x: pose[23].x, y: pose[23].y}  // Hip
          ));
          
          return {
            value: torsoAngle,
            idealRange: [0, 15], // Close to vertical
            feedbackText: {
              good: "Good upright torso position.",
              warning: "Keep your torso more upright.",
              error: "Torso leaning too much. Maintain an upright position."
            }
          };
        }
      },
      // Range of motion (lunge depth)
      rangeOfMotion: {
        measure: function(pose) {
          // Calculate knee angle
          if (!pose[23] || !pose[25] || !pose[27]) return null; // Hip, knee, ankle
          
          const kneeAngle = calculateAngle(
            {x: pose[23].x, y: pose[23].y}, // Hip
            {x: pose[25].x, y: pose[25].y}, // Knee
            {x: pose[27].x, y: pose[27].y}  // Ankle
          );
          
          return {
            value: kneeAngle,
            idealRange: [80, 100], // Around 90 degrees
            feedbackText: {
              good: "Good lunge depth.",
              warning: "Adjust your lunge depth.",
              error: "Incorrect depth. Aim for 90 degrees at the front knee."
            }
          };
        }
      }
    },
    repCountingStrategy: {
      // State machine for lunge rep counting
      states: ["waiting", "standing", "lunging"],
      transitions: {
        waiting: {
          to: "standing",
          condition: (metrics) => metrics.rangeOfMotion && metrics.rangeOfMotion.value > 160
        },
        standing: {
          to: "lunging",
          condition: (metrics) => metrics.rangeOfMotion && metrics.rangeOfMotion.value < 100
        },
        lunging: {
          to: "standing",
          condition: (metrics) => metrics.rangeOfMotion && metrics.rangeOfMotion.value > 160
        }
      },
      countOn: "lunging-to-standing" // Count a rep when transitioning from lunging to standing
    },
    formGuidance: [
      "Take a step forward about one leg length",
      "Keep your front knee aligned over your ankle, not past your toes",
      "Lower your body until both knees are bent at about 90 degrees",
      "Keep your torso upright throughout the movement",
      "Push through your front heel to return to standing",
      "Exhale as you push up, inhale as you lower"
    ]
  },
  
  // 8. Dumbbell Russian Twists
  "Dumbbell Russian Twists": {
    primaryView: "Front",
    keyMetrics: ["setupAndStance", "spinalAlignment", "rangeOfMotion", "tempoAndControl"],
    metricImplementations: {
      // Setup and stance (V-position with torso)
      setupAndStance: {
        measure: function(pose) {
          // Check V-position angle
          if (!pose[11] || !pose[23] || !pose[25]) return null; // Shoulder, hip, knee
          
          const torsoAngle = calculateAngle(
            {x: pose[11].x, y: pose[11].y}, // Shoulder
            {x: pose[23].x, y: pose[23].y}, // Hip
            {x: pose[25].x, y: pose[25].y}  // Knee
          );
          
          return {
            value: torsoAngle,
            idealRange: [90, 120], // V-position angle
            feedbackText: {
              good: "Good V-position with torso.",
              warning: "Adjust your torso angle.",
              error: "Incorrect V-position. Lean back more to create a V-shape."
            }
          };
        }
      },
      // Spinal alignment (straight back, not rounded)
      spinalAlignment: {
        measure: function(pose) {
          // Check for back straightness
          if (!pose[11] || !pose[23]) return null; // Shoulder and hip
          
          // This is simplified - in a real implementation we'd use more points
          const backAngle = calculateAngle(
            {x: pose[11].x - 0.1, y: pose[11].y}, // Point behind shoulder
            {x: pose[11].x, y: pose[11].y}, // Shoulder
            {x: pose[23].x, y: pose[23].y}  // Hip
          );
          
          return {
            value: backAngle,
            idealRange: [160, 180], // Straight back
            feedbackText: {
              good: "Good straight back position.",
              warning: "Keep your back straighter.",
              error: "Back is rounded. Maintain a straight back."
            }
          };
        }
      },
      // Range of motion (rotation angle)
      rangeOfMotion: {
        measure: function(pose) {
          // Calculate rotation angle
          if (!pose[11] || !pose[12] || !pose[23] || !pose[24]) return null; // Shoulders and hips
          
          // Calculate angle between shoulders and hips
          const shoulderVector = {
            x: pose[12].x - pose[11].x,
            y: pose[12].y - pose[11].y
          };
          
          const hipVector = {
            x: pose[24].x - pose[23].x,
            y: pose[24].y - pose[23].y
          };
          
          // Calculate angle between vectors
          const dotProduct = shoulderVector.x * hipVector.x + shoulderVector.y * hipVector.y;
          const shoulderMag = Math.sqrt(shoulderVector.x * shoulderVector.x + shoulderVector.y * shoulderVector.y);
          const hipMag = Math.sqrt(hipVector.x * hipVector.x + hipVector.y * hipVector.y);
          
          const angle = Math.acos(dotProduct / (shoulderMag * hipMag)) * (180 / Math.PI);
          
          return {
            value: angle,
            idealRange: [20, 45], // Rotation angle
            feedbackText: {
              good: "Good rotation range.",
              warning: "Try to rotate a bit more.",
              error: "Insufficient rotation. Rotate further to each side."
            }
          };
        }
      },
      // Tempo and control
      tempoAndControl: {
        measure: function(pose, previousPose) {
          if (!pose[11] || !previousPose || !previousPose[11]) return null; // Shoulder
          
          // Calculate velocity of rotation
          const currentX = pose[11].x;
          const previousX = previousPose[11].x;
          const velocity = Math.abs(currentX - previousX);
          
          return {
            value: velocity,
            idealRange: [0, 0.015], // Normalized velocity
            feedbackText: {
              good: "Good controlled tempo.",
              warning: "Control your rotation speed.",
              error: "Movement too fast. Slow down for better engagement."
            }
          };
        }
      }
    },
      repCountingStrategy: {
      // State machine for Russian twist rep counting
      states: ["waiting", "center", "right", "left"],
      transitions: {
        waiting: {
          to: "center",
          condition: (metrics) => metrics.rangeOfMotion && metrics.rangeOfMotion.value < 10
        },
        center: [
          {
            to: "right",
            condition: (metrics) => metrics.rangeOfMotion && metrics.rangeOfMotion.value > 20 && metrics.shoulderVector && metrics.shoulderVector.x > 0
          },
          {
            to: "left",
            condition: (metrics) => metrics.rangeOfMotion && metrics.rangeOfMotion.value > 20 && metrics.shoulderVector && metrics.shoulderVector.x < 0
          }
        ],
        right: {
          to: "center",
          condition: (metrics) => metrics.rangeOfMotion && metrics.rangeOfMotion.value < 10
        },
        left: {
          to: "center",
          condition: (metrics) => metrics.rangeOfMotion && metrics.rangeOfMotion.value < 10
        }
      },
      countOn: "left-to-center", // Count a rep after completing both sides
      getRepQuality: function(fromState, toState) {
        if (fromState === "left" && toState === "center") return 1.0; // Full rep
        return 0; // Not a counted rep
      }
    },
    formGuidance: [
      "Sit on the floor with knees bent and feet slightly elevated",
      "Lean back to create a V-shape with your torso and thighs",
      "Keep your back straight, not rounded",
      "Rotate your torso to the right, bringing the weight beside your hip",
      "Return to center, then rotate to the left side",
      "Focus on rotating from your core, not just moving your arms",
      "Exhale as you rotate, inhale as you return to center"
    ]
  }
};

// Export the metrics and utility functions
export { 
  baseMetrics, 
  exerciseMetrics, 
  calculateAngle, 
  smoothAngle, 
  determineFeedbackSeverity 
};
