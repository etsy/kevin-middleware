/**
 * This is a middleware that makes building and serving javascript in a monorepo with
 * Webpack a bit more bearable. The TL;DR is that you should give it an array of webpack
 * configs (although it'll take a single config as well), and it'll determine which configs
 * to build as requests come in. It'll try and keep the number of active compilers under
 * a minimum number as well.
 */

const webpack = require("webpack");
const Promise = require("bluebird");
const fs = require("fs");
const { SyncHook } = require("tapable");

const {
    getPathToServe,
    validateConfigs,
    defer,
    initializeEntryMap,
} = require("./utils");
const { logInfo, logNotice, logError } = require("./logger");
const buildingTemplate = require("./buildingTemplate");
const CompilerManager = require("./CompilerManager");
const PublicConfigManager = require("./PublicConfigManager");

const PLUGIN_VERSION = "1.0.0";

const {
    // Build states
    FIRST_BUILD,
    ERROR,
    DONE,
} = require("./constants");

// we're leaving manager detached from Kevin to keep it and its methods private
const manager = new CompilerManager();

class Kevin {
    constructor(
        configs = [],
        {
            // What's the most number of compilers we want to have at any point in time?
            // Set to 0 to never evict anything, but that'll probably make you run out of
            // memory.
            maxCompilers = 3,
            // Given a request path, the req object, and the res object, return the name of the asset we're trying to serve.
            // Useful if you have entries that don't map to the filenames they render.
            // Default: strip off leading forward slash and js extension. This is because
            // the middleware will store things as `app-a/a1`, but requests will be for `/app-a/a1.js`.
            getAssetName = (requestPath, req, res) =>
                requestPath.replace(/^\//, "").replace(/\.js$/, ""),
            // Given a request path and a set of configNames, return the name of the config
            // we're interested in using to handle this request
            selectConfigName = (reqPath, configNames) => {
                if (!configNames) {
                    return null;
                }
                if (configNames.length > 1) {
                    logError(
                        `Multiple configNames found for ${reqPath}: ${configNames.join(
                            ","
                        )}. Using first one.`
                    );
                }

                return configNames[0];
            },
            // Only build assets; don't handle serving them. This is useful if you want to do
            // something with the built asset before serving it.
            buildOnly = false,
            // Root path for Kevin's API to be exposed through. This is used to tell the
            // loading modal where to look for data on the status of builds. This should be
            // set to the path that this middlware is bound to. For now, this path can _not_
            // end in a slash. If set to null, auto-refresh is disabled.
            kevinPublicPath = null,
            // This is a prefix for Kevin's API. You probably don't need to change this
            // unless you have an asset being served that's named `__kevin` or somemthing.
            kevinApiPrefix = "/__kevin",
            // This is a string that's inserted into the overlay, in order to provide users
            // with additional information. It's useful if you'd like to provide feedback
            // to users of your server, like "If you run into issues, try running restart_server_please.sh"
            // This string may contain valid HTML.
            additionalOverlayInfo = "",
        } = {}
    ) {
        this.hooks = {
            start: new SyncHook(["configs", "configManager"]),
            compilerStart: new SyncHook(["compilerName"]),
            compilerClose: new SyncHook(["evictionOptions"]),
            handleRequest: new SyncHook(["request", "assetName", "compilerName"]),
        };

        this.configs = validateConfigs(configs);

        this.maxCompilers = maxCompilers;
        this.getAssetName = getAssetName;
        this.buildOnly = buildOnly;
        this.selectConfigName = selectConfigName;
        this.kevinPublicPath = kevinPublicPath;
        this.kevinApiPrefix = kevinApiPrefix;
        this.additionalOverlayInfo = additionalOverlayInfo;

        this.entryMap = initializeEntryMap(this.configs);
    }

    /**
     * Given an asset name and a webpack config (ideally a multi-compiler
     * config, since that's kinda the point of this middleware), find
     * the first config responsible for building that asset and
     * return it. Return false if none are found.
     * @param {string} assetName
     * @param {array} configs — array of webpack config objects
     * @returns {string|null} - the name of the config, or null if there is none
     */
    getConfigForAssetName(reqPath, assetName, configs) {
        const configNames = this.entryMap[assetName];
        const configName = this.selectConfigName(reqPath, configNames);
        if (!configName) {
            return null;
        }
        const config = configs.find((config) => {
            return config.name === configName;
        });
        // Array.find returns undefined, not null, if nothing matches
        return config || null;
    }

    /**
     * Given a config, find or start a compiler for it, and then register
     * a callback to be invoked once it's all done building everything.
     * @param {object} config - a single-compiler webpack config.
     * @return {Promise<bool>} - promise representing whether or not this is the first
     *      build of a new compiler (true) or a rebuild of an existing one (false)
     */
    buildConfig(configName) {
        const config = this.configs.find((config) => config.name === configName);
        if (!config) {
            const msg = `Trying to build config: ${configName}, but it can't be found.`;
            logError(msg);
            return Promise.reject(msg);
        }

        // determine if there's a compiler already
        if (manager.isCompilerActive(configName)) {
            manager.noteCompilerUsage(configName);
            const buildState = manager.getStatus(configName);

            // determine state of build
            if (buildState === DONE) {
                // if done, serve from disk
                logInfo(`${configName} is done; serving its assets right from disk`);
                return Promise.resolve(false);
            } else if (buildState === FIRST_BUILD) {
                // Still doing the first build, hold your horses
                logInfo(
                    `${configName} is running its first build; serving loading overlay`
                );
                return Promise.resolve(true);
            } else {
                // We're in the middle of building something, or something's broken.
                if (buildState === ERROR) {
                    // TODO: if the build has errored, we need to surface errors in the
                    // browser. If we're here, it means that there was an error and the user
                    // re-requested the file without making any changes, which seems about
                    // right if the user doesn't know about any build issues.
                    logInfo(
                        `${configName} encountered an error; invalidating and rebuilding`
                    );
                    // for now, invalidate the build and then pretend like it's building.
                    manager.invalidateCompiler(configName);
                } else {
                    logInfo(`${configName} is building and should be done shortly`);
                }
                // otherwise, create a deferred promise
                const { promise, resolve, reject } = defer();
                manager.addDeferredCallback(configName, resolve, reject);
                return promise;
            }
        }

        // instatiate a new compiler, give it the config, add hooks (don't start building yet)
        logNotice(`Starting compiler for ${configName}.`);
        this.hooks.compilerStart.call(configName);

        const compiler = webpack(config);

        // kick off an initial build (active compilers are going to be in watch mode)
        const watching = compiler.watch(
            {
                // TODO: do we... parameterize this? should we get this from the config?
                aggregateTimeout: 1000,
                poll: undefined,
            },
            (err) => {
                if (err !== null) {
                    err && logError(err);
                    manager.setStatus(configName, ERROR, [err]);
                }
            }
        );

        // cache the watch object and compiler so we can close its building later
        manager.manageCompiler(configName, compiler, watching);

        // Resolve immediately, and let the next thing in the chain know that the compiler
        // is still building.
        return Promise.resolve(true);
    }

    /**
     * Given specifications around the resource constraints of the machine that
     * this middleware is running on, this method will determine if a compiler
     * needs to be closed to make room for another. Returns a promise.
     * TODO: This whole method should probably be done from within the CompilerManager
     *
     * @param {number} maxCompilers - What's the max number of compilers to keep alive?
     *      Set to 0 if we should never evict.
     * @param {string} configName - The name of the compiler/config we'd be making room for.
     * @returns {Promise<string|null>} - name of evicted compiler, or null if we did nothing.
     */
    closeCompilersIfNeeded(maxCompilers, configName) {
        // Don't evict anything if maxCompilers is 0, or if there's already a compiler
        // running for the config we want to build.
        if (maxCompilers === 0 || manager.isCompilerActive(configName)) {
            return Promise.resolve(null);
        }

        // Get the number of currently running compilers
        const activeCompilerCount = manager.countActiveCompilers();

        // If we're not going to go above our limit, then we don't need to do anything.
        // Note that we do > and not >= here, since this method is called before
        // creating a new compiler; we want there to be space to add one more.
        if (maxCompilers > activeCompilerCount) {
            return Promise.resolve(null);
        }

        // It seems we need to close a compiler.
        // Figure out what compiler was least recently used.
        const compilerToEvict = manager.getLeastUsedCompiler();
        const compilerStats = manager.getInfoForCompiler(compilerToEvict);

        // Let the hooks have the option of updating our eviction decision before we do
        // anything with it.
        const options = { compilerToEvict, compilerStats };
        this.hooks.compilerClose.call(options);

        // TODO: We should do something with the stats here and provide recommendations,
        // like "wow you're evicting a lot. you may want to rebalance your entries or
        // increase your limit"
        // TODO: Also make sure there are no outstanding callbacks!!
        return manager.closeCompiler(options.compilerToEvict).then((name) => {
            logNotice(
                `We stopped compiling ${compilerToEvict} to free some resources.`
            );
            return name;
        });
    }

    /**
     * Does all the parts of serving a specific request once everything else is finished.
     * @param {object} $0.req - Express request object
     * @param {object} $0.res - Express response object
     * @param {function} $0.next - Express next callback
     * @param {bool} $0.isNewCompiler - is true if we've started a new compiler and aren't
     *      ready to serve anything yet.
     * @param {string} $0.assetName - the name of the asset to serve
     * @param {bool} $0.buildOnly - true if we shouldn't worry about serving the file
     * @param {string} $0.configName - the name of the config responsible for this request
     *      if kevinApiPrefix is provided.
     */
    serveAsset({ req, res, next, isNewCompiler, assetName, configName } = {}) {
        // If the compiler is going through its first build, serve an overlay until it's
        // finished (the first build takes more time because the cache is cold).
        if (isNewCompiler) {
            res.setHeader("Content-Type", "application/javascript; charset=UTF-8");
            res.setHeader("X-Kevin-Middleware-Version", PLUGIN_VERSION);
            res.statusCode = 200;
            const kevinBuildStatusUrl = this.kevinPublicPath
                ? `${this.kevinPublicPath}${this.kevinApiPrefix}/build-status`
                : null;
            const content = buildingTemplate(
                assetName,
                configName,
                kevinBuildStatusUrl,
                this.additionalOverlayInfo
            );
            logInfo(`Serving temporary asset for ${assetName}...`);
            res.setHeader("Content-Length", content.length);
            res.send(content);
            return;
        }

        // If we only build things, then let another middleware deal with
        // handling the response.
        if (this.buildOnly) {
            next();
            return;
        }

        // The grand finale: serve file from output location
        res.setHeader("Content-Type", "application/javascript; charset=UTF-8");
        res.setHeader("X-Kevin-Middleware-Version", PLUGIN_VERSION);
        res.statusCode = 200;
        const compiler = manager.getWebpackCompiler(configName);
        const reqPath = req.path;
        const assetPath = getPathToServe(compiler, reqPath);
        const content = fs.readFileSync(assetPath);
        res.setHeader("Content-Length", content.length);
        res.setHeader("X-Kevin-Asset-Disk-Location", assetPath);
        logInfo(`Serving ${assetName}...`);
        res.send(content);
    }

    /**
     * This method spits out a middleware, based on Kevin's configuration, that'll serve
     * files owned and built by webpack.
     */
    getMiddleware() {
        // Let em know what's goin on
        logInfo("");
        logInfo("╒═════════════════════════════╕");
        logInfo("│                             │");
        logInfo("│   \x1b[1moh boy here comes kevin\x1b[0m   │");
        logInfo("│     (middleware started)    │");
        logInfo("│                             │");
        logInfo("╘═════════════════════════════╛");
        logInfo("");
        logInfo("This middleware is currently managing the following configs:");
        this.configs.forEach((config) => {
            logInfo(`\t• ${config.name}`);
        });
        logInfo("");

        this.hooks.start.call(this.configs, new PublicConfigManager(this, manager));

        // TODO: Make a request ID if there isn't one already, and use it in logging so
        // we know what logs are part of what requests.
        // It would be sick if this were a class, because it'd make tapping it a bit more
        // obvious, but Express throws an exception if `typeof` on your middleware is not
        // a function.
        const middleware = function kevinMiddleware(req, res, next) {
            // This is the name of the asset requested
            const reqPath = req.path;

            // ========================================
            // Is it one of our internal API endpoints?
            // TODO: This should probably use a Router
            // ========================================
            if (reqPath === `${this.kevinApiPrefix}/build-status`) {
                // this endpoint shows the state of each compiler. the overlay
                // uses this endpoint to know whether or not to reload the page
                res.json(manager.getAllBuildStatuses());
                return;
            }

            if (reqPath === `${this.kevinApiPrefix}/compiler-info`) {
                // this endpoint shows general details about each compiler,
                // particularly metrics around its use and whether it may
                // be eligible for eviction
                res.json(manager.getAllCompilerInfo());
                return;
            }

            if (reqPath === `${this.kevinApiPrefix}/memory-usage`) {
                // this endpoint lists memory stats for the process in
                // which kevin is being run
                res.json(manager.getHumanReadableMemoryUsage());
                return;
            }

            if (
                req.method === "POST" &&
                reqPath === `${this.kevinApiPrefix}/restart-compiler`
            ) {
                // This endpoint restarts compilers. It accepts two query params:
                // `compiler` (required), which is the name of the compiler, and
                // `hard` (optional) which, if true, fully shuts down and restarts the compiler,
                //          rather than just invalidating it and forcing a partial recompilation.
                if (
                    !req.query.compiler ||
                    !manager.isCompilerActive(req.query.compiler)
                ) {
                    return res
                        .status(400)
                        .send(
                            `Kevin couldn't find a compiler named ${req.query.compiler}.`
                        );
                }
                // If hard is set to anything that looks like "true", let's force restart the compiler.
                if (req.query.hard && req.query.hard.toLowerCase() === "true") {
                    manager
                        .closeCompiler(req.query.compiler)
                        .then((name) => {
                            if (!name) {
                                return res
                                    .status(400)
                                    .send(
                                        `Kevin couldn't find a compiler named ${req.query.compiler}.`
                                    );
                            }
                            return this.buildConfig(name).then(() =>
                                res.sendStatus(200)
                            );
                        })
                        .catch((err) => {
                            logError(err);
                            res.status(500).send(
                                `Something went wrong trying to restart ${req.query.compiler}. Check the logs for details.`
                            );
                        });

                    return;
                } else if (manager.invalidateCompiler(req.query.compiler)) {
                    logInfo(`Soft-restarted compiler: ${req.query.compiler}`);
                    res.sendStatus(200);
                    return;
                } else {
                    logInfo(
                        `Could not restart this compiler (does it exist?): ${req.query.compiler}`
                    );
                    res.status(400).send(
                        "Kevin couldn't find a compiler with that name"
                    );
                    return;
                }
            }

            // Mangle the url to get asset name
            const assetName = this.getAssetName(reqPath, req, res);
            // Select appropriate config for given asset
            const config = this.getConfigForAssetName(reqPath, assetName, this.configs);
            // Bail if none are found (this path may be handled by another middleware)
            if (!config) {
                // TODO: It may be a chunk file!! Make sure we either serve static
                // assets, or tell users to serve their own output directory statically
                logInfo(`Looks like we're not responsible for ${assetName}`);
                return next();
            }
            const configName = config.name;
            logInfo(`Using config "${configName}" to build ${assetName}`);
            this.hooks.handleRequest.call(req, assetName, configName);

            // If we're close to the compiler limit, make some room for a new one
            this.closeCompilersIfNeeded(this.maxCompilers, configName)
                .then(() => this.buildConfig(configName))
                // serve this file once it's done building
                .then((isNewCompiler = false) => {
                    this.serveAsset({
                        req,
                        res,
                        next,
                        isNewCompiler,
                        assetName,
                        configName,
                    });
                })
                .catch((err) => {
                    this.serveError({ res, configName, assetName, err });
                    return;
                });
        };

        return middleware.bind(this);
    }

    /**
     * This serves some js that logs an error to the console. This is used for exposing
     * build-time errors to the client.
     * @param {object} $0.res - Express response object
     * @param {Error|string} $0.err - The error you want to log
     */
    serveError({ res, configName, assetName = "", err = "" } = {}) {
        res.setHeader("Content-Type", "application/javascript; charset=UTF-8");
        res.setHeader("X-Kevin-Middleware-Version", PLUGIN_VERSION);
        res.statusCode = 200;
        const errMsg = (err.stack || err).toString();
        const jsString = `
    console.log(\`%c The "${configName}" compiler encountered an error${
            assetName ? `while building "${assetName}"` : ""
        }:%c

    ${JSON.stringify(errMsg)}
    \`, 'font-weight: bold; font-size: 1.5em', '')`;
        res.send(jsString);
    }
}

module.exports = Kevin;
