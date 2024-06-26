const { expect } = require('chai');
const sinon = require('sinon');
const delay = require('await-delay');
const { generateArr, stubTemplate } = require('./stub/stub');
const { uid: uuidv4 } = require('@distributedkube/uid');
const { Producer } = require('@distributedkube/producer-consumer');
const queueEvents = require('../lib/consts/queue-events');
const { semaphore } = require('await-done');
const { pipelines } = require('./mock/index');
const queueRunner = require('../lib/queue-runner');
const dataStore = require('../lib/persistency/data-store');
const producerLib = require('../lib/jobs/producer');
const setting = { prefix: 'pipeline-driver-queue' }
const producer = new Producer({ setting });
const Queue = require('../lib/queue');
const heuristic = score => job => ({ ...job, entranceTime: Date.now(), score, ...{ calculated: { latestScore: {} } } })
const heuristicStub = score => job => ({ ...job })
const heuristicBoilerPlate = (score, _heuristic) => ({
    run(job) {
        return _heuristic(score)(job);
    }
});

let queue = null;
let consumer;
let _semaphore = null;

describe('Queue Tests', () => {
    before(async () => {
        consumer = global.consumer;
    });
    beforeEach(() => {
        queue = new Queue();
        queue.updateHeuristic({ run: heuristic(80) });
        producerLib._isConsumerActive = false;
        _semaphore = new semaphore();
    });
    afterEach(() => {
        producerLib._isConsumerActive = true;
    });

    describe('queue-tests', () => {
        describe('add', () => {
            it('should added to queue', async () => {
                queue = new Queue();
                queue.updateHeuristic(heuristicBoilerPlate(80, heuristic));
                queue.enqueue(stubTemplate());
                const q = queue.getQueue();
                expect(q[0].score).to.eql(80);
            });
            it('should added to queue ordered', async () => {
                queue = new Queue();
                queue.updateHeuristic({ run: heuristicStub() });
                queue.enqueue(stubTemplate({ score: 80 }));
                queue.enqueue(stubTemplate({ score: 60 }));
                queue.enqueue(stubTemplate({ score: 90 }));
                expect(queue.getQueue()[0].score).to.eql(90);
                expect(queue.getQueue()[1].score).to.eql(80);
                expect(queue.getQueue()[2].score).to.eql(60);
            });
        });
        describe('remove', () => {
            it('should removed from queue', async () => {
                queue.updateHeuristic({ run: heuristic(80) });
                const stubJob = stubTemplate();
                queue.enqueue(stubJob);
                queue.on(queueEvents.REMOVE, () => {
                    _semaphore.callDone();
                });
                queue.remove(stubJob.jobId);
                await _semaphore.done();
                const q = queue.getQueue();
                expect(q).to.have.length(0);
            });
            it('should not removed from queue when there is no matched id', async () => {
                let called = false;
                queue.updateHeuristic({ run: heuristic(80) });
                const stubJob = stubTemplate();
                queue.enqueue(stubJob);
                queue.on(queueEvents.REMOVE, () => {
                    called = true;
                });
                queue.remove('not_exist job');
                await delay(1000);
                expect(called).to.equal(false);
            }).timeout(3000);
        });
        describe('pop', () => {
            it('should pop from queue', async () => {
                queue.updateHeuristic({ run: heuristic(80) });
                const stubJob = stubTemplate();
                queue.enqueue(stubJob);
                queue.dequeue(stubJob);
                expect(queue.size).to.eql(0);
            });
        });
        describe('queue-events', () => {
            it('check events insert', async () => {
                queue.on(queueEvents.INSERT, () => _semaphore.callDone());
                queue.updateHeuristic({ run: heuristic(80) });
                queue.enqueue(stubTemplate());
                await _semaphore.done();
            });
            it('check events remove', async () => {
                queue.on(queueEvents.REMOVE, () => _semaphore.callDone());
                queue.updateHeuristic({ run: heuristic(80) });
                const stubJob = stubTemplate();
                queue.enqueue(stubJob);
                await queue.remove(stubJob.jobId);
                await _semaphore.done();
            });
        });
    });
    describe('queue-runner', () => {
        it('check-that-heuristics-sets-to-latestScore', async () => {
            const stubJob = stubTemplate();
            queueRunner.queue.enqueue(stubJob);
            const q = queueRunner.queue.getQueue();
            expect(q[0].score).to.be.above(0);
            expect(q[0].calculated.latestScores).to.have.property('PRIORITY');
            expect(q[0].calculated.latestScores).to.have.property('ENTRANCE_TIME');
        });
    });
});