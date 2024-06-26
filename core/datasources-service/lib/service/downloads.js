const { uid } = require('@distributedkube/uid');
const pathLib = require('path');
const fse = require('fs-extra');
const archiver = require('archiver');
const { filePath: { getFilePath } } = require('@distributedkube/datasource-utils');
const log = require('@distributedkube/logger').GetLogFromContainer();
const dbConnection = require('../db');
const Repository = require('../utils/Repository');
const validator = require('../validation');

class Downloads {
    async init(config) {
        this.config = config;
        this.db = dbConnection.connection;
        fse.ensureDirSync(this.config.directories.prepareForDownload);
        fse.ensureDirSync(this.config.directories.zipFiles);
    }

    get zipDir() {
        return this.config.directories.zipFiles;
    }

    createZip(rootDir, downloadId) {
        return new Promise((res, rej) => {
            const archive = archiver('zip', { zlib: { level: 9 } });
            archive.directory(rootDir, false);
            archive.finalize();
            const output = fse.createWriteStream(this.getZipPath(downloadId));
            archive.pipe(output);
            output.on('close', () => res(archive.pointer()));
            output.on('end', () => {
                log.info('Data has been drained');
            });
            archive.on('warning', err => {
                if (err.code === 'ENOENT') {
                    log.warning(err);
                }
                else {
                    rej(err);
                }
            });
            archive.on('error', rej);
        });
    }

    async prepareForDownload({ dataSourceId, fileIds }) {
        validator.downloads.validatePrepareForDownload({
            dataSourceId,
            fileIds,
        });
        const downloadId = uid();
        const dataSource = await this.db.dataSources.fetchWithCredentials({
            id: dataSourceId,
        });
        const fileIdsSet = new Set(fileIds);
        // create a new directory with the downloadId as its name
        const repository = new Repository(
            dataSource.name,
            this.config,
            pathLib.join(
                this.config.directories.prepareForDownload,
                downloadId
            ),
            dataSource.git,
            dataSource.storage,
            dataSource._credentials
        );

        const { filesToKeep, filesToDrop } = dataSource.files.reduce(
            // eslint-disable-next-line no-confusing-arrow
            (acc, file) => fileIdsSet.has(file.id)
                ? { ...acc, filesToKeep: acc.filesToKeep.concat(file) }
                : { ...acc, filesToDrop: acc.filesToDrop.concat(file) },
            {
                filesToKeep: [],
                filesToDrop: [],
            }
        );

        await repository.ensureClone();
        const filesPaths = filesToKeep.map(f => getFilePath(f));
        await repository.pullFiles(filesPaths);

        await repository.filterFilesFromClone(filesToDrop);
        await repository.dropNonDataFiles();
        await this.createZip(`${repository.cwd}/data`, downloadId);
        await fse.remove(repository.cwd);
        return downloadId;
    }

    getZipPath(downloadId) {
        validator.downloads.validateDownloadId(downloadId);
        return pathLib.join(
            this.config.directories.zipFiles,
            `${downloadId}.zip`
        );
    }
}

module.exports = new Downloads();
