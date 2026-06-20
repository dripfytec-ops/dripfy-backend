FROM node:22-slim

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npx prisma generate
RUN ./node_modules/.bin/nest build
RUN ls -la dist/ && echo "BUILD OK"

ENV NODE_ENV=production

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
