const { TENSORBOARD } = require('../consts/containers');
const { getIngressParams } = require('../helpers/kubernetes-utils');

const deploymentBoardTemplate = (boardReference = '') => ({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
        name: `board-${boardReference}`,
        labels: {
            app: `board-${boardReference}`,
            'board-id': `${boardReference}`,
            group: 'distributedkube',
            core: 'true',
            'metrics-group': TENSORBOARD,
            type: TENSORBOARD
        }
    },
    spec: {
        replicas: 1,
        selector: {
            matchLabels: {
                app: `board-${boardReference}`
            }
        },
        template: {
            metadata: {
                labels: {
                    app: `board-${boardReference}`,
                    group: 'distributedkube',
                    'metrics-group': TENSORBOARD,
                    type: TENSORBOARD
                }
            },
            spec: {
                containers: [
                    {
                        name: TENSORBOARD,
                        image: `distributedkube/${TENSORBOARD}`,
                        env: [
                            {
                                name: 'DEFAULT_STORAGE',
                                valueFrom: {
                                    configMapKeyRef: {
                                        name: 'algorithm-operator-configmap',
                                        key: 'DEFAULT_STORAGE'
                                    }
                                }
                            },
                        ],
                        port: {
                            containerPort: 6006
                        }
                    }
                ]

            }
        }
    }
});

const boardService = (boardReference = '') => ({
    kind: 'Service',
    apiVersion: 'v1',
    metadata: {
        name: `board-service-${boardReference}`,
        labels: {
            app: `board-${boardReference}`,
            group: 'distributedkube',
            core: 'true',
            type: TENSORBOARD
        }
    },
    spec: {
        selector: {
            'metrics-group': TENSORBOARD,
            group: 'distributedkube',
            app: `board-${boardReference}`,
        },
        ports: [
            {
                port: 80,
                targetPort: 6006
            }
        ]
    }
});

const boardIngress = (boardReference = '', { ingressHost, ingressPrefix = '', ingressUseRegex = false, ingressClass = 'nginx' } = {}) => {
    const { apiVersion, backend, pathType } = getIngressParams(`board-service-${boardReference}`, 80);
    return {
        apiVersion,
        kind: 'Ingress',
        metadata: {
            name: `ingress-board-${boardReference}`,
            annotations: {
                'nginx.ingress.kubernetes.io/rewrite-target': ingressUseRegex ? '/$2' : '/',
                'nginx.ingress.kubernetes.io/ssl-redirect': 'false',
                'nginx.ingress.kubernetes.io/proxy-read-timeout': '50000',
                'kubernetes.io/ingress.class': ingressClass
            },
            labels: {
                app: `ingress-${TENSORBOARD}`,
                core: 'true',
                type: TENSORBOARD
            }
        },
        spec: {
            rules: [
                {
                    http: {
                        paths: [{
                            path: ingressUseRegex ? `${ingressPrefix}/distributedkube/board/${boardReference}(/|$)(.*)` : `${ingressPrefix}/distributedkube/board/${boardReference}`,
                            backend,
                            pathType
                        }]

                    },
                    host: ingressHost || undefined
                }
            ]
        }
    };
};

module.exports = {
    deploymentBoardTemplate,
    boardService,
    boardIngress,
};
