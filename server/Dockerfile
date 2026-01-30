FROM node:24-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

# Assuming you have a build script in package.json that compiles TS to JS
RUN npm run build

EXPOSE 3000

# Update the path below to match your compiled output location (e.g., dist/server.js)
CMD ["node", "dist/server.js"]