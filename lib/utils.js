/**
 * Ye Olde Utils File
 */

const { parse } = require("url");
const path = require("path");
const Promise = require("bluebird");
const { logError } = require("./logger");

/**
 * This is a naiive implementation of a Deferred, which makes it possible to resolve
 * promises externally by exposing references to a promise's `resolve` and `reject`.
 * @return {function} a deferred factory function
 */
const defer = function () {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

/**
 * Given a compiler and a request path, determine where on disk the proper file should
 * be to fulfil the given request. Note that this function makes no guarantee that the
 * file actually exists.
 * @param {Compiler} compiler - an instance of a webpack compiler (single-compiler only)
 * @param {string} path - a request path (i.e. from express's req.path)
 * @return {string} the location of the file on disk
 */
const getPathToServe = function (compiler, reqPath) {
    const outputPath = compiler.options.output.path;
    const publicPath = compiler.options.output.publicPath;

    // Ok, this logic is a little weird so I'm gonna walk through it in detail.

    // The public URL represents a location on disk that we're serving things from:
    //
    //      https://your.asset.host/webpack/js/
    //
    // We need to get the path prefix to identify the beginning part of the path
    // to ignore; it's part of the public path explicitly because it's outside of the
    // context of our output directory, and not included in any asset names:
    //
    //      /webpack/js/
    //
    // Start by parsing the public url and finding its pathname.
    const publicUrl = parse(publicPath, false, true);
    const urlPrefix = publicUrl.pathname;

    // Now that we know the public path pathname prefix, we should peel it out of
    // the requested asset pathname if it's present:
    //
    //      /webpack/js/your/entry.js -> your/entry.js
    let filename = reqPath;
    if (reqPath.indexOf(urlPrefix) === 0) {
        filename = reqPath.substr(urlPrefix.length);
    }

    // If all goes well, the requested path, minus the publich pathname, is a file
    // in the output directory configured in webpack.
    const assetLocation = path.join(outputPath, filename);

    return assetLocation;
};

/**
 * An important part of this middleware is being able to uniquely identify each config.
 * This function takes an array of configs (i.e. a multi-compiler config) and ensures
 * that each config has a unique name. It also ensures that your webpack config is an
 * array and not just a single config.
 * @param {object|array} - a single webpack config or an array of them
 * @throws {Error} if config names are missing or non-unique
 * @returns {array} - an array of webpack configs
 */
const validateConfigs = function (configs) {
    // Ensure the configs are an array (webpack configs can be one object)
    const configArray = [].concat(configs);
    // Make a list of all names, filtering out undefined and null names
    const configNames = configArray
        .map((config) => config.name)
        .filter((name) => !!name);

    if (configNames.length !== configArray.length) {
        throw new Error(
            "At least one of your configs is missing a name. " +
                "Ensure that all of your configs are named uniquely and try again."
        );
    }

    // Convert the list into a unique set
    const configNameSet = new Set(configNames);
    if (configNameSet.size !== configArray.length) {
        throw new Error(
            "At least two of your configs share a name. " +
                "Ensure that each of your configs are named uniquely and try again"
        );
    }

    return configArray;
};

/**
 * Given an array of webpack configs (i.e. a multicompiler config), generate a mapping
 * from entrypoints to the name of the config responsible for it.
 *
 * This used to throw an exception if multiple configs were capable of handling the same
 * entrypoint. Now it will return a list of possible configs, and it is up to whoever is
 * utilizing this map to correctly extract the correct config name.
 * @param {array} configs
 */
const initializeEntryMap = function (configs) {
    const entryMap = {};
    configs.forEach((config) => {
        const { name: configName, entry } = config;
        if (!entry) {
            logError(`Config "${configName}" doesn't have the "entry" key set`);
            return;
        }
        // if you use a string or an array for `entry`, then the output chunk is `main`.
        if (typeof entry === "string" || Array.isArray(entry)) {
            if (entryMap.main) {
                throw new Error(
                    `Entrypoint 'main' is built by both ${entryMap.main} ` +
                        `and ${configName}. You should consider object syntax for ` +
                        `defining the 'entry' property.`
                );
            }
            entryMap.main = configName;
        } else {
            Object.keys(entry).forEach((key) => {
                if (entryMap[key]) {
                    entryMap[key].push(configName);
                } else {
                    entryMap[key] = [configName];
                }
            });
        }
    });
    return entryMap;
};

module.exports = {
    getPathToServe,
    validateConfigs,
    defer,
    initializeEntryMap,
};
