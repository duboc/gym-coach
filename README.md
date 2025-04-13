# Fitness Tracker with MediaPipe

A web-based fitness tracking application that uses MediaPipe's Holistic model to track and analyze exercises in real-time.

## Features

- Real-time pose detection using MediaPipe Holistic
- List of common exercises with instructions
- Visual feedback for exercise form
- Rep counting and exercise tracking

## Prerequisites

- Modern web browser (Chrome, Firefox, Edge, etc.)
- Webcam
- Internet connection (for loading MediaPipe models)

## Getting Started

1. Clone this repository:
   ```
   git clone https://github.com/your-username/gym-coach.git
   cd gym-coach
   ```

2. Start a local server:
   You can use any local server. Here are a few options:

   Using Python:
   ```
   # Python 3.x
   python -m http.server
   
   # Python 2.x
   python -m SimpleHTTPServer
   ```

   Using Node.js (after installing http-server):
   ```
   npx http-server
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:8000/
   ```

## How to Use

1. Click on "Start Camera" to enable your webcam.
2. Select an exercise from the list on the right.
3. Follow the instructions for the selected exercise.
4. Click "Start Exercise" to begin tracking.
5. Perform the exercise while following proper form as shown on screen.

## Supported Exercises

- Dumbbell Bicep Curls
- Dumbbell Shoulder Press
- Dumbbell Lateral Raises
- Dumbbell Bent-Over Rows
- Dumbbell Chest Flyes
- Dumbbell Tricep Extensions
- Dumbbell Lunges
- Dumbbell Russian Twists

## Technologies Used

- [MediaPipe](https://mediapipe.dev/) - For real-time pose detection
- HTML5 Canvas - For visualization
- Vanilla JavaScript - For application logic

## Future Improvements

- Advanced exercise form analysis
- Custom exercise creation
- Exercise history and progress tracking
- Support for more exercises
- Mobile app version

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- MediaPipe team for their incredible computer vision toolset
- Fitness experts for exercise form guidance 