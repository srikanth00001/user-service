# Use Node 20-slim for NestJS compatibility
FROM node:20-slim

# Install build tools for bcrypt/node-gyp
RUN apt-get update && apt-get install -y python3 make g++ \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files for caching
COPY package*.json ./

# Install dependencies (production only) and Nest CLI
RUN npm install && npm install -g @nestjs/cli

# Copy all source code
COPY . .

# Build NestJS project
RUN npm run build

ENV PORT=3004


# Expose service port (change per service)
EXPOSE 3004

# Start the built app
CMD ["node", "dist/main.js"]
