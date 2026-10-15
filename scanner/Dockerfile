FROM clamav/clamav:stable

USER root
RUN apk add --no-cache nodejs
WORKDIR /app
COPY container/server.mjs ./server.mjs
ENV CLAMAV_NO_MILTERD=true
EXPOSE 8080
CMD ["node", "/app/server.mjs"]
