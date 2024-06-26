const fse = require('fs-extra');
const path = require('path');
const RestServer = require('@distributedkube/rest-server');
const log = require('@distributedkube/logger').GetLogFromContanier();
const { metrics } = require('@distributedkube/metrics');
const HttpStatus = require('http-status-codes');
const validator = require('../../lib/validation');
const component = require('../../lib/consts/componentNames').REST_API;
const rest = new RestServer();
const routeLogBlacklist = ['/metrics'];

class AppServer {
    async init(options) {
        rest.on('error', data => {
            const error = data.error || data.message || {};
            const { route, jobId, pipelineName } = (data.res && data.res._internalMetadata) || {};
            const status = data.status || data.code;
            if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
                log.error(`Error response, status=${status}, message=${error}`, { component, route, jobId, pipelineName, httpStatus: status });
            }
            else {
                log.info(`status=${status}, message=${error}`, { component, route, jobId, pipelineName, httpStatus: status, });
            }
        });

        const swagger = await fse.readJSON('api/rest-api/swagger.json');
        const { prefix, port, rateLimit, poweredBy, bodySizeLimit } = options.rest;
        const versions = await fse.readdir(path.join(__dirname, 'routes'));
        const routes = [];

        await Promise.all(versions.map(async (v) => {
            const routers = await fse.readdir(path.join(__dirname, 'routes', v));
            routers.forEach((f) => {
                const file = path.basename(f, '.js');
                routes.push({
                    route: path.join('/', prefix, v, file),
                    router: require('./' + path.join('routes', v, file))({ ...options, version: v, file })  // eslint-disable-line
                });
            });
        }));

        validator.init(swagger.components.schemas);

        const { beforeRoutesMiddlewares, afterRoutesMiddlewares } = metrics.getMiddleware();

        const opt = {
            routes,
            prefix,
            versions,
            port: parseInt(port, 10),
            rateLimit,
            poweredBy,
            bodySizeLimit,
            name: options.serviceName,
            beforeRoutesMiddlewares,
            afterRoutesMiddlewares,
            logger: {
                filterRoutes: routeLogBlacklist,
                onResponse: (data) => {
                    const { method, url, status, duration } = data;
                    log.info(`${method}:${url} ${status} ${duration}ms`, { component, route: url, httpStatus: status });
                }
            }
        };
        const data = await rest.start(opt);
        log.info(`🚀 ${data.message}`, { component });
    }
}

module.exports = new AppServer();
