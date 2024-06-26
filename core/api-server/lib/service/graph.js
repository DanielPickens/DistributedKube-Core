const orderBy = require('lodash.orderby');
const { Persistency } = require('@distributedkube/dag');
const validator = require('../validation/api-validator');
const { ResourceNotFoundError } = require('../errors');

class GraphService {
    async init(options) {
        this._persistency = new Persistency();
        await this._persistency.init({ connection: options.db });
    }

    async setGraph({ jobId, data }) {
        return this._persistency.setGraph({ jobId, data });
    }

    async getGraphRaw(options) {
        validator.jobs.validateJobID(options);
        const { jobId } = options;
        const graph = await this._persistency.getGraph({ jobId });
        if (!graph) {
            throw new ResourceNotFoundError('graph', jobId);
        }
        return graph;
    }

    async getGraphParsed(options) {
        validator.graphs.validateGraphQuery(options);
        const { jobId, node, sort, order, from, to } = options;
        const graph = await this._persistency.getGraph({ jobId });
        if (!graph) {
            throw new ResourceNotFoundError('graph', jobId);
        }
        if (node) {
            graph.nodes = graph.nodes.filter(n => n.nodeName === node);
            graph.edges = graph.edges.filter(n => n.from === node || n.to === node);
            if (graph.nodes.length === 0) {
                throw new ResourceNotFoundError('node', node);
            }
        }
        graph.nodes = graph.nodes.map((n) => {
            let batch;
            if (n.batch) {
                batch = orderBy(n.batch, sort, order);
                batch = batch.slice(from, to);
            }
            return { ...n, batch };
        });
        return graph;
    }
}

module.exports = new GraphService();
