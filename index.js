/**
 * This file exposes Kevin's factory. Call it with your configs, and it'll spit out a
 * middleware for you. Like this:
 *
 *   app.use(middlewareFactory(
 *      [...webpackConfigs],
 *      { ...kevinOptions }
 *   ));
 */

const middlewareFactory = require("./lib/middleware");
module.exports = middlewareFactory;
