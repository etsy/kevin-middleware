/**
 * This class manages a compiler, as well as any associated
 * processes and data around that compiler.
 */

// These are the states that a compiler can be in.
const { PLUGIN_NAME, FIRST_BUILD, BUILDING, ERROR, DONE } = require("./constants");
const { logError } = require("./logger");

// This is the number of minutes to consider when determining
// frequency. If the range is 10, frequency is calculated as the
// number of requests per minute on average for the last 10 minutes.
const MS_PER_MINUTE = 60 * 1000;
const FREQUENCY_RANGE = 60;

class ManagedCompiler {
    constructor(name, compiler, watching, status, pinned = false) {
        if (typeof name !== "string") {
            throw "ManagedCompiler must be initialized with a string name.";
        }

        if (!compiler || !watching) {
            throw "ManagedCompiler needs a reference to a compiler and its Watching instance.";
        }

        // external params
        this.name = name;
        this.compiler = compiler;
        this.watching = watching;
        this.setStatus(status);

        // internal state
        this.callbacks = [];
        this.frequencyChecks = [];
        this.numberOfUses = 0;
        this.lastUse = Date.now();
        this.lastErrors = [];

        this.pinned = !!pinned;

        this.addCompilationHooks(compiler);
    }

    addCompilationHooks(compiler) {
        // These hooks are for indicating the start of a new build. The state should
        // always be BUILDING, unless it's FIRST_BUILD (which is just a special sort of
        // BUILDING).
        compiler.hooks.invalid.tap(PLUGIN_NAME, () => {
            this.newCompilationHandler();
        });
        compiler.hooks.run.tap(PLUGIN_NAME, () => {
            this.newCompilationHandler();
        });
        compiler.hooks.watchRun.tap(PLUGIN_NAME, () => {
            this.newCompilationHandler();
        });
        // This hook indicates that the compilation is done, and any
        // outstanding requests should be resolved.
        compiler.hooks.done.tap(PLUGIN_NAME, (stats, hookCallback) => {
            this.finishedCompilationHandler(stats);
        });
        // This hook fires whenever the compilation fails. We should render errors in
        // the console if that's the case.
        compiler.hooks.failed.tap(PLUGIN_NAME, (error) => {
            this.failedCompilation(error);
        });
        // This hook indicates that a watcher has been closed, and any
        // unresolved requests should probably return 503's.
        compiler.hooks.watchClose.tap(PLUGIN_NAME, () => {
            this.closeCompilerHandler();
        });
    }

    newCompilationHandler() {
        if (this.status !== FIRST_BUILD) {
            this.setStatus(BUILDING);
        }
    }

    finishedCompilationHandler(stats) {
        // TODO: If we have errors from this build, we should expose them
        // to the callback, so that it can tell the user that something broke,
        // check the console, etc.
        if (stats.hasErrors()) {
            const errors = stats.compilation.errors;
            this.setStatus(ERROR, errors);
            errors.forEach(logError);
            this.rejectCallbacks(errors);
        } else {
            this.setStatus(DONE);
            this.resolveCallbacks(false);
        }
    }

    failedCompilation(error) {
        this.setStatus(ERROR, [error]);
        this.rejectCallbacks(error);
    }

    closeCompilerHandler() {
        // There may be outstanding requests, so we should close them
        this.rejectCallbacks(
            new Error("The compiler was closed before the request could be completed")
        );
    }

    /**
     * Sets the status of the compiler. Performs a validation check first, and
     * throws if we try and use an invalid status. You can optionally provide a list of
     * error messages to keep track of with the current state (we'll yell at you if you
     * don't provide any errors when setting the state to ERROR). We assume that these
     * errors don't need to be persisted across state changes.
     * @param {string} status - either "first-build","building","error", or "done"
     * @param {Error|Array} errors - a list of errors to set.
     */
    setStatus(status, errors = []) {
        errors = [].concat(errors).filter((error) => !!error);
        const statuses = [FIRST_BUILD, BUILDING, ERROR, DONE];
        if (!statuses.includes(status)) {
            throw `${status} is not a valid status for a compiler. Valid statuses include: ${statuses.join(
                ", "
            )}`;
        }

        if (status === ERROR && errors.length === 0) {
            logError(
                `Compiler for "${this.name}" was set to an ERROR state, but no error details were provided.`
            );
        }
        this.status = status;
        this.setCurrentErrors(errors);
    }

    /**
     * Sets the list of errors from the previous build
     * @param {Array<Error>} errors
     */
    setCurrentErrors(errors) {
        this.lastErrors = errors.map((err) => err.stack);
    }

    getCurrentErrors() {
        return this.lastErrors;
    }

    addCallback(deferred) {
        if (!deferred.resolve || !deferred.reject) {
            logError(
                `Compiler for "${this.name}" received a poorly formatted callback`
            );
        }
        this.callbacks.push(deferred);
    }

    clearCallbacks() {
        this.callbacks = [];
        return;
    }

    resolveCallbacks(response) {
        this.callbacks.forEach(({ resolve }) => {
            resolve(response);
        });
        this.clearCallbacks();
    }

    rejectCallbacks(response) {
        this.callbacks.forEach(({ reject }) => {
            reject(response);
        });
        this.clearCallbacks();
    }

    /**
     * When this method is called, it indicates that this compiler has been used
     * or accessed. This call is used to calculate the frequency with which this
     * compiler is used.
     */
    logFrequencyUsage() {
        // Since we always push, the oldest times are at the beginning
        // of the frequency array.
        const now = Date.now();
        // NOTE: we store now twice because one storage is for frequency,
        // and the other is for frecency. If we find one implementation is
        // better than the other, that'll make it easier to tear out.
        this.frequencyChecks.push(now);
        this.lastUse = now;
        this.numberOfUses++;
    }

    /**
     * Calculates and returns the number of times this compiler has been
     * used per minute, averaged over the last FREQUENCY_RANGE minutes.
     * @return {number} times per minute
     */
    getFrequency() {
        if (this.pinned) {
            return Infinity;
        }
        if (this.frequencyChecks.length === 0) {
            return 0;
        }
        // Prune events older than FREQUENCY_RANGE minutes
        const frequencyWindow = Date.now() - FREQUENCY_RANGE * MS_PER_MINUTE;
        while (this.frequencyChecks[1] < frequencyWindow) {
            this.frequencyChecks.shift();
        }

        return this.frequencyChecks.length / FREQUENCY_RANGE;
    }

    /**
     * Frecency calculation shamelessly grifted from z.sh:
     * https://github.com/rupa/z/wiki/frecency
     *
     * tl;dr: we bucket recency into 4 categories:
     *   - within the last minute
     *   - within the last 5 minutes
     *   - within the last half hour
     *   - everything else
     * We return the number of uses for a compiler, weighted higher or lower
     * based on which of those four buckets it falls into (lower bucket -> lower weight)
     */
    getFrecency() {
        if (this.pinned) {
            return Infinity;
        }
        const timeSinceUse = Date.now() - this.lastUse;
        if (timeSinceUse < MS_PER_MINUTE) {
            return this.numberOfUses * 4;
        } else if (timeSinceUse < 5 * MS_PER_MINUTE) {
            return this.numberOfUses * 2;
        } else if (timeSinceUse < 30 * MS_PER_MINUTE) {
            return this.numberOfUses / 2;
        }
        return this.numberOfUses / 4;
    }

    /**
     * Invalidates the compiler without killing it or its watching instance.
     */
    invalidate() {
        this.watching.invalidate();
        this.setStatus(BUILDING);
    }
}

module.exports = ManagedCompiler;
