// Football Technique Metrics Documentation and Implementation
// Utility functions imported from shared module
import { calculateAngle, smoothAngle, smoothAngleFast, angularVelocity, peakAngularVelocity, determineFeedbackSeverity } from '../shared/pose-utils.js';

/**
 * Metrics Priority Levels:
 * P0 - Critical for safety and effectiveness
 * P1 - Important for optimal performance
 * P2 - Beneficial for advanced form refinement
 */

// Base metrics applicable to all football techniques
const baseMetrics = {
  stance: {
    priority: "P0",
    description: "Proper stance and body positioning before and during the technique.",
    idealView: "Front or Side",
    feedbackText: {
      good: "Good stance position.",
      warning: "Adjust your stance.",
      error: "Incorrect stance. Reset your position."
    }
  },
  balance: {
    priority: "P0",
    description: "Maintaining balance throughout the movement, especially during single-leg phases.",
    idealView: "Front (Preferred)",
    feedbackText: {
      good: "Good balance.",
      warning: "Watch your balance.",
      error: "Off balance. Stabilize your core."
    }
  },
  hipMobility: {
    priority: "P1",
    description: "Hip flexion, extension, and rotation during kicks and passes.",
    idealView: "Side (Required)",
    feedbackText: {
      good: "Good hip drive.",
      warning: "Increase hip engagement.",
      error: "Insufficient hip movement. Drive from the hip."
    }
  },
  kneeAction: {
    priority: "P1",
    description: "Proper knee flexion and extension during kicking and movement.",
    idealView: "Side (Required)",
    feedbackText: {
      good: "Good knee action.",
      warning: "Adjust your knee angle.",
      error: "Knee angle incorrect. Focus on proper knee drive."
    }
  },
  coreEngagement: {
    priority: "P1",
    description: "Core stability and rotation during dynamic movements.",
    idealView: "Side or Front",
    feedbackText: {
      good: "Good core engagement.",
      warning: "Engage your core more.",
      error: "Core not engaged. Brace your midsection."
    }
  },
  followThrough: {
    priority: "P1",
    description: "Proper follow-through after striking or releasing the ball.",
    idealView: "Side (Required)",
    feedbackText: {
      good: "Good follow-through.",
      warning: "Extend your follow-through.",
      error: "Incomplete follow-through. Continue the motion after contact."
    }
  }
};

// Technique-specific metrics and implementations
const techniqueMetrics = {
  // 1. Instep Kick
  "Instep Kick": {
    primaryView: "Side",
    keyMetrics: ["hipMobility", "kneeAction", "balance", "followThrough"],
    metricImplementations: {
      hipMobility: {
        measure: function(pose) {
          if (!pose[12] || !pose[24] || !pose[26]) return null;
          const hipAngle = calculateAngle(
            { x: pose[12].x, y: pose[12].y },
            { x: pose[24].x, y: pose[24].y },
            { x: pose[26].x, y: pose[26].y }
          );
          return {
            value: hipAngle,
            idealRange: [120, 170],
            feedbackText: {
              good: "Good hip drive for the kick.",
              warning: "Open your hip more for power.",
              error: "Insufficient hip extension. Drive from your hip for more power."
            }
          };
        }
      },
      kneeAction: {
        measure: function(pose) {
          if (!pose[24] || !pose[26] || !pose[28]) return null;
          const kneeAngle = calculateAngle(
            { x: pose[24].x, y: pose[24].y },
            { x: pose[26].x, y: pose[26].y },
            { x: pose[28].x, y: pose[28].y }
          );
          return {
            value: kneeAngle,
            idealRange: [140, 175],
            feedbackText: {
              good: "Good knee extension through the ball.",
              warning: "Extend your knee more on contact.",
              error: "Knee too bent at contact. Snap through the ball."
            }
          };
        }
      },
      balance: {
        measure: function(pose) {
          if (!pose[11] || !pose[12] || !pose[23] || !pose[24]) return null;
          const shoulderMidX = (pose[11].x + pose[12].x) / 2;
          const hipMidX = (pose[23].x + pose[24].x) / 2;
          const lean = Math.abs(shoulderMidX - hipMidX);
          return {
            value: lean,
            idealRange: [0, 0.06],
            feedbackText: {
              good: "Good body balance during the kick.",
              warning: "Keep your body more centered.",
              error: "Leaning too much. Stay balanced over the ball."
            }
          };
        }
      },
      followThrough: {
        measure: function(pose) {
          if (!pose[24] || !pose[26] || !pose[28]) return null;
          const legAngle = calculateAngle(
            { x: pose[24].x, y: pose[24].y },
            { x: pose[26].x, y: pose[26].y },
            { x: pose[28].x, y: pose[28].y }
          );
          return {
            value: legAngle,
            idealRange: [150, 180],
            feedbackText: {
              good: "Great follow-through!",
              warning: "Follow through more toward your target.",
              error: "Short follow-through. Extend your leg after contact."
            }
          };
        }
      }
    },
    repCountingStrategy: {
      states: ["waiting", "backswing", "follow_through"],
      transitions: {
        waiting: [
          { to: "backswing", condition: (metrics) => metrics.hipMobility && metrics.hipMobility.value < 130 }
        ],
        backswing: [
          { to: "follow_through", condition: (metrics) => metrics.kneeAction && metrics.kneeAction.value > 150 }
        ],
        follow_through: [
          { to: "waiting", condition: (metrics) => metrics.hipMobility && metrics.hipMobility.value > 150 }
        ]
      },
      countOn: "backswing-to-follow_through",
      getRepQuality: function(fromState, toState) {
        if (fromState === "backswing" && toState === "follow_through") return 1.0;
        return 0;
      }
    },
    formGuidance: [
      "Plant your support foot beside the ball, toes pointed at target",
      "Drive from the hip for maximum power",
      "Lock your ankle and point toes down at contact",
      "Follow through toward your target",
      "Keep your body over the ball for a driven shot"
    ]
  },

  // 2. Inside Foot Pass
  "Inside Foot Pass": {
    primaryView: "Front",
    keyMetrics: ["hipMobility", "kneeAction", "balance"],
    metricImplementations: {
      hipMobility: {
        measure: function(pose) {
          if (!pose[23] || !pose[24] || !pose[26]) return null;
          const hipRotation = Math.abs(pose[23].x - pose[24].x);
          return {
            value: hipRotation,
            idealRange: [0.05, 0.2],
            feedbackText: {
              good: "Good hip position for the pass.",
              warning: "Open your hips more toward the target.",
              error: "Hips not aligned. Face your target."
            }
          };
        }
      },
      kneeAction: {
        measure: function(pose) {
          if (!pose[24] || !pose[26] || !pose[28]) return null;
          const kneeAngle = calculateAngle(
            { x: pose[24].x, y: pose[24].y },
            { x: pose[26].x, y: pose[26].y },
            { x: pose[28].x, y: pose[28].y }
          );
          return {
            value: kneeAngle,
            idealRange: [130, 165],
            feedbackText: {
              good: "Good knee extension on the pass.",
              warning: "Push through the ball more.",
              error: "Not enough follow-through. Extend your knee."
            }
          };
        }
      },
      balance: {
        measure: function(pose) {
          if (!pose[11] || !pose[12] || !pose[23] || !pose[24]) return null;
          const shoulderMidX = (pose[11].x + pose[12].x) / 2;
          const hipMidX = (pose[23].x + pose[24].x) / 2;
          const lean = Math.abs(shoulderMidX - hipMidX);
          return {
            value: lean,
            idealRange: [0, 0.05],
            feedbackText: {
              good: "Good balance.",
              warning: "Stay more centered over the ball.",
              error: "Off balance. Keep your core stable."
            }
          };
        }
      }
    },
    repCountingStrategy: {
      states: ["waiting", "backswing", "follow_through"],
      transitions: {
        waiting: [
          { to: "backswing", condition: (metrics) => metrics.kneeAction && metrics.kneeAction.value < 120 }
        ],
        backswing: [
          { to: "follow_through", condition: (metrics) => metrics.kneeAction && metrics.kneeAction.value > 140 }
        ],
        follow_through: [
          { to: "waiting", condition: (metrics) => metrics.kneeAction && metrics.kneeAction.value < 130 }
        ]
      },
      countOn: "backswing-to-follow_through",
      getRepQuality: function(fromState, toState) {
        if (fromState === "backswing" && toState === "follow_through") return 1.0;
        return 0;
      }
    },
    formGuidance: [
      "Turn your kicking foot outward 90 degrees",
      "Strike with the inside (arch) of your foot",
      "Push through the ball toward your target",
      "Keep your body over the ball for accuracy",
      "Follow through in the direction of the pass"
    ]
  },

  // 3. Outside Foot Pass
  "Outside Foot Pass": {
    primaryView: "Side",
    keyMetrics: ["hipMobility", "kneeAction", "balance"],
    metricImplementations: {
      hipMobility: {
        measure: function(pose) {
          if (!pose[12] || !pose[24] || !pose[26]) return null;
          const hipAngle = calculateAngle(
            { x: pose[12].x, y: pose[12].y },
            { x: pose[24].x, y: pose[24].y },
            { x: pose[26].x, y: pose[26].y }
          );
          return {
            value: hipAngle,
            idealRange: [130, 170],
            feedbackText: {
              good: "Good hip position.",
              warning: "Adjust your approach angle.",
              error: "Wrong approach angle. Come at the ball from the side."
            }
          };
        }
      },
      kneeAction: {
        measure: function(pose) {
          if (!pose[24] || !pose[26] || !pose[28]) return null;
          const kneeAngle = calculateAngle(
            { x: pose[24].x, y: pose[24].y },
            { x: pose[26].x, y: pose[26].y },
            { x: pose[28].x, y: pose[28].y }
          );
          return {
            value: kneeAngle,
            idealRange: [120, 160],
            feedbackText: {
              good: "Good whipping motion from the knee.",
              warning: "Use more knee snap.",
              error: "Needs more knee drive. Whip from the knee."
            }
          };
        }
      },
      balance: {
        measure: function(pose) {
          if (!pose[11] || !pose[12] || !pose[23] || !pose[24]) return null;
          const shoulderMidY = (pose[11].y + pose[12].y) / 2;
          const hipMidY = (pose[23].y + pose[24].y) / 2;
          const torsoLen = hipMidY - shoulderMidY;
          const lean = Math.abs((pose[11].x + pose[12].x) / 2 - (pose[23].x + pose[24].x) / 2) / torsoLen;
          return {
            value: lean,
            idealRange: [0, 0.3],
            feedbackText: {
              good: "Good balance through the pass.",
              warning: "Keep your upper body steady.",
              error: "Too much upper body movement. Stay stable."
            }
          };
        }
      }
    },
    repCountingStrategy: {
      states: ["waiting", "backswing", "follow_through"],
      transitions: {
        waiting: [
          { to: "backswing", condition: (metrics) => metrics.kneeAction && metrics.kneeAction.value < 110 }
        ],
        backswing: [
          { to: "follow_through", condition: (metrics) => metrics.kneeAction && metrics.kneeAction.value > 140 }
        ],
        follow_through: [
          { to: "waiting", condition: (metrics) => metrics.kneeAction && metrics.kneeAction.value < 130 }
        ]
      },
      countOn: "backswing-to-follow_through",
      getRepQuality: function(fromState, toState) {
        if (fromState === "backswing" && toState === "follow_through") return 1.0;
        return 0;
      }
    },
    formGuidance: [
      "Approach the ball at a slight angle",
      "Strike with the outside of your foot",
      "Use a whipping motion from the knee",
      "Rotate your ankle inward on contact",
      "Follow through across your body"
    ]
  },

  // 4. Dribbling Posture (continuous posture scoring)
  "Dribbling Posture": {
    primaryView: "Front",
    keyMetrics: ["stance", "balance", "coreEngagement"],
    metricImplementations: {
      stance: {
        measure: function(pose) {
          if (!pose[25] || !pose[26] || !pose[27] || !pose[28]) return null;
          // Average knee bend
          const leftKnee = calculateAngle(
            { x: pose[23].x, y: pose[23].y },
            { x: pose[25].x, y: pose[25].y },
            { x: pose[27].x, y: pose[27].y }
          );
          const rightKnee = calculateAngle(
            { x: pose[24].x, y: pose[24].y },
            { x: pose[26].x, y: pose[26].y },
            { x: pose[28].x, y: pose[28].y }
          );
          const avgKnee = (leftKnee + rightKnee) / 2;
          return {
            value: avgKnee,
            idealRange: [140, 165],
            feedbackText: {
              good: "Good knee bend for dribbling.",
              warning: "Bend your knees more for agility.",
              error: "Legs too straight. Lower your center of gravity."
            }
          };
        }
      },
      balance: {
        measure: function(pose) {
          if (!pose[11] || !pose[12] || !pose[23] || !pose[24]) return null;
          const shoulderMidX = (pose[11].x + pose[12].x) / 2;
          const hipMidX = (pose[23].x + pose[24].x) / 2;
          const lean = Math.abs(shoulderMidX - hipMidX);
          return {
            value: lean,
            idealRange: [0, 0.04],
            feedbackText: {
              good: "Good balance and center of gravity.",
              warning: "Keep your weight centered.",
              error: "Off balance. Center your weight over your feet."
            }
          };
        }
      },
      coreEngagement: {
        measure: function(pose) {
          if (!pose[11] || !pose[12] || !pose[23] || !pose[24]) return null;
          // Check torso lean (slight forward lean is ideal)
          const shoulderMidY = (pose[11].y + pose[12].y) / 2;
          const shoulderMidX = (pose[11].x + pose[12].x) / 2;
          const hipMidY = (pose[23].y + pose[24].y) / 2;
          const hipMidX = (pose[23].x + pose[24].x) / 2;
          const torsoAngle = Math.atan2(hipMidY - shoulderMidY, hipMidX - shoulderMidX) * (180 / Math.PI);
          const forwardLean = Math.abs(90 - torsoAngle);
          return {
            value: forwardLean,
            idealRange: [5, 20],
            feedbackText: {
              good: "Good forward lean for dribbling.",
              warning: "Lean slightly forward.",
              error: "Posture too upright or too bent. Slight forward lean needed."
            }
          };
        }
      }
    },
    repCountingStrategy: {
      // Dribbling uses continuous scoring rather than discrete reps
      states: ["waiting", "active"],
      transitions: {
        waiting: [
          { to: "active", condition: (metrics) => metrics.stance && metrics.stance.value < 170 }
        ],
        active: [
          { to: "waiting", condition: (metrics) => metrics.stance && metrics.stance.value > 175 }
        ]
      },
      countOn: "continuous",
      getRepQuality: function() { return 1.0; }
    },
    formGuidance: [
      "Keep your knees slightly bent for quick changes of direction",
      "Lean slightly forward to stay over the ball",
      "Keep your head up to see the field",
      "Arms out for balance",
      "Stay light on the balls of your feet"
    ]
  },

  // 5. Heading Technique
  "Heading Technique": {
    primaryView: "Side",
    keyMetrics: ["stance", "coreEngagement", "followThrough"],
    metricImplementations: {
      stance: {
        measure: function(pose) {
          if (!pose[27] || !pose[28]) return null;
          const stanceWidth = Math.abs(pose[27].x - pose[28].x);
          return {
            value: stanceWidth,
            idealRange: [0.1, 0.25],
            feedbackText: {
              good: "Good wide stance for heading.",
              warning: "Widen your stance for better stability.",
              error: "Stance too narrow. Spread your feet more."
            }
          };
        }
      },
      coreEngagement: {
        measure: function(pose) {
          if (!pose[11] || !pose[12] || !pose[23] || !pose[24]) return null;
          const shoulderMidY = (pose[11].y + pose[12].y) / 2;
          const hipMidY = (pose[23].y + pose[24].y) / 2;
          const shoulderMidX = (pose[11].x + pose[12].x) / 2;
          const hipMidX = (pose[23].x + pose[24].x) / 2;
          // Back arch angle
          const torsoAngle = Math.atan2(hipMidY - shoulderMidY, hipMidX - shoulderMidX) * (180 / Math.PI);
          return {
            value: torsoAngle,
            idealRange: [75, 95],
            feedbackText: {
              good: "Good core drive for the header.",
              warning: "Drive more from your core.",
              error: "Use your core, not just your neck. Arch back and drive forward."
            }
          };
        }
      },
      followThrough: {
        measure: function(pose) {
          if (!pose[0] || !pose[11] || !pose[12]) return null;
          // Head position relative to shoulders (forward drive)
          const headX = pose[0].x;
          const shoulderMidX = (pose[11].x + pose[12].x) / 2;
          const headDrive = headX - shoulderMidX;
          return {
            value: Math.abs(headDrive),
            idealRange: [0, 0.08],
            feedbackText: {
              good: "Good heading motion.",
              warning: "Drive through the ball more.",
              error: "Attack the ball with your forehead. Drive forward."
            }
          };
        }
      }
    },
    repCountingStrategy: {
      states: ["waiting", "arch", "drive"],
      transitions: {
        waiting: [
          { to: "arch", condition: (metrics) => metrics.coreEngagement && metrics.coreEngagement.value < 80 }
        ],
        arch: [
          { to: "drive", condition: (metrics) => metrics.coreEngagement && metrics.coreEngagement.value > 85 }
        ],
        drive: [
          { to: "waiting", condition: (metrics) => metrics.coreEngagement && metrics.coreEngagement.value > 80 && metrics.coreEngagement.value < 95 }
        ]
      },
      countOn: "arch-to-drive",
      getRepQuality: function(fromState, toState) {
        if (fromState === "arch" && toState === "drive") return 1.0;
        return 0;
      }
    },
    formGuidance: [
      "Use a wide, staggered stance for stability",
      "Arch your back to load power, then drive forward",
      "Contact the ball with your forehead, not the top of your head",
      "Keep your eyes open and on the ball",
      "Drive from your core, not just your neck"
    ]
  },

  // 6. Volley Kick
  "Volley Kick": {
    primaryView: "Side",
    keyMetrics: ["hipMobility", "kneeAction", "balance"],
    metricImplementations: {
      hipMobility: {
        measure: function(pose) {
          if (!pose[12] || !pose[24] || !pose[26]) return null;
          const hipAngle = calculateAngle(
            { x: pose[12].x, y: pose[12].y },
            { x: pose[24].x, y: pose[24].y },
            { x: pose[26].x, y: pose[26].y }
          );
          return {
            value: hipAngle,
            idealRange: [100, 160],
            feedbackText: {
              good: "Good hip position for the volley.",
              warning: "Raise your knee higher.",
              error: "Knee not high enough. Lift your kicking knee higher."
            }
          };
        }
      },
      kneeAction: {
        measure: function(pose) {
          if (!pose[24] || !pose[26] || !pose[28]) return null;
          const kneeAngle = calculateAngle(
            { x: pose[24].x, y: pose[24].y },
            { x: pose[26].x, y: pose[26].y },
            { x: pose[28].x, y: pose[28].y }
          );
          return {
            value: kneeAngle,
            idealRange: [130, 170],
            feedbackText: {
              good: "Good knee snap on the volley.",
              warning: "More knee extension needed.",
              error: "Extend through the ball. Snap your knee."
            }
          };
        }
      },
      balance: {
        measure: function(pose) {
          if (!pose[11] || !pose[12] || !pose[15] || !pose[16]) return null;
          // Arms spread for balance
          const armSpread = Math.abs(pose[15].x - pose[16].x);
          return {
            value: armSpread,
            idealRange: [0.2, 0.6],
            feedbackText: {
              good: "Good use of arms for balance.",
              warning: "Spread your arms more for balance.",
              error: "Arms too close. Use them for balance."
            }
          };
        }
      }
    },
    repCountingStrategy: {
      states: ["waiting", "backswing", "follow_through"],
      transitions: {
        waiting: [
          { to: "backswing", condition: (metrics) => metrics.hipMobility && metrics.hipMobility.value < 120 }
        ],
        backswing: [
          { to: "follow_through", condition: (metrics) => metrics.kneeAction && metrics.kneeAction.value > 145 }
        ],
        follow_through: [
          { to: "waiting", condition: (metrics) => metrics.hipMobility && metrics.hipMobility.value > 150 }
        ]
      },
      countOn: "backswing-to-follow_through",
      getRepQuality: function(fromState, toState) {
        if (fromState === "backswing" && toState === "follow_through") return 1.0;
        return 0;
      }
    },
    formGuidance: [
      "Watch the ball carefully as it approaches",
      "Turn your body sideways for a more powerful strike",
      "Raise your kicking knee high before striking",
      "Lock your ankle at contact",
      "Use your arms for balance"
    ]
  },

  // 7. Throw-In
  "Throw-In": {
    primaryView: "Side",
    keyMetrics: ["stance", "coreEngagement", "balance"],
    metricImplementations: {
      stance: {
        measure: function(pose) {
          if (!pose[15] || !pose[16]) return null;
          // Check arm symmetry (both hands should be at similar height)
          const armHeightDiff = Math.abs(pose[15].y - pose[16].y);
          return {
            value: armHeightDiff,
            idealRange: [0, 0.05],
            feedbackText: {
              good: "Good arm symmetry for the throw.",
              warning: "Keep both hands at the same height.",
              error: "Uneven arms. Both hands must deliver equal force."
            }
          };
        }
      },
      coreEngagement: {
        measure: function(pose) {
          if (!pose[11] || !pose[12] || !pose[23] || !pose[24]) return null;
          const shoulderMidY = (pose[11].y + pose[12].y) / 2;
          const hipMidY = (pose[23].y + pose[24].y) / 2;
          const shoulderMidX = (pose[11].x + pose[12].x) / 2;
          const hipMidX = (pose[23].x + pose[24].x) / 2;
          const torsoAngle = Math.atan2(hipMidY - shoulderMidY, hipMidX - shoulderMidX) * (180 / Math.PI);
          return {
            value: torsoAngle,
            idealRange: [70, 110],
            feedbackText: {
              good: "Good back arch for power.",
              warning: "Arch your back more for extra distance.",
              error: "Not enough body involvement. Arch and drive forward."
            }
          };
        }
      },
      balance: {
        measure: function(pose) {
          if (!pose[27] || !pose[28]) return null;
          // Check feet are grounded (y-position similar)
          const footHeightDiff = Math.abs(pose[27].y - pose[28].y);
          return {
            value: footHeightDiff,
            idealRange: [0, 0.03],
            feedbackText: {
              good: "Feet properly grounded.",
              warning: "Keep both feet on the ground.",
              error: "Foot lifted! Both feet must stay on the ground for a legal throw."
            }
          };
        }
      }
    },
    repCountingStrategy: {
      states: ["waiting", "arms_back", "release"],
      transitions: {
        waiting: [
          { to: "arms_back", condition: (metrics) => {
            if (!metrics.stance) return false;
            return metrics.coreEngagement && metrics.coreEngagement.value < 80;
          }}
        ],
        arms_back: [
          { to: "release", condition: (metrics) => metrics.coreEngagement && metrics.coreEngagement.value > 90 }
        ],
        release: [
          { to: "waiting", condition: (metrics) => metrics.coreEngagement && metrics.coreEngagement.value > 80 && metrics.coreEngagement.value < 100 }
        ]
      },
      countOn: "arms_back-to-release",
      getRepQuality: function(fromState, toState) {
        if (fromState === "arms_back" && toState === "release") return 1.0;
        return 0;
      }
    },
    formGuidance: [
      "Hold the ball behind your head with both hands",
      "Keep both feet on the ground throughout the throw",
      "Arch your back to generate power",
      "Release the ball as it passes over your head",
      "Both hands must deliver equal force"
    ]
  },

  // 8. Goalkeeper Stance (continuous posture scoring)
  "Goalkeeper Stance": {
    primaryView: "Front",
    keyMetrics: ["stance", "balance", "coreEngagement"],
    metricImplementations: {
      stance: {
        measure: function(pose) {
          if (!pose[23] || !pose[24] || !pose[25] || !pose[26] || !pose[27] || !pose[28]) return null;
          const leftKnee = calculateAngle(
            { x: pose[23].x, y: pose[23].y },
            { x: pose[25].x, y: pose[25].y },
            { x: pose[27].x, y: pose[27].y }
          );
          const rightKnee = calculateAngle(
            { x: pose[24].x, y: pose[24].y },
            { x: pose[26].x, y: pose[26].y },
            { x: pose[28].x, y: pose[28].y }
          );
          const avgKnee = (leftKnee + rightKnee) / 2;
          return {
            value: avgKnee,
            idealRange: [130, 155],
            feedbackText: {
              good: "Good ready stance — knees properly bent.",
              warning: "Bend your knees more to be ready.",
              error: "Standing too upright. Drop into a lower stance."
            }
          };
        }
      },
      balance: {
        measure: function(pose) {
          if (!pose[27] || !pose[28]) return null;
          const stanceWidth = Math.abs(pose[27].x - pose[28].x);
          return {
            value: stanceWidth,
            idealRange: [0.15, 0.35],
            feedbackText: {
              good: "Good stance width.",
              warning: "Widen your stance slightly.",
              error: "Feet too close or too wide. Shoulder-width plus."
            }
          };
        }
      },
      coreEngagement: {
        measure: function(pose) {
          if (!pose[11] || !pose[12] || !pose[23] || !pose[24]) return null;
          const shoulderMidY = (pose[11].y + pose[12].y) / 2;
          const shoulderMidX = (pose[11].x + pose[12].x) / 2;
          const hipMidY = (pose[23].y + pose[24].y) / 2;
          const hipMidX = (pose[23].x + pose[24].x) / 2;
          const forwardLean = Math.abs(90 - Math.atan2(hipMidY - shoulderMidY, hipMidX - shoulderMidX) * (180 / Math.PI));
          return {
            value: forwardLean,
            idealRange: [5, 20],
            feedbackText: {
              good: "Good forward lean — ready to react.",
              warning: "Lean slightly more forward.",
              error: "Need more forward lean. Get on the balls of your feet."
            }
          };
        }
      }
    },
    repCountingStrategy: {
      states: ["waiting", "active"],
      transitions: {
        waiting: [
          { to: "active", condition: (metrics) => metrics.stance && metrics.stance.value < 160 }
        ],
        active: [
          { to: "waiting", condition: (metrics) => metrics.stance && metrics.stance.value > 170 }
        ]
      },
      countOn: "continuous",
      getRepQuality: function() { return 1.0; }
    },
    formGuidance: [
      "Feet slightly wider than shoulder-width",
      "Bend knees to 30-40 degrees",
      "Lean forward on the balls of your feet",
      "Hands at waist height, palms forward",
      "Stay light and ready to move in any direction"
    ]
  }
};

// Export the metrics and utility functions
export {
  baseMetrics,
  techniqueMetrics,
  techniqueMetrics as exerciseMetrics,
  calculateAngle,
  smoothAngle,
  smoothAngleFast,
  angularVelocity,
  peakAngularVelocity,
  determineFeedbackSeverity
};
