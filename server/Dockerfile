FROM node:24-alpine

WORKDIR /usr/src/app

# Install OpenSSL (required for Prisma on Alpine)
RUN apk add --no-cache openssl

COPY package*.json ./

RUN npm install

COPY . .

# fake value ONLY for prisma generate
ENV DATABASE_URL=postgresql://user:pass@localhost:5432/db

RUN npm run prisma:generate
RUN npm run build:docker

EXPOSE 3000

CMD ["/bin/sh", "-c", "node", " dist/server.js"]