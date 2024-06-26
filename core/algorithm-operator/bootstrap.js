const configIt = require('@distributedkube/config');
const Logger = require('@distributedkube/logger');
const { rest: healthcheck } = require('@distributedkube/healthchecks');
const { main, logger } = configIt.load();
const log = new Logger(main.serviceName, logger);
const component = require('./lib/consts/componentNames').MAIN;
const db = require('./lib/helpers/db');
const etcd = require('./lib/helpers/etcd');
const kubernetes = require('./lib/helpers/kubernetes');
const operator = require('./lib/operator');
const jobsMessageQueue = require('./lib/helpers/jobs-message-queue');
const { setFromConfig } = require('./lib/helpers/settings');

const modules = [
    db,
    etcd,
    kubernetes,
    operator,
    jobsMessageQueue
];

class Bootstrap {
    async init() {
        try {
            this._handleErrors();
            log.info(`running application with env: ${configIt.env()}, version: ${main.version}, node: ${process.versions.node}`, { component });
            setFromConfig(main);
            for (const m of modules) {
                await m.init(main);  // eslint-disable-line
            }
            await healthcheck.init({ port: main.healthchecks.port });
            healthcheck.start(main.healthchecks.path, () => operator.checkHealth(main.healthchecks.maxDiff), 'health');
        }
        catch (error) {
            this._onInitFailed(error);
        }
        return main;
    }

    _onInitFailed(error) {
        log.error(error.message, { component }, error);
        process.exit(1);
    }

    _handleErrors() {
        process.on('exit', (code) => {
            log.info(`exit code ${code}`, { component });
        });
        process.on('SIGINT', () => {
            log.info('SIGINT', { component });
            process.exit(0);
        });
        process.on('SIGTERM', () => {
            log.info('SIGTERM', { component });
            process.exit(0);
        });
        process.on('unhandledRejection', (error) => {
            log.error(`unhandledRejection: ${error.message}`, { component }, error);
            process.exit(1);
        });
        process.on('uncaughtException', (error) => {
            log.error(`uncaughtException: ${error.message}`, { component }, error);
            process.exit(1);
        });
    }
}

module.exports = new Bootstrap();
