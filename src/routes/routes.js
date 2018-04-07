const indexRoute = require('./index');
const loginRoute = require('./login');
const migrationRoute = require('./migration');
const setupRoute = require('./setup');
const multer = require('multer')();

// API routes
const treeApiRoute = require('./api/tree');
const notesApiRoute = require('./api/notes');
const branchesApiRoute = require('./api/branches');
const cloningApiRoute = require('./api/cloning');
const noteRevisionsApiRoute = require('./api/note_revisions');
const recentChangesApiRoute = require('./api/recent_changes');
const optionsApiRoute = require('./api/options');
const passwordApiRoute = require('./api/password');
const migrationApiRoute = require('./api/migration');
const syncApiRoute = require('./api/sync');
const loginApiRoute = require('./api/login');
const eventLogRoute = require('./api/event_log');
const recentNotesRoute = require('./api/recent_notes');
const appInfoRoute = require('./api/app_info');
const exportRoute = require('./api/export');
const importRoute = require('./api/import');
const setupApiRoute = require('./api/setup');
const sqlRoute = require('./api/sql');
const anonymizationRoute = require('./api/anonymization');
const cleanupRoute = require('./api/cleanup');
const imageRoute = require('./api/image');
const labelsRoute = require('./api/labels');
const scriptRoute = require('./api/script');
const senderRoute = require('./api/sender');
const filesRoute = require('./api/file_upload');
const searchRoute = require('./api/search');

const log = require('../services/log');
const express = require('express');
const router = express.Router();
const auth = require('../services/auth');
const cls = require('../services/cls');
const sql = require('../services/sql');
const protectedSessionService = require('../services/protected_session');

function apiResultHandler(req, res, result) {
    // if it's an array and first element is integer then we consider this to be [statusCode, response] format
    if (Array.isArray(result) && result.length > 0 && Number.isInteger(result[0])) {
        const [statusCode, response] = result;

        res.status(statusCode).send(response);

        if (statusCode !== 200 && statusCode !== 201 && statusCode !== 204) {
            log.info(`${req.method} ${req.originalUrl} returned ${statusCode} with response ${JSON.stringify(response)}`);
        }
    }
    else if (result === undefined) {
        res.status(204).send();
    }
    else {
        res.send(result);
    }
}

function apiRoute(method, path, routeHandler) {
    route(method, path, [auth.checkApiAuth], routeHandler, apiResultHandler);
}

function route(method, path, middleware, routeHandler, resultHandler) {
    router[method](path, ...middleware, async (req, res, next) => {
        try {
            const result = await cls.init(async () => {
                cls.namespace.set('sourceId', req.headers.source_id);
                protectedSessionService.setProtectedSessionId(req);

                return await sql.transactional(async () => {
                    return await routeHandler(req, res, next);
                });
            });

            if (resultHandler) {
                resultHandler(req, res, result);
            }
        }
        catch (e) {
            log.info(`${method} ${path} threw exception: ` + e.stack);

            res.sendStatus(500);
        }
    });
}

const GET = 'get', POST = 'post', PUT = 'put', DELETE = 'delete';
const uploadMiddleware = multer.single('upload');

function register(app) {
    route(GET, '/', [auth.checkAuth], indexRoute.index);
    route(GET, '/login', [], loginRoute.loginPage);
    route(POST, '/login', [], loginRoute.login);
    route(POST, '/logout', [auth.checkAuth], loginRoute.logout);
    route(GET, '/migration', [auth.checkAuthForMigrationPage], migrationRoute.migrationPage);
    route(GET, '/setup', [auth.checkAppNotInitialized], setupRoute.setupPage);

    apiRoute(GET, '/api/tree', treeApiRoute.getTree);
    apiRoute(PUT, '/api/branches/:branchId/set-prefix', branchesApiRoute.setPrefix);

    apiRoute(PUT, '/api/branches/:branchId/move-to/:parentNoteId', branchesApiRoute.moveBranchToParent);
    apiRoute(PUT, '/api/branches/:branchId/move-before/:beforeBranchId', branchesApiRoute.moveBranchBeforeNote);
    apiRoute(PUT, '/api/branches/:branchId/move-after/:afterBranchId', branchesApiRoute.moveBranchAfterNote);
    apiRoute(PUT, '/api/branches/:branchId/expanded/:expanded', branchesApiRoute.setExpanded);
    apiRoute(DELETE, '/api/branches/:branchId', branchesApiRoute.deleteBranch);

    apiRoute(GET, '/api/notes/:noteId', notesApiRoute.getNote);
    apiRoute(PUT, '/api/notes/:noteId', notesApiRoute.updateNote);
    apiRoute(POST, '/api/notes/:parentNoteId/children', notesApiRoute.createNote);
    apiRoute(PUT, '/api/notes/:noteId/sort', notesApiRoute.sortNotes);
    apiRoute(PUT, '/api/notes/:noteId/protect/:isProtected', notesApiRoute.protectBranch);
    apiRoute(PUT, /\/api\/notes\/(.*)\/type\/(.*)\/mime\/(.*)/, notesApiRoute.setNoteTypeMime);
    apiRoute(GET, '/api/notes/:noteId/revisions', noteRevisionsApiRoute.getNoteRevisions);

    apiRoute(PUT, '/api/notes/:noteId/clone-to/:parentNoteId', cloningApiRoute.cloneNoteToParent);
    apiRoute(PUT, '/api/notes/:noteId/clone-after/:afterBranchId', cloningApiRoute.cloneNoteAfter);

    route(GET, '/api/notes/:noteId/export', [auth.checkApiAuthOrElectron], exportRoute.exportNote);
    route(POST, '/api/notes/:parentNoteId/import', [auth.checkApiAuthOrElectron, uploadMiddleware], importRoute.importTar, apiResultHandler);

    route(POST, '/api/notes/:parentNoteId/upload', [auth.checkApiAuthOrElectron, uploadMiddleware],
        filesRoute.uploadFile, apiResultHandler);

    route(GET, '/api/notes/:noteId/download', [auth.checkApiAuthOrElectron], filesRoute.downloadFile);

    apiRoute(GET, '/api/notes/:noteId/labels', labelsRoute.getNoteLabels);
    apiRoute(PUT, '/api/notes/:noteId/labels', labelsRoute.updateNoteLabels);
    apiRoute(GET, '/api/labels/names', labelsRoute.getAllLabelNames);
    apiRoute(GET, '/api/labels/values/:labelName', labelsRoute.getValuesForLabel);

    route(GET, '/api/images/:imageId/:filename', [auth.checkApiAuthOrElectron], imageRoute.returnImage);
    route(POST, '/api/images', [auth.checkApiAuthOrElectron, uploadMiddleware], imageRoute.uploadImage, apiResultHandler);

    apiRoute(GET, '/api/recent-changes', recentChangesApiRoute.getRecentChanges);

    apiRoute(GET, '/api/options', optionsApiRoute.getOptions);
    apiRoute(PUT, '/api/options/:name/:value', optionsApiRoute.updateOption);

    apiRoute(POST, '/api/password/change', passwordApiRoute.changePassword);

    apiRoute(GET, '/api/sync/check', syncApiRoute.checkSync);
    apiRoute(POST, '/api/sync/now', syncApiRoute.syncNow);
    apiRoute(POST, '/api/sync/fill-sync-rows', syncApiRoute.fillSyncRows);
    apiRoute(POST, '/api/sync/force-full-sync', syncApiRoute.forceFullSync);
    apiRoute(POST, '/api/sync/force-note-sync/:noteId', syncApiRoute.forceNoteSync);
    apiRoute(GET, '/api/sync/changed', syncApiRoute.getChanged);
    apiRoute(GET, '/api/sync/notes/:noteId', syncApiRoute.getNote);
    apiRoute(GET, '/api/sync/branches/:branchId', syncApiRoute.getBranch);
    apiRoute(GET, '/api/sync/note_revisions/:noteRevisionId', syncApiRoute.getNoteRevision);
    apiRoute(GET, '/api/sync/options/:name', syncApiRoute.getOption);
    apiRoute(GET, '/api/sync/note_reordering/:parentNoteId', syncApiRoute.getNoteReordering);
    apiRoute(GET, '/api/sync/recent_notes/:branchId', syncApiRoute.getRecentNote);
    apiRoute(GET, '/api/sync/images/:imageId', syncApiRoute.getImage);
    apiRoute(GET, '/api/sync/note_images/:noteImageId', syncApiRoute.getNoteImage);
    apiRoute(GET, '/api/sync/labels/:labelId', syncApiRoute.getLabel);
    apiRoute(GET, '/api/sync/api_tokens/:apiTokenId', syncApiRoute.getApiToken);
    apiRoute(PUT, '/api/sync/notes', syncApiRoute.updateNote);
    apiRoute(PUT, '/api/sync/branches', syncApiRoute.updateBranch);
    apiRoute(PUT, '/api/sync/note_revisions', syncApiRoute.updateNoteRevision);
    apiRoute(PUT, '/api/sync/note_reordering', syncApiRoute.updateNoteReordering);
    apiRoute(PUT, '/api/sync/options', syncApiRoute.updateOption);
    apiRoute(PUT, '/api/sync/recent_notes', syncApiRoute.updateRecentNote);
    apiRoute(PUT, '/api/sync/images', syncApiRoute.updateImage);
    apiRoute(PUT, '/api/sync/note_images', syncApiRoute.updateNoteImage);
    apiRoute(PUT, '/api/sync/labels', syncApiRoute.updateLabel);
    apiRoute(PUT, '/api/sync/api_tokens', syncApiRoute.updateApiToken);

    apiRoute(GET, '/api/event-log', eventLogRoute.getEventLog);

    apiRoute(GET, '/api/recent-notes', recentNotesRoute.getRecentNotes);
    apiRoute(PUT, '/api/recent-notes/:branchId/:notePath', recentNotesRoute.addRecentNote);
    apiRoute(GET, '/api/app-info', appInfoRoute.getAppInfo);

    route(POST, '/api/setup', [auth.checkAppNotInitialized], setupApiRoute.setup, apiResultHandler);

    apiRoute(POST, '/api/sql/execute', sqlRoute.execute);
    apiRoute(POST, '/api/anonymization/anonymize', anonymizationRoute.anonymize);

    apiRoute(POST, '/api/cleanup/cleanup-soft-deleted-items', cleanupRoute.cleanupSoftDeletedItems);
    apiRoute(POST, '/api/cleanup/cleanup-unused-images', cleanupRoute.cleanupUnusedImages);
    apiRoute(POST, '/api/cleanup/vacuum-database', cleanupRoute.vacuumDatabase);

    apiRoute(POST, '/api/script/exec', scriptRoute.exec);
    apiRoute(POST, '/api/script/run/:noteId', scriptRoute.run);
    apiRoute(GET, '/api/script/startup', scriptRoute.getStartupBundles);
    apiRoute(GET, '/api/script/bundle/:noteId', scriptRoute.getBundle);

    route(POST, '/api/sender/login', [], senderRoute.login, apiResultHandler);
    route(POST, '/api/sender/image', [auth.checkSenderToken], senderRoute.uploadImage, apiResultHandler);
    route(POST, '/api/sender/note', [auth.checkSenderToken], senderRoute.saveNote, apiResultHandler);

    apiRoute(GET, '/api/search/:searchString', searchRoute.searchNotes);
    apiRoute(POST, '/api/search/:searchString', searchRoute.saveSearchToNote);

    route(GET, '/api/migration', [auth.checkApiAuthForMigrationPage], migrationApiRoute.getMigrationInfo, apiResultHandler);
    route(POST, '/api/migration', [auth.checkApiAuthForMigrationPage], migrationApiRoute.executeMigration, apiResultHandler);

    route(POST, '/api/login/sync', [], loginApiRoute.loginSync, apiResultHandler);
    // this is for entering protected mode so user has to be already logged-in (that's the reason we don't require username)
    apiRoute(POST, '/api/login/protected', loginApiRoute.loginToProtectedSession);

    app.use('', router);
}

module.exports = {
    register
};