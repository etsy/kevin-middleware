/**
 * This file exposes Kevin's factory. Call it with your configs, and it'll spit out a
 * middleware for you. Like this:
 *
 *   const kevin = new middlewareFactory(
 *      [...webpackConfigs],
 *      { ...kevinOptions }
 *   );
 *   app.use(kevin.getMiddleware());
 */

const middlewareFactory = require("./lib/middleware");
module.exports = middlewareFactory;
