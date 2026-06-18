FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

RUN sed -i '/^}$/i\    model/gltf+json                         gltf;' /etc/nginx/mime.types && \
    sed -i '/^}$/i\    model/gltf-binary                       glb;' /etc/nginx/mime.types

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
