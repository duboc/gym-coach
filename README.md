# Fitness Tracker with MediaPipe

A web-based fitness tracking application that uses MediaPipe's Holistic model to track and analyze exercises in real-time, with AI-powered feedback via Google's Gemini API.

## Features

- Real-time pose detection using MediaPipe Holistic
- List of common exercises with instructions
- Visual feedback for exercise form
- Rep counting and exercise tracking
- AI-powered exercise feedback with Google's Gemini API

## Prerequisites

- Modern web browser (Chrome, Firefox, Edge, etc.)
- Webcam
- Internet connection (for loading MediaPipe models and Gemini API)
- Gemini API key (free from Google AI Studio)

## Getting Started

1. Clone this repository:
   ```
   git clone https://github.com/your-username/gym-coach.git
   cd gym-coach
   ```

2. Create a `.env` file in the root directory with your Gemini API key:
   ```
   gemini-apikey=YOUR_API_KEY_HERE
   ```
   
   You can get a free Gemini API key from [Google AI Studio](https://aistudio.google.com/).

3. Start a local server:
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
   
   Or use the provided script:
   ```
   chmod +x run.sh
   ./run.sh
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:8000/
   ```

## How to Use

1. Click on "Start Camera" to enable your webcam.
2. Select an exercise from the list on the right.
3. Follow the instructions for the selected exercise.
4. Click "Start Exercise" to begin tracking.
5. Perform the exercise while following proper form as shown on screen.
6. Receive AI-powered feedback on your form every 30 seconds.

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
- [Google Gemini API](https://ai.google.dev/) - For AI-powered exercise feedback

## Future Improvements

- Advanced exercise form analysis
- Custom exercise creation
- Exercise history and progress tracking
- Support for more exercises
- Mobile app version

## License

This project is licensed under the Apache 2.0 License - see the LICENSE file for details.

## Acknowledgements

- MediaPipe team for their incredible computer vision toolset
<<<<<<< HEAD
- Google AI for the Gemini API
- Fitness experts for exercise form guidance 
=======
- Fitness experts for exercise form guidance 
>>>>>>> a846c6aed6b88b0b1870448ad5700f6d256e7f16
