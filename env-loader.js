// Simple utility to load environment variables from .env file
function loadEnv() {
  console.log('Loading environment variables from .env file...');
  
  // Use Promise to handle both fetch method and fallback
  return new Promise((resolve) => {
    // First try to fetch the .env file
    fetch('.env')
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to load .env file: ${response.status} ${response.statusText}`);
        }
        return response.text();
      })
      .then(data => {
        if (!data) {
          throw new Error('No data found in .env file');
        }
        
        console.log('Successfully loaded .env file');
        const env = {};
        data.split('\n').forEach(line => {
          if (line && !line.startsWith('#')) {
            const [key, value] = line.split('=');
            if (key && value) {
              env[key.trim()] = value.trim();
              console.log(`Loaded env variable: ${key.trim()}`);
            }
          }
        });
        resolve(env);
      })
      .catch(error => {
        console.warn('Error loading .env file:', error);
        console.warn('Using fallback environment values');
        
        // Fallback: return hardcoded environment variables
        // In a real app, you might try alternative methods like local storage
        resolve({
          'gemini-apikey': 'AIzaSyBQ-WyMzirG-wMR0tTmI0VV68BTdpIN7j0'
        });
      });
  });
}

// Export the loadEnv function
export { loadEnv }; 