const { pipelineStatuses } = require('@distributedkube/consts');

const pipelineDoneStatus = [pipelineStatuses.COMPLETED, pipelineStatuses.FAILED, pipelineStatuses.STOPPED];
const isCompletedState = ({ status }) => {
    return pipelineDoneStatus.includes(status);
};

module.exports = {
    isCompletedState
};
