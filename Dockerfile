FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
  ffmpeg \
  python3 \
  python3-pip \
  curl \
  wget \
  chromium \
  ca-certificates \
  fonts-liberation \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libgdk-pixbuf2.0-0 \
  libnspr4 \
  libnss3 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  xdg-utils \
  --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN pip3 install yt-dlp --break-system-packages

# Install Higgsfield CLI
RUN npm install -g @higgsfield/cli

# Set working directory
WORKDIR /app

# Copy package files for layer-caching — install before copying source
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/
COPY remotion/package*.json ./remotion/

# Install all dependencies
RUN npm install --prefix server
RUN npm install --prefix client
RUN npm install --prefix remotion

# Copy source code
COPY . .

# Build React client
RUN npm run build --prefix client

# Create required directories for mounted volumes
RUN mkdir -p projects \
             library/clips \
             library/music \
             library/ambient \
             library/stings \
             library/overlay-sounds \
             remotion/public/clips

# Chromium path for Remotion headless render on Linux
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "server/index.js"]
