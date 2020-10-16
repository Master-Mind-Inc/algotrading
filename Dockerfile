FROM node:10.16.0-alpine as builder
COPY package.json /tmp/package.json
RUN cd /tmp && npm install


FROM node:10.16.0-alpine
COPY . /app
COPY --from=builder /tmp/node_modules /app/node_modules
RUN apk add --update \
    curl \
    && rm -rf /var/cache/apk/*
WORKDIR /app
EXPOSE 80
CMD node index.js