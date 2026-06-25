FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
RUN npm install

FROM deps AS build
COPY apps/api apps/api
WORKDIR /app/apps/api
RUN npm run prisma:generate
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/package.json package.json
COPY --from=build /app/apps/api/dist dist
COPY --from=build /app/apps/api/prisma prisma
EXPOSE 3000
CMD ["node", "dist/index.js"]
