FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000 DATABASE_PATH=/data/expo.sqlite
WORKDIR /app
COPY deploy/build/server.mjs ./server.mjs
COPY public ./public
COPY deploy/backup.mjs ./backup.mjs
COPY drizzle/*.sql ./drizzle/
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
