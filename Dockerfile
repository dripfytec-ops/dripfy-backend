FROM node:22-slim

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npx prisma generate
RUN ./node_modules/.bin/nest build
RUN ls -la dist/ && test -f dist/main.js && echo "BUILD OK - main.js EXISTS" || (echo "BUILD FAILED - dist/main.js MISSING" && exit 1)

ENV NODE_ENV=production

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && echo '=== INICIANDO NODE ===' && node dist/main 2>&1 || echo '=== NODE FALHOU COM CODIGO '$?'==='"]
