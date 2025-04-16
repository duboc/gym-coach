const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables from .env file if present
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Enable CORS
app.use(cors());

// API endpoint to provide the Gemini API key
app.get('/api/config', (req, res) => {
  // Return the API key if it exists in environment variables
  const apiKey = process.env['gemini-apikey'] || '';
  res.json({ 
    apiKey: apiKey,
    hasApiKey: !!apiKey
  });
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Start nginx to serve static files
const { exec } = require('child_process');
exec('nginx -g "daemon off;" &', (error, stdout, stderr) => {
  if (error) {
    console.error(`Error starting nginx: ${error.message}`);
    return;
  }
  if (stderr) {
    console.error(`nginx stderr: ${stderr}`);
    return;
  }
  console.log(`nginx stdout: ${stdout}`);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
