const { expect } = require('chai');
const delay = require('await-delay');
const { uid: uuidv4 } = require('@distributedkube/uid');
const { pipelines } = require('./mock/index');
const bootstrap = require('../bootstrap');
const queueRunner = require('../lib/queue-runner');
const producerLib = require('../lib/jobs/producer')
const dataStore = require('../lib/persistency/data-store');
let preferredService = require('../lib/service/preferred-jobs');

const heuristicStub = score => job => ({ ...job })
let getActiveFromRedisOriginal = null;
describe('Concurrency', () => {
    beforeEach(async () => {
        queueRunner.queue.queue = [];
        producerLib._isConsumerActive = true;
        getActiveFromRedisOriginal = producerLib._concurrencyHandler.getJobCountsFromRedis;
        queueRunner.queue.updateHeuristic({ run: heuristicStub() });
    });
    afterEach(async () => {
        queueRunner.queue.updateHeuristic(queueRunner.heuristicRunner);
        producerLib._concurrencyHandler.getJobCountsFromRedis = getActiveFromRedisOriginal;

    });
    describe('concurrency', () => {
        it('should found and disable concurrent exceeded jobs', async () => {
            const jobs = 10;
            const pipelineName = 'pipeline-concurrent';
            const experimentName = 'experiment-concurrent'
            const pipeline = pipelines.find(p => p.name === pipelineName);
            await dataStore._db.pipelines.patch(pipeline);

            let redisJobCount = 1
            producerLib._concurrencyHandler.getJobCountsFromRedis = async () => ({
                [pipelineName]: redisJobCount
            })
            for (let i = 0; i < jobs; i++) {
                const job = {
                    jobId: uuidv4(),
                    maxExceeded: i > 0,
                    done: () => { },
                    pipelineName,
                    experimentName,
                    priority: 3,
                    entranceTime: Date.now(),
                    calculated: {
                        latestScores: {}
                    }
                };
                queueRunner.queue.enqueue(job);
            }
            await delay(300);
            let result = await producerLib._concurrencyHandler._checkConcurrencyJobs(queueRunner.queue);
            expect(producerLib._concurrencyHandler._activeState[pipelineName].count).to.eql(1, '1111')
            expect(result).to.eql(1);
            await delay(300);
            producerLib._isConsumerActive = true;
            result = await producerLib._concurrencyHandler._checkConcurrencyJobs(queueRunner.queue);
            expect(producerLib._concurrencyHandler._activeState[pipelineName].count).to.eql(2, '2222')
            await delay(300);
            producerLib._isConsumerActive = true;
            redisJobCount = 2
            result = await producerLib._concurrencyHandler._checkConcurrencyJobs(queueRunner.queue);
            expect(producerLib._concurrencyHandler._activeState[pipelineName].count).to.eql(3, '3333')
            await producerLib._dequeueJobInternal();
            await producerLib._dequeueJobInternal();
            await producerLib._dequeueJobInternal();
            expect(producerLib._concurrencyHandler._activeState[pipelineName].count).to.eql(3, '4444')
            // checking jobs will get updated values from etcd
            producerLib._isConsumerActive = false;
            result = await producerLib._concurrencyHandler._checkConcurrencyJobs(queueRunner.queue);
            expect(producerLib._concurrencyHandler._activeState[pipelineName].count).to.eql(2, '5555')
        });

        it('should handle preferred queue concurrent jobs', async () => {
            const jobs = 20;
            const pipelineName = 'pipeline-concurrent';
            const experimentName = 'experiment-concurrent'
            const pipeline = pipelines.find(p => p.name === pipelineName);
            await dataStore._db.pipelines.patch(pipeline);

            let redisJobCount = 1
            producerLib._concurrencyHandler.getJobCountsFromRedis = async () => ({
                [pipelineName]: redisJobCount
            })
            producerLib._isConsumerActive=false;
            for (let i = 0; i < 3; i++) {
                const job = {
                    jobId: uuidv4(),
                    done: () => { },
                    pipelineName,
                    experimentName,
                    priority: 3,
                    entranceTime: Date.now(),
                    calculated: {
                        latestScores: {}
                    }
                };
                queueRunner.queue.enqueue(job);
            }
            for (let i = 0; i < jobs; i++) {
                const job = {
                    jobId: uuidv4(),
                    maxExceeded: true,
                    done: () => { },
                    pipelineName,
                    experimentName,
                    priority: 3,
                    entranceTime: Date.now(),
                    calculated: {
                        latestScores: {}
                    }
                };
                queueRunner.queue.enqueue(job);
            }
            await delay(300);
            preferredService.addPreferredJobs({ 'jobs': queueRunner.queue.getQueue().slice(0,5).map(j=>j.jobId), position: 'first' });

            let result = await producerLib._concurrencyHandler._checkConcurrencyJobsInternal();
            expect(queueRunner.preferredQueue.getQueue()).to.have.lengthOf(5);
            expect(producerLib._concurrencyHandler._activeState[pipelineName].count).to.eql(1, '1111')
            expect(result).to.eql(1);
            await delay(300);
            producerLib._isConsumerActive = true;
            result = await producerLib._concurrencyHandler._checkConcurrencyJobsInternal();
            expect(producerLib._concurrencyHandler._activeState[pipelineName].count).to.eql(2, '2222')
            expect(queueRunner.preferredQueue.getQueue()).to.have.lengthOf(4);
            await delay(300);
            producerLib._isConsumerActive = true;
            redisJobCount = 2
            result = await producerLib._concurrencyHandler._checkConcurrencyJobsInternal();
            expect(producerLib._concurrencyHandler._activeState[pipelineName].count).to.eql(3, '3333')
            expect(queueRunner.preferredQueue.getQueue()).to.have.lengthOf(3);
            await producerLib._dequeueJobInternal();
            await producerLib._dequeueJobInternal();
            await producerLib._dequeueJobInternal();
            expect(producerLib._concurrencyHandler._activeState[pipelineName].count).to.eql(3, '4444')
            // checking jobs will get updated values from etcd
            producerLib._isConsumerActive = false;
            result = await producerLib._concurrencyHandler._checkConcurrencyJobsInternal();
            expect(producerLib._concurrencyHandler._activeState[pipelineName].count).to.eql(2, '5555')
        });

        it('should not dequeue job if active is higher than concurrency', async () => {
            const jobs = 10;
            const pipelineName = 'pipeline-concurrent';
            const experimentName = 'experiment-concurrent'
            const pipeline = pipelines.find(p => p.name === pipelineName);
            await dataStore._db.pipelines.patch(pipeline);
            let redisJobCount = 6
            producerLib._concurrencyHandler.getJobCountsFromRedis = async () => ({
                [pipelineName]: redisJobCount
            })

            for (let i = 0; i < jobs; i++) {
                const job = {
                    jobId: uuidv4(),
                    maxExceeded: i > 0,
                    done: () => { },
                    pipelineName,
                    experimentName,
                    priority: 3,
                    entranceTime: Date.now(),
                    calculated: {
                        latestScores: {}
                    }
                };
                queueRunner.queue.enqueue(job);
            }
            expect(queueRunner.queue.size).to.eql(jobs - 1);

            await delay(300);
            producerLib._isConsumerActive = true;
            let result = await producerLib._concurrencyHandler._checkConcurrencyJobs(queueRunner.queue);
            expect(producerLib._concurrencyHandler._activeState[pipelineName].count).to.eql(6)
            expect(result).to.eql(0);
            expect(queueRunner.queue.size).to.eql(jobs - 1);

            redisJobCount = 1
            await delay(300);
            result = await producerLib._concurrencyHandler._checkConcurrencyJobs(queueRunner.queue);
            expect(producerLib._concurrencyHandler._activeState[pipelineName].count).to.eql(2)
            expect(result).to.eql(1);
            expect(queueRunner.queue.size).to.eql(jobs - 2);
            await delay(300);
            producerLib._isConsumerActive = true;
            await producerLib._concurrencyHandler._checkMaxExceeded({ experimentName, pipelineName }, false, queueRunner.queue);
            expect(queueRunner.queue.size).to.eql(jobs - 3);
            expect(producerLib._concurrencyHandler._activeState[pipelineName].count).to.eql(2)
        });
    });
});