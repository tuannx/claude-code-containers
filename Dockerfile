# syntax=docker/dockerfile:1

FROM node:18-alpine AS base

# Install Python, pip, and git for Claude Code dependencies
RUN apk add --no-cache python3 py3-pip git

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Set destination for COPY
WORKDIR /app

# Copy package files first for better caching
COPY container_src/package*.json ./

# Install npm dependencies
RUN npm install

# Copy container source code
COPY container_src/ ./

EXPOSE 8080

# Run
CMD ["node", "main.js"]