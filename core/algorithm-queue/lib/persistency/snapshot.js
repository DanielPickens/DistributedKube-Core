const now = require('performance-now');
const storageManager = require('@distributedkube/storage-manager');
const TYPE = 'algorithmQueue';

class Snapshot {
    async store({ key, data, onStart, onEnd, onError }) {
        try {
            const start = now();
            onStart({ key, length: data.length });
            await storageManager.distributedkubePersistency.put({ type: TYPE, name: key, data });
            const end = now();
            const timeTook = (end - start).toFixed(3);
            onEnd({ key, length: data.length, timeTook });
        }
        catch (e) {
            onError({ key, length: data.length, error: e.message });
        }
    }

    async get({ key, onStart, onEnd, onError, initial }) {
        let data;
        try {
            const start = now();
            onStart({ key });
            data = await storageManager.distributedkubePersistency.get({ type: TYPE, name: key });
            const end = now();
            const timeTook = (end - start).toFixed(3);
            onEnd({ key, timeTook });
        }
        catch (e) {
            const level = initial ? 'warning' : 'error';
            onError({ key, error: e.message, level });
        }
        return data;
    }
}

module.exports = new Snapshot();
