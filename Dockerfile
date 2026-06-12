FROM oven/bun:alpine
WORKDIR /app

# Copy the standalone app + its static server.
COPY teleprompter.html teleprompter.js serve.ts ./

ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/health || exit 1

CMD ["bun", "serve.ts"]
