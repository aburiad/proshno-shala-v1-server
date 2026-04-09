# FROM node:18-slim

# WORKDIR /app

# COPY package*.json ./
# RUN npm install --omit=dev

# COPY . .

# ENV PORT=8080

# EXPOSE 8080

# CMD ["node", "src/index.js"]


FROM ghcr.io/puppeteer/puppeteer:latest

WORKDIR /app

# copy first, then fix permissions
COPY package*.json ./

# fix permissions
USER root
RUN chown -R pptruser:pptruser /app

USER pptruser
RUN npm install --omit=dev

COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/index.js"]