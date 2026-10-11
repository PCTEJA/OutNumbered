FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
USER node
CMD ["npm", "start"]
