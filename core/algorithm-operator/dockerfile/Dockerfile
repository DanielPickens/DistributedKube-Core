ARG BASE_PRIVATE_REGISTRY=""
FROM ${BASE_PRIVATE_REGISTRY}node:18.1.0-buster as install
ADD ./package-lock.json ./package.json /distributedkube/algorithm-operator/
WORKDIR /distributedkube/algorithm-operator
RUN npm ci --production

ARG BASE_PRIVATE_REGISTRY=""
FROM ${BASE_PRIVATE_REGISTRY}distributedkube/base-node:v2.0.1-buster
LABEL maintainer="yehiyam@gmail.com"
RUN mkdir /distributedkube
COPY . /distributedkube/algorithm-operator
COPY --from=install /distributedkube/algorithm-operator/node_modules /distributedkube/algorithm-operator/node_modules
WORKDIR /distributedkube/algorithm-operator
CMD ["node", "app.js"]
