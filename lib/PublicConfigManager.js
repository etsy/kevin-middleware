/**
 * This acts as a public API to some of Kevin’s internal methods
 */

class PublicConfigManager {
    /**
     * @param {Kevin} kevin
     * @param {CompilerManager} manager
     */
    constructor(kevin, manager) {
        this.kevin = kevin;
        this.manager = manager;
    }

    /**
     * Given a config, find or start a compiler for it, and then register
     * a callback to be invoked once it's all done building everything.
     * @param {string} configName - the name of a single-compiler webpack config.
     * @return {Promise<bool>} - promise representing whether or not this is the first
     *      build of a new compiler (true) or a rebuild of an existing one (false)
     */
    buildConfig(configName) {
        return this.kevin.buildConfig(configName);
    }

    /**
     * Given a compiler's name, close the compiler and return a promise
     * that resolves after the watch process has stopped.
     * @param {string} name - compiler's name
     * @return {Promise<string|null>} - resolves to the name of the closed compiler,
     *      or null if that compiler does not exist or otherwise can't be closed.
     */
    closeCompiler(name) {
        return this.manager.closeCompiler(name);
    }

    /**
     * @param {string} name - compiler's name
     * @returns {bool}
     */
    isCompilerActive(name) {
        return this.manager.isCompilerActive(name);
    }

    /**
     * Returns a list of compiler names currently active
     * @returns {Array<string>}
     */
    getActiveCompilerNames() {
        return Object.keys(this.manager.getAllBuildStatuses());
    }
}

module.exports = PublicConfigManager;
