/**
 * This file manages data about compilers. It handles things like
 * "Hey how's that compiler doing?" or "hey can you evict a compiler
 * for me?" with the intention of keeping that logic from tangling
 * up the middleware logic.
 */

const ManagedCompiler = require("./ManagedCompiler");
const { FIRST_BUILD } = require("./constants");
const { logError } = require("./logger");

class CompilerManager {
    /**
     * @param {boolean} $0.useFrequency - if true, use frequency instead of frecency
     *      to determine compiler eviction.
     */
    constructor({ useFrequency = false } = {}) {
        this.activeCompilers = {};
        this.useFrequency = useFrequency;
    }

    /**
     * Add a compiler, with the given name, to be managed.
     * @param {string} name - compiler's name
     * @param {Compiler} compiler
     * @param {Watching} watching
     * @param {string} [status="first-build"]
     */
    manageCompiler(name, compiler, watching, status = FIRST_BUILD) {
        this.activeCompilers[name] = new ManagedCompiler(
            name,
            compiler,
            watching,
            status
        );
        this.noteCompilerUsage(name);
    }

    /**
     * @param {string} name - compiler's name
     * @returns {boolean}
     */
    isCompilerActive(name) {
        return !!this.activeCompilers[name];
    }

    /**
     * How many compilers are we cookin with
     */
    countActiveCompilers() {
        return Object.keys(this.activeCompilers).length;
    }

    /** ********************************************
     **
     ** UPDATE AND MANAGE A COMPILER'S STATE/USAGE
     **
     ** *******************************************/

    /**
     * Get the status of a managed compiler. Returns null if we're not managing
     * a compiler with the given name.
     * @param {string} name - compiler's name
     * @returns {string?}
     */
    getStatus(name) {
        if (!this.isCompilerActive(name)) {
            logError(`Couldn't get status of unknown compiler: ${name}`);
            return null;
        }
        return this.activeCompilers[name].status;
    }

    /**
     * Sets the status of a managed compiler.
     * @param {string} name - compiler's name
     * @param {string} status - new status
     * @param {Array} errors - any errors to persist with the current state
     */
    setStatus(name, status, errors = []) {
        if (!this.isCompilerActive(name)) {
            logError(`Couldn't set status of unknown compiler: ${name}`);
            return;
        }
        this.activeCompilers[name].setStatus(status, errors);
    }

    /**
     * This function should be called to indicate that the given compiler
     * has been used. This is the way that we signal frequency and recency
     * of usage.
     * @param {string} name - compiler's name
     */
    noteCompilerUsage(name) {
        if (!this.isCompilerActive(name)) {
            logError(
                `Tried to mark compiler ${name} as in use, but it's not being managed`
            );
            return;
        }
        const compiler = this.activeCompilers[name];
        if (compiler.pinned) {
            // pinned compilers never get evicted, so tracking their frequency doesn't make sense
            return;
        }
        compiler.logFrequencyUsage();
    }

    /**
     * This adds a callback to be run for a given compiler once it's done with its
     * current build.
     * - `resolve` is called if the build is done (it's passed `false`), or if the
     *   compiler is currently running its first build (it's passed `true).
     * - `reject` is called if the compiler has errored out, or if it's shutting down.
     *
     * @param {string} name — the compiler's name
     * @param {function} resolve — success callback
     * @param {function} reject — failure callback
     */
    addDeferredCallback(name, resolve, reject) {
        if (!this.isCompilerActive(name)) {
            const errorMsg = `Tried to add callbacks for untracked compiler "${name}".`;
            logError(errorMsg);
            reject(new Error(errorMsg));
            return;
        }
        this.activeCompilers[name].addCallback({ resolve, reject });
    }

    /** ********************************************
     **
     ** GET STATUS AND DETAILS ABOUT ACTIVE COMPILERS
     **
     ** *******************************************/

    getAllBuildStatuses() {
        const result = {};
        Object.keys(this.activeCompilers).forEach((name) => {
            result[name] = this.activeCompilers[name].status;
        });
        return result;
    }

    /**
     * Get more complete compiler info on all compilers for debugging purposes
     * @return {Object} a map of data keyed on compiler names
     */
    getAllCompilerInfo() {
        const result = { compilers: {}, leastUsedCompiler: null };
        Object.entries(this.activeCompilers).forEach(([name, compiler]) => {
            result.compilers[name] = this.getInfoForCompiler(name);
        });
        result.leastUsedCompiler = this.getLeastUsedCompiler();
        return result;
    }

    /**
     * Get more complete compiler info about a specific compiler for debugging purposes
     * @param {string} name - compiler's name
     */
    getInfoForCompiler(name) {
        if (!this.isCompilerActive(name)) {
            logError(`Tried to get info for non-active compiler ${name}`);
            return;
        }
        const compiler = this.activeCompilers[name];
        return {
            status: compiler.status,
            errors: compiler.getCurrentErrors(),
            frequency: compiler.getFrequency(),
            frecency: compiler.getFrecency(),
            frequencyChecks: compiler.frequencyChecks,
            pinned: compiler.pinned,
        };
    }

    /**
     * Gets memory stats for the current process. Essentially wraps
     * process.memoryUsage(), but formats the values as megabytes with
     * two significant digits.
     * @return {Object} a key/value mapping of metrics and their values
     */
    getHumanReadableMemoryUsage() {
        const result = {};
        const usage = process.memoryUsage();
        for (const key in usage) {
            const usageString = Math.round((usage[key] / 1024 / 1024) * 100) / 100;
            result[key] = `${usageString} MB`;
        }
        return result;
    }

    /**
     * Sorts compilers by their frequency and returns the one that's used the least, or
     * null if there are no compilers.
     * @returns {string?} name of least used compiler, if there are any
     */
    getLeastUsedCompiler() {
        if (this.countActiveCompilers() === 0) {
            return null;
        }
        return Object.values(this.activeCompilers)
            .filter((compiler) => !compiler.pinned)
            .sort((c1, c2) => {
                if (this.useFrequency) {
                    return c2.getFrequency() < c1.getFrequency();
                } else {
                    return c2.getFrecency() < c1.getFrecency();
                }
            })[0].name;
    }

    /**
     * Calls invalidate on the compiler's Watching instance, without
     * stopping the watch process.
     * @param {string} name compiler's name
     * @return {boolean} true if we found a compiler and invalidated it, false otherwise.
     */
    invalidateCompiler(name) {
        if (!this.isCompilerActive(name)) {
            logError(
                `Tried to invalidate compiler ${name}, but it's not being managed`
            );
            return false;
        }
        const compiler = this.activeCompilers[name];
        compiler.invalidate();
        return true;
    }

    /**
     * Given the name of a compiler, return the webpack compiler if we're
     * managing it, or null if we're not.
     * @return {Compiler?}
     */
    getWebpackCompiler(name) {
        if (!this.isCompilerActive(name)) {
            logError(`Tried to find compiler ${name}, but it's not being managed`);
            return null;
        }
        return this.activeCompilers[name].compiler;
    }

    /**
     * Given a compiler's name, close the compiler and return a promise
     * that resolves after the watch process has stopped.
     * @param {string} name - compiler's name
     * @return {Promise<string|null>} - resolves to the name of the closed compiler,
     *      or null if that compiler does not exist or otherwise can't be closed.
     */
    closeCompiler(name) {
        if (!this.isCompilerActive(name)) {
            logError(`Tried to close compiler ${name}, but it's not being managed`);
            return Promise.resolve(null);
        }
        return new Promise((resolve, reject) => {
            const compiler = this.activeCompilers[name];
            compiler.watching.close(() => {
                delete this.activeCompilers[name];
                resolve(name);
            });
        });
    }
}

module.exports = CompilerManager;
