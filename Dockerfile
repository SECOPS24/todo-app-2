FROM node:20-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
# Install production dependencies, then remove npm, npx and corepack: the app
# only needs the node binary at runtime, and the bundled npm carries known CVEs.
RUN npm ci --omit=dev \
 && npm cache clean --force \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /root/.npm

COPY server.js ./
COPY public ./public

EXPOSE 3000
USER node
CMD ["node", "server.js"]
