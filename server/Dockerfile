FROM node:22-alpine

WORKDIR /usr/src/app

# Install OpenSSL (required for Prisma on Alpine)
RUN apk add --no-cache openssl

COPY package*.json ./

COPY . .

# Reinstall dependencies to ensure Linux binaries (fixes Windows artifacts)
RUN rm -rf node_modules && npm install

# Accept the build argument passed from docker-compose
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}

RUN npx prisma generate
RUN npm run build
EXPOSE 3000

CMD ["/bin/sh", "-c", "npx prisma generate && node dist/server.js"]