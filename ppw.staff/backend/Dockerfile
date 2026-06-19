FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
COPY dist ./dist
# Install only production dependencies (dist already present so postinstall skips nest build)
RUN npm ci --only=production

COPY .env ./

CMD ["node", "dist/src/main.js"]
