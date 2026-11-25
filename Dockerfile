# syntax=docker/dockerfile:1
# The NodeGSM website: pages and the community API (ratings, comments, activity feed, download counters, submissions) in one Node server.
# No dependencies to install: plain Node. Build context = this repository.
#
#   docker compose up -d --build        (http://localhost:3013)
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3013 \
    DATA_DIR=/data
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
# /data holds community.json (ratings, comments, feed, submissions). It must be a volume or everything is lost on update.
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME /data
USER node
EXPOSE 3013
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/server.js"]
