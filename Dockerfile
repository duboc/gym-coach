FROM node:18.2-alpine

# Install nginx
RUN apk add --no-cache nginx

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install --production

# Create public directory for static files
RUN mkdir -p public

# Copy static files to public directory
COPY index.html public/
COPY styles.css public/
COPY script.js public/
COPY favicon.ico public/
COPY *.js public/
COPY memory-bank public/memory-bank

# Copy server files
COPY server.js ./

# Copy nginx configuration
COPY nginx.conf /etc/nginx/http.d/default.conf

# Expose port 8080 (Cloud Run default)
EXPOSE 8080

# Start the server
CMD ["npm", "start"]
