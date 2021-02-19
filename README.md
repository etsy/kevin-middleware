# kevin-middleware

# `(ง° ͜ʖ°)ง 📦 📦 📦`

Kevin is an [Express-style][express-middleware] middleware that makes developing with [Webpack][webpack] in a monorepo a lot simpler. It's loosely based off of [Webpack's dev middleware][webpack-dev-middleware], and it is intended to be used as a replacement for it. **Only use this middleware in development please!**

Using Webpack in development in a monorepo can be challenging because, by default, it will try to keep your entire JavaScript codebase in memory. This can be remarkably resource-intensive. Kevin addresses this problem by allowing you to create separate Webpack configs for different parts of your codebase; it then manages these configs by having Webpack only watch and build relevant files.

### How does it do that?

When Kevin receives a request for an asset, it determines which config is responsible for building that particular asset and spins up an instance of Webpack to handle building it. Kevin will keep any compiler running as long as you regularly use it, up to a configurable limit. It automatically turns off any unused compilers in order to conserve your resources. It blocks on requests, but it will render a loading modal for newly-initialized compilers (since initial builds can take a bit of time).

## Requirements

To use this middleware, you must:

-   be using Webpack version 4.0.0 or later (but not Webpack 5 yet!),
-   use it with a server that accepts [Express-style][express-middleware] middleware,
-   and have a [`name` property][webpack-name] specified in all of your Webpack configs.

## How do I use it?

First, install `kevin-middleware` in your project:

```sh
npm install --save-dev kevin-middleware
```

Then, add `kevin-middleware` to your server. For example:

```js
const express = require("express");
const Kevin = require("kevin-middleware");

// This is an array of webpack configs. Each config **must** be named so that we can
// uniquely identify each one consistently. A regular ol' webpack config should work just
// fine as well.
const webpackConfigs = require("path/to/webpack.config.js");

// Setup your server and configure Kevin
const app = express();

const kevin = new Kevin(webpackConfigs, {
    kevinPublicPath: "http://localhost:3000"
});
app.use(kevin.getMiddleware());

// Serve static files as needed. This is required if you generate async chunks; Kevin
// only knows about the entrypoints in your configs, so it has to assume that everything
// else is handled by a different middleware.
app.use("/ac/webpack/js", express.static(webpackConfigs[0].output.path));

// Let 'er rip
app.listen(3000);
```

For a complete example, check out [this repository][kevin-example].

---

Kevin is initialized with two arguments: your webpack config (or more probably your array
of configs) and an options object:

```js
const kevin = new Kevin(webpackConfigs [, options ] );
```

Once you've instantiated a new instance of Kevin, call `getMiddleware` to get access to an Express-style middleware function:

```js
app.use(kevin.getMiddleware());
```

## Options

The Kevin constructor accepts an options object. All of these are optional and have reasonable defaults.

#### `maxCompilers`

-   Type: `Integer`
-   Default: `3`

The maximum number of compilers you want to have running at any point in time. Set this to 0 to never evict anything (but that will probably make you run out of memory).

#### `buildOnly`

-   Type: `Boolean`
-   Default: `false`

Only build assets; don't handle serving them. This is useful if you want to do something with the built asset before serving it, in which case you'd handle that logic yourself after the Kevin middleware does its thing.

#### `kevinPublicPath`

-   Type: `String`
-   Default: `null`

Root path for Kevin's internal API to be exposed through. This is used to tell the loading modal where to look for data on the status of builds. This should be set to the path that this middleware is bound to. For now, this path can _not_ end in a slash. If set to null, auto-refresh is disabled.

#### `kevinApiPrefix`

-   Type: `String`
-   Default: `"/__kevin"`

This is a prefix for Kevin's internal API. You probably don't need to change this unless you have an asset being served that's named `__kevin` or something.

#### `getAssetName`

-   Type: `Function`
-   Default: `(requestPath, req, res) => requestPath.replace(/^\//, "").replace(/\.js$/, "")`

Given a request path, req object, and res object, return the name of the asset we're trying to serve. Useful if you have entries that don't map to the filenames they render.

#### `additionalOverlayInfo`

-   Type: `String`
-   Default: `""`

This is a string that's inserted into the overlay, in order to provide users with additional information. It's useful if you'd like to provide feedback to users of your server, like "If you run into issues, try running restart_server_please.sh". This string may contain valid HTML.

## Hooks

To further extend Kevin's capabilities, we used Webpack's [Tapable][tapable] framework to provide access to some of Kevin's core functionality. You can use a hook much like you would with Webpack:

```js
// Tap into hooks first...
kevin.hooks.compilerStart.tap("MySweetLoggingPlugin", compilerName => {
    CustomLogger.log(`The ${compilerName} compiler just started up`);
});

// before adding Kevin to your server.
app.use(kevin.getMiddleware());
```

Here are the hooks you can take advantage of:

### `start` (`SyncHook`)

This hook is run just after the middleware starts and before any requests are handled.
You may find this useful to eagerly start a compiler as soon as Kevin starts, or to attach file watchers to your configs to restart a compiler when its config has changed on disk.
Callback parameters:

-   `configs`: an array of the configs Kevin is responsible for
-   `configManager : PublicConfigManager`: an object containing methods for understanding and managing configs and their compilers
    -   `buildConfig(configName : string) => Promise<bool>` — given the name of a managed webpack config, starts a compiler for it (if one doesn't already exist). Returns a promise that resolves to `true` immediately if this is the first build for that config, or `false` after a rebuild has finished.
    -   `closeCompiler(configName : string) => Promise<string|null>` — given a config name, close the compiler responsible for it, if it exists. Returns a promise that resolves to the name of the config once the compiler responsible for it has closed, or null if no such compiler could be found.
    -   `isCompilerActive(configName : string) => bool` — given a config name, returns true if and only if there is a compiler running for that config.
    -   `getActiveCompilerNames() => Array<string>` — returns a list of all active compiler names.

### `compilerStart` (`SyncHook`)

This hook is run immediately before a webpack compiler is started. It has one parameter:

-   `compilerName` — The name of the compiler that we're gonna start.

### `compilerClose` (`SyncHook`)

This hook is run just before a compiler is about to close. It has one parameter:

-   `evictionOptions` — An object containing two properties:
    -   `compilerToEvict : string` — the name of the compiler we're about to evict.
    -   `compilerStats` — an object containing metadata about the compiler, including its current build status, a measure of its' frequency of use and its frecency, a list of times it's been used, whether or not its pinned, and any errors it currently has.

### `handleRequest` (`SyncHook`)

This hook is called after we know Kevin is responsible for a request, but before anything actually happens (like closing or starting compilers). It has a few parameters:

-   `request` — the Express request object.
-   `assetName : string` — the name of the asset that we're going to build.
-   `compilerName : string` — the name of the compiler that we're planning on using (or spinning up) to handle the request.

## Internal API

If you'd like to access additional details about the status of Kevin (and the compilers it manages), you can hit Kevin't internal web API. By default, this is hosted at `[kevinPublicPath][kevinApiPrefix]`. So, for example, if you had the following configuration:

```js
{
    kevinPublicPath: "http://your.webpack.server.dev",
    kevinApiPrefix: "/__kevin"
}
```

the internal API would be hosted at `http://your.webpack.server.dev/__kevin/[route]`.

The following routes are available:

### `/build-status`

This endpoint shows the state of each compiler. The overlay uses this endpoint to know whether or not to reload the page.

### `/compiler-info`

This endpoint shows general details about each compiler, particularly metrics around its use and whether it may be eligible for eviction.

### `/memory-usage`

This enpoint lists memory stats for the process in which kevin is being run.

## Why did you do all this?

Webpack is an awesome JavaScript build system. It's powerful, flexible, and widely
adopted. However, using it to build and manage a monorepo can be tough for a couple of
reasons:

1. Webpack retains a lot of data in memory to allow for fast iterative builds and other
   performance-related optimizations.
2. In order to identify optimizations across entire projects (like identifying groups of
   modules to bundle into their own asset), Webpack needs to build the entirety of your
   project at once.

The combination of these things makes it very resource-intensive to build large
projects on reasonable computers. This is particularly problematic at Etsy, where most
of our web code lives in one large repository. Most of the current solutions involve manually
running an instance of webpack with a configuration for a particular part of your codebase,
but having to constantly start and stop compilers just to browse around the site can be
frustrating. We needed something that would be mindful of our resource limitations,
while still being essentially maintenance-free; as long as the server is running,
built JavaScript should just show up in the browser.

Our solution was to separate different parts of our site into their own configs, placing
assets in the same config when they belonged to the same experience or flow.
To glue it all together, we use Kevin to ensure that regions were automatically started
and stopped as we browsed arond the site, with as little interaction from developers as
possible. We named this middleware Kevin because it was the best name we could think of
at the time.

[webpack-dev-middleware]: https://github.com/webpack/webpack-dev-middleware
[tapable]: https://github.com/webpack/tapable
[webpack]: https://webpack.js.org
[express-middleware]: https://expressjs.com/en/guide/using-middleware.html
[webpack-name]: https://webpack.js.org/configuration/other-options/#name
[kevin-example]: https://github.com/joebeachjoebeach/kevin-example
