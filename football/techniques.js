// List of football techniques with details
const techniques = [
  {
    id: 1,
    name: "Instep Kick",
    description: "A powerful kick using the top of the foot (laces), ideal for long-range shots and passes.",
    difficulty: "Intermediate",
    targetMuscles: ["Quadriceps", "Hip Flexors", "Core", "Glutes"],
    instructions: [
      "Plant your non-kicking foot alongside the ball, toes pointed at target",
      "Swing your kicking leg back with knee bent",
      "Drive your leg forward, extending through the ball",
      "Strike the ball with the laces (top of the foot)",
      "Lock your ankle and point your toes down",
      "Follow through toward the target with your kicking leg"
    ],
    rep_count: 0,
    rep_goal: 10,
    keypoints: {
      plant_foot: { description: "Plant foot should be beside the ball, toes aimed at target" },
      hip_flexion: { description: "Drive from the hip for power" },
      ankle_lock: { description: "Ankle must be locked, toes pointed down" }
    }
  },
  {
    id: 2,
    name: "Inside Foot Pass",
    description: "The most accurate pass in football, using the inside of the foot for short to medium range.",
    difficulty: "Beginner",
    targetMuscles: ["Hip Adductors", "Quadriceps", "Core"],
    instructions: [
      "Plant your non-kicking foot next to the ball",
      "Turn your kicking foot outward 90 degrees",
      "Strike the center of the ball with the inside of your foot",
      "Push through the ball toward your target",
      "Keep your body over the ball for a ground pass",
      "Follow through in the direction of the pass"
    ],
    rep_count: 0,
    rep_goal: 15,
    keypoints: {
      foot_angle: { description: "Kicking foot turned 90 degrees outward" },
      contact_point: { description: "Strike with the arch/inside of the foot" },
      follow_through: { description: "Follow through toward your target" }
    }
  },
  {
    id: 3,
    name: "Outside Foot Pass",
    description: "A deceptive pass using the outside of the foot, useful for quick play and disguising intent.",
    difficulty: "Advanced",
    targetMuscles: ["Hip Abductors", "Quadriceps", "Ankle Stabilizers"],
    instructions: [
      "Approach the ball at a slight angle",
      "Plant your support foot slightly behind the ball",
      "Strike the ball with the outside of your foot",
      "Rotate your ankle inward as you make contact",
      "Use a whipping motion from the knee",
      "Follow through across your body"
    ],
    rep_count: 0,
    rep_goal: 10,
    keypoints: {
      approach_angle: { description: "Approach the ball at a slight angle" },
      ankle_rotation: { description: "Ankle rotates inward on contact" },
      knee_whip: { description: "Whipping motion from the knee" }
    }
  },
  {
    id: 4,
    name: "Dribbling Posture",
    description: "Proper body posture and ball control while dribbling at various speeds.",
    difficulty: "Beginner",
    targetMuscles: ["Core", "Quadriceps", "Calves", "Hip Flexors"],
    instructions: [
      "Keep your knees slightly bent for agility",
      "Lean your torso slightly forward",
      "Keep your head up to survey the field",
      "Arms out slightly for balance",
      "Touch the ball with soft, controlled touches",
      "Maintain a low center of gravity"
    ],
    rep_count: 0,
    rep_goal: 30,
    keypoints: {
      knee_bend: { description: "Knees bent at 20-30 degrees for agility" },
      torso_lean: { description: "Slight forward lean, 10-15 degrees" },
      head_position: { description: "Head up, eyes forward" }
    }
  },
  {
    id: 5,
    name: "Heading Technique",
    description: "Proper technique for heading the ball using the forehead, with power from core and neck.",
    difficulty: "Intermediate",
    targetMuscles: ["Neck", "Core", "Back", "Legs"],
    instructions: [
      "Position yourself under the ball's flight path",
      "Stand with feet shoulder-width apart, one foot slightly forward",
      "Arch your back slightly to generate power",
      "Drive forward from your core, not just your neck",
      "Contact the ball with your forehead",
      "Follow through in the direction you want the ball to go"
    ],
    rep_count: 0,
    rep_goal: 10,
    keypoints: {
      stance: { description: "Wide base with staggered feet" },
      back_arch: { description: "Slight back arch to load power" },
      contact_point: { description: "Contact with the forehead, eyes open" }
    }
  },
  {
    id: 6,
    name: "Volley Kick",
    description: "Striking the ball out of the air before it bounces, requiring precise timing and technique.",
    difficulty: "Advanced",
    targetMuscles: ["Quadriceps", "Hip Flexors", "Core", "Calves"],
    instructions: [
      "Watch the ball carefully as it approaches",
      "Position your body sideways to the ball",
      "Raise your kicking knee high",
      "Time your swing to meet the ball in the air",
      "Lock your ankle and strike with the laces",
      "Keep your body balanced with arms out"
    ],
    rep_count: 0,
    rep_goal: 8,
    keypoints: {
      timing: { description: "Precise timing to meet the ball in the air" },
      body_position: { description: "Sideways body position for power" },
      knee_height: { description: "Kicking knee raised high before strike" }
    }
  },
  {
    id: 7,
    name: "Throw-In",
    description: "Proper technique for a legal throw-in, delivering the ball back into play from the sideline.",
    difficulty: "Beginner",
    targetMuscles: ["Shoulders", "Core", "Back", "Arms"],
    instructions: [
      "Hold the ball with both hands behind your head",
      "Keep both feet on or behind the touchline",
      "Arch your back to generate power",
      "Bring the ball forward over your head with both hands",
      "Release the ball as it passes over your head",
      "Both feet must remain on the ground during the throw"
    ],
    rep_count: 0,
    rep_goal: 10,
    keypoints: {
      arm_symmetry: { description: "Both hands deliver equal force" },
      ball_position: { description: "Ball must go behind the head" },
      feet_grounded: { description: "Both feet must stay on the ground" }
    }
  },
  {
    id: 8,
    name: "Goalkeeper Stance",
    description: "The ready position for goalkeepers, optimizing reaction time and movement in any direction.",
    difficulty: "Beginner",
    targetMuscles: ["Quadriceps", "Calves", "Core", "Shoulders"],
    instructions: [
      "Stand with feet slightly wider than shoulder-width",
      "Bend your knees to about 30-40 degrees",
      "Lean slightly forward on the balls of your feet",
      "Hold hands at waist height, palms facing forward",
      "Keep your head steady and eyes on the ball",
      "Stay light on your feet, ready to move"
    ],
    rep_count: 0,
    rep_goal: 20,
    keypoints: {
      stance_width: { description: "Feet wider than shoulder-width" },
      knee_bend: { description: "Knees bent 30-40 degrees" },
      weight_distribution: { description: "Weight on balls of feet" }
    }
  }
];

// Export both as default export and named export for compatibility
export default techniques;
export { techniques };
