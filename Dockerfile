# Use an official Node.js runtime as a base image
FROM node:16-slim

# Install Redis
RUN apt-get update && apt-get install -y redis-server && rm -rf /var/lib/apt/lists/*

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install npm dependencies
RUN npm install

# Copy the rest of the app
COPY . .

# Expose ports for both the backend server and Redis
EXPOSE 3001 6379

# Start Redis and Node.js using a simple script
CMD ["sh", "-c", "redis-server --bind 0.0.0.0 & node server.js"]