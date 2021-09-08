describe("kevin's defer utility", () => {
    const { defer } = require("../../lib/utils");

    it("returns a resolveable deferred promise", () => {
        const { promise, resolve } = defer();
        setTimeout(() => {
            resolve("hi hello im nick");
        }, 1);
        return expect(promise).resolves.toBe("hi hello im nick");
    });

    it("returns a rejectable deferred promise", () => {
        const { promise, reject } = defer();
        setTimeout(() => {
            reject(new Error("oh no i'm not nick"));
        }, 1);
        return expect(promise).rejects.toThrow("oh no i'm not nick");
    });
});

describe("kevin's getPathToServe utility", () => {
    const { getPathToServe } = require("../../lib/utils");

    const entry = "test-entry.en-US.js";
    const reqPath = `/assets/webpack/js/${entry}`;
    const path = "/home/some/path/to/htdocs/assets/dist/js/webpack";
    const publicPath = "https://your.sick.dev.server.com/assets/webpack/js/";
    const mockCompiler = {
        options: {
            output: { path, publicPath },
        },
    };

    it("finds the correct location for a built asset for a given request", () => {
        const expectedPathToServe = `${path}/${entry}`;
        const result = getPathToServe(mockCompiler, reqPath);
        expect(result).toEqual(expectedPathToServe);
    });

    const reqPath2 = `/${entry}`;
    const publicPath2 = "https://your.sick.dev.server.com/";
    const mockCompiler2 = {
        options: {
            output: { path, publicPath: publicPath2 },
        },
    };

    it("finds the correct file on disk for public paths without a url prefix", () => {
        const expectedPathToServe = `${path}/${entry}`;
        const result = getPathToServe(mockCompiler2, reqPath2);
        expect(result).toEqual(expectedPathToServe);
    });
});

describe("kevin's validateConfigs utility", () => {
    const { validateConfigs } = require("../../lib/utils");
    const validConfig = {
        name: "validConfig",
    };
    const anotherValidConfig = {
        name: "validConfig", // same name is intentional
    };

    it("turns a single config into an array of configs", () => {
        const result = validateConfigs(validConfig);
        expect(result).toEqual(expect.arrayContaining(result));
        expect(result).toHaveLength(1);
    });

    it("throws an exception when a config is missing a name", () => {
        expect(() => {
            validateConfigs({});
        }).toThrowError(/missing a name/);
        expect(() => {
            validateConfigs([{}]);
        }).toThrowError(/missing a name/);
        expect(() => {
            validateConfigs([{}, validConfig]);
        }).toThrowError(/missing a name/);
    });

    it("throws an exception when two configs have the same name", () => {
        expect(() => {
            validateConfigs([validConfig, validConfig]);
        }).toThrowError(/your configs share a name/);
        expect(() => {
            validateConfigs([validConfig, anotherValidConfig]);
        }).toThrowError(/your configs share a name/);
    });
});
describe("initializeEntryMap", () => {
    const { initializeEntryMap } = require("../../lib/utils");

    it("returns a list of names of all configs able to handle entrypoint", () => {
        const configs = [
            {
                name: "someConfigEntry",
                entry: {
                    someEntryPoint: `./someEntryPoint`,
                },
            },
            {
                name: "someOtherConfigEntry",
                entry: {
                    someEntryPoint: `./someEntryPoint`,
                },
            },
        ];

        const entryMap = initializeEntryMap(configs);

        expect(entryMap.someEntryPoint).toEqual([
            "someConfigEntry",
            "someOtherConfigEntry",
        ]);
    });
});
