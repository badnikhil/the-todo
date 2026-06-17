# Build stage
FROM node:latest AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
# We build the application. The .env file with VITE_API_URL=http://localhost:8000 
# will be used, which is correct since the browser will make the requests to localhost.
RUN npm run build

# Production stage
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
