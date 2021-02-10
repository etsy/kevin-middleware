/**
 * This file contains centralized logging for Kevin.
 * Having centralized logging logic keeps us from using console.log
 * everywhere, and can make it easier to inject custom logging in the future.
 */
const colorReset = "\x1b[0m";
const colorBright = "\x1b[1m";
const colorFgRed = "\x1b[31m";
const colorFgYellow = "\x1b[33m";
const colorFgBlue = "\x1b[34m";

/**
 * Use this method to log basic information. This method should be used for, say, events
 * that you'd like to see if you were reading through the logs after the fact.
 * @param {string} msg — this is what gets logged
 */
const logInfo = function (msg) {
    // eslint-disable-next-line no-console
    console.log(`  ${colorFgBlue}[KEVIN]${colorReset} ${msg}${colorReset}`);
};

/**
 * Use this method to log regular, but important, events. This method is most useful for
 * logging events that you'd like to know about as they happen (i.e. a compiler has
 * just started).
 * @param {string} msg — this is what gets logged
 */
const logNotice = function (msg) {
    logInfo(`${colorBright + colorFgYellow}${msg}`);
};

/**
 * Use this method for errors, or things that imply something unexpected has happened.
 * @param {string} msg — this is what gets logged
 */
const logError = function (err) {
    // eslint-disable-next-line no-console
    console.error(`  ${colorFgRed}[KEVIN]${colorReset}`, err);
};

module.exports = { logInfo, logNotice, logError };
