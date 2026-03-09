// List of exercises with details
const exercises = [
  {
    id: 1,
    name: "Dumbbell Bicep Curls",
    description: "An isolation exercise that primarily targets the biceps brachii muscle.",
    difficulty: "Beginner",
    targetMuscles: ["Biceps", "Forearms"],
    instructions: [
      "Stand with feet shoulder-width apart, holding a dumbbell in each hand",
      "Keep your elbows close to your torso and palms facing forward",
      "Keeping your upper arms stationary, curl the weights upward toward your shoulders",
      "Squeeze your biceps at the top of the movement",
      "Slowly lower the weights back to the starting position",
      "Repeat for the desired number of repetitions"
    ],
    rep_count: 0,
    rep_goal: 12,
    keypoints: {
      elbow_position: {
        description: "Elbows should remain close to the sides of your body"
      },
      wrist_position: {
        description: "Wrists should remain straight throughout the movement"
      },
      upper_arm_movement: {
        description: "Upper arms should remain stationary"
      }
    }
  },
  {
    id: 2,
    name: "Dumbbell Shoulder Press",
    description: "A compound exercise that targets the deltoids, triceps, and upper chest.",
    difficulty: "Intermediate",
    targetMuscles: ["Shoulders", "Triceps", "Upper Chest"],
    instructions: [
      "Sit on a bench with back support or stand with feet shoulder-width apart",
      "Hold a dumbbell in each hand at shoulder height with palms facing forward",
      "Push the dumbbells upward until your arms are fully extended overhead",
      "Pause briefly at the top",
      "Slowly lower the weights back to shoulder level",
      "Repeat for the desired number of repetitions"
    ],
    rep_count: 0,
    rep_goal: 10,
    keypoints: {
      shoulder_alignment: {
        description: "Shoulders should be directly under the weights at the top"
      },
      elbow_angle: {
        min: 170,
        max: 180,
        description: "Arms should be almost fully extended at the top"
      },
      back_position: {
        description: "Maintain a neutral spine throughout the movement"
      }
    }
  },
  {
    id: 3,
    name: "Dumbbell Lateral Raises",
    description: "An isolation exercise that specifically targets the lateral deltoids for broader shoulders.",
    difficulty: "Beginner",
    targetMuscles: ["Shoulders", "Deltoids"],
    instructions: [
      "Stand with feet shoulder-width apart, holding a dumbbell in each hand",
      "Keep your arms straight with a slight bend in the elbows",
      "Raise the dumbbells out to the sides until they reach shoulder level",
      "Maintain a slight bend in the elbows throughout the movement",
      "Pause briefly at the top",
      "Slowly lower the dumbbells back to the starting position",
      "Repeat for the desired number of repetitions"
    ],
    rep_count: 0,
    rep_goal: 12,
    keypoints: {
      arm_position: {
        description: "Arms should maintain a slight bend throughout"
      },
      raise_height: {
        description: "Raise the dumbbells to shoulder height at maximum"
      },
      shoulder_rotation: {
        description: "Thumbs should be slightly higher than pinkies (slight external rotation)"
      }
    }
  },
  {
    id: 4,
    name: "Dumbbell Bent-Over Rows",
    description: "A compound exercise that targets the back muscles, particularly the latissimus dorsi and rhomboids.",
    difficulty: "Intermediate",
    targetMuscles: ["Back", "Lats", "Rhomboids", "Biceps"],
    instructions: [
      "Stand with feet shoulder-width apart, holding a dumbbell in each hand",
      "Hinge at the hips and bend forward, keeping your back flat",
      "Let your arms hang straight down with palms facing each other",
      "Pull the dumbbells up towards your lower ribs, keeping elbows close to body",
      "Squeeze your shoulder blades together at the top",
      "Slowly lower the weights back to the starting position",
      "Repeat for the desired number of repetitions"
    ],
    rep_count: 0,
    rep_goal: 12,
    keypoints: {
      back_position: {
        description: "Back should remain flat throughout the movement, not rounded"
      },
      elbow_path: {
        description: "Elbows should travel backwards, not outwards"
      },
      shoulder_blades: {
        description: "Shoulder blades should squeeze together at the top of the movement"
      }
    }
  },
  {
    id: 5,
    name: "Dumbbell Chest Flyes",
    description: "An isolation exercise that targets the chest muscles and assists in building chest width.",
    difficulty: "Intermediate",
    targetMuscles: ["Chest", "Shoulders"],
    instructions: [
      "Lie flat on a bench holding a dumbbell in each hand",
      "Extend your arms above your chest with palms facing each other",
      "With a slight bend in your elbows, lower the weights in an arc motion to the sides",
      "Lower until you feel a stretch in your chest muscles",
      "Return to the starting position by squeezing your chest muscles",
      "Repeat for the desired number of repetitions"
    ],
    rep_count: 0,
    rep_goal: 10,
    keypoints: {
      elbow_bend: {
        description: "Maintain a slight bend in the elbows throughout"
      },
      movement_path: {
        description: "Arms should move in an arc motion, not straight up and down"
      },
      range_of_motion: {
        description: "Lower until you feel a stretch in your chest, typically when arms are parallel to the floor"
      }
    }
  },
  {
    id: 6,
    name: "Dumbbell Tricep Extensions",
    description: "An isolation exercise that targets the triceps muscles on the back of the upper arm.",
    difficulty: "Beginner",
    targetMuscles: ["Triceps"],
    instructions: [
      "Stand or sit with feet shoulder-width apart, holding a dumbbell with both hands",
      "Raise the dumbbell overhead with both hands, arms fully extended",
      "Keeping your upper arms stationary, bend your elbows to lower the weight behind your head",
      "Extend your arms back up to the starting position by contracting your triceps",
      "Repeat for the desired number of repetitions"
    ],
    rep_count: 0,
    rep_goal: 12,
    keypoints: {
      elbow_position: {
        description: "Elbows should point forward and stay close to the head"
      },
      upper_arm_position: {
        description: "Upper arms should remain vertical and stationary"
      },
      range_of_motion: {
        description: "Lower the weight until your forearms are just beyond parallel to the floor"
      }
    }
  },
  {
    id: 7,
    name: "Dumbbell Lunges",
    description: "A compound exercise that works the quadriceps, hamstrings, and glutes while holding dumbbells for added resistance.",
    difficulty: "Intermediate",
    targetMuscles: ["Quadriceps", "Hamstrings", "Glutes", "Core"],
    instructions: [
      "Stand with feet hip-width apart, holding a dumbbell in each hand at your sides",
      "Take a step forward with one leg",
      "Lower your body by bending both knees to about 90 degrees",
      "Front knee should be over ankle, not past toes",
      "Back knee should hover just above the ground",
      "Push through front heel to return to starting position",
      "Repeat with the other leg"
    ],
    rep_count: 0,
    rep_goal: 10,
    keypoints: {
      front_knee_angle: {
        min: 80,
        max: 100,
        description: "Front knee should be at roughly 90 degrees"
      },
      front_knee_alignment: {
        description: "Front knee should be aligned with ankle, not past toes"
      },
      torso_position: {
        description: "Torso should remain upright throughout the movement"
      }
    }
  },
  {
    id: 8,
    name: "Dumbbell Russian Twists",
    description: "A core exercise that targets the obliques and helps build rotational strength.",
    difficulty: "Beginner",
    targetMuscles: ["Obliques", "Abdominals", "Lower Back"],
    instructions: [
      "Sit on the floor with knees bent and feet elevated slightly",
      "Hold a dumbbell with both hands in front of your chest",
      "Lean back slightly to create a V-shape with your torso and thighs",
      "Rotate your torso to the right, bringing the dumbbell beside your hip",
      "Rotate to the left side in the same manner",
      "Each rotation to both sides counts as one repetition"
    ],
    rep_count: 0,
    rep_goal: 20,
    keypoints: {
      back_position: {
        description: "Back should remain straight, not rounded"
      },
      rotation_source: {
        description: "Rotation should come from the torso, not just the arms"
      },
      balance: {
        description: "Maintain balance and stability throughout the movement"
      }
    }
  }
];

// Export both as default export and named export for compatibility
export default exercises;
export { exercises }; 