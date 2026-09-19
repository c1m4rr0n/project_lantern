FROM node:22-slim
WORKDIR /app
COPY . .
ENV NODE_ENV=production \
    PORT=8787 \
    DATA_ROOT=/data \
    STORAGE_DRIVER=sqlite \
    COOKIE_SECURE=true
RUN mkdir -p /data && chown -R node:node /app /data
USER node
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node","-e","fetch('http://127.0.0.1:8787/api/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["npm","start"]
