# Use an official Node.js runtime as a base image
FROM node:16

# Install Redis
RUN apt-get update && apt-get install -y redis-server

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install npm dependencies (including express)
RUN npm install

# Copy the rest of the app
COPY . .

# Expose ports for both Redis and the backend server
EXPOSE 3000 6379

# Start Redis and the backend server
CMD redis-server --daemonize yes && node server.js
