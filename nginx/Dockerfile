FROM node:22-alpine AS builder

WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ .
# Bundle only: the type check (npm run build) also checks test files that import backend
# code, which isn't in this image. CI runs the full type check and tests on every push.
RUN npx vite build

FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
