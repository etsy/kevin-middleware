"use strict";

const CompilerManager = require("../../lib/CompilerManager");
const {
    FIRST_BUILD,
    BUILDING,
    ERROR,
    DONE,
    NOT_BUILT,
} = require("../../lib/constants");

beforeAll(() => {
    jest.spyOn(global.console, "error").mockImplementation(() => {});
});

afterAll(() => {
    global.console.error.mockRestore();
});

const getMockCompiler = () => {
    const hook = { tap: () => {} };
    return {
        hooks: {
            invalid: hook,
            run: hook,
            watchRun: hook,
            done: hook,
            watchClose: hook,
            failed: hook,
        },
    };
};

describe("manageCompiler", () => {
    it("should note a compiler's usage when it is added", () => {
        const manager = new CompilerManager();
        const compilerName = "nickelback";
        manager.manageCompiler(compilerName, getMockCompiler(), {});
        expect(manager.activeCompilers[compilerName]).toBeTruthy();
        const compiler = manager.activeCompilers[compilerName];
        expect(compiler.getFrequency()).not.toEqual(0);
        expect(compiler.getFrecency()).not.toEqual(0);
    });
});

describe("isCompilerActive", () => {
    it("should return true only if a compiler with the given name is active", () => {
        const manager = new CompilerManager();
        manager.manageCompiler("nick", getMockCompiler(), {});
        manager.manageCompiler("elback", getMockCompiler(), {});
        expect(manager.isCompilerActive("nick")).toEqual(true);
        expect(manager.isCompilerActive("elback")).toEqual(true);
        expect(manager.isCompilerActive("sucks")).toEqual(false);
    });
});

describe("countActiveCompilers", () => {
    it("should return the number of active compilers", () => {
        const manager = new CompilerManager();
        const watcher = {
            close: (callback) => {
                callback();
            },
        };
        expect(manager.countActiveCompilers()).toEqual(0);
        manager.manageCompiler("nick", getMockCompiler(), watcher);
        expect(manager.countActiveCompilers()).toEqual(1);
        manager.manageCompiler("elback", getMockCompiler(), watcher);
        expect(manager.countActiveCompilers()).toEqual(2);
        return manager
            .closeCompiler("nick")
            .then((name) => {
                expect(manager.isCompilerActive(name)).toEqual(false);
                expect(manager.countActiveCompilers()).toEqual(1);
                return manager.closeCompiler("elback");
            })
            .then((name) => {
                expect(manager.isCompilerActive(name)).toEqual(false);
                expect(manager.countActiveCompilers()).toEqual(0);
            });
    });
});

describe("getStatus", () => {
    it("should return the status of an active compiler", () => {
        const manager = new CompilerManager();
        manager.manageCompiler("nick", getMockCompiler(), {});
        manager.manageCompiler("elback", getMockCompiler(), {}, DONE);
        expect(manager.getStatus("nick")).toEqual(FIRST_BUILD);
        expect(manager.getStatus("elback")).toEqual(DONE);
        manager.setStatus("nick", BUILDING);
        expect(manager.getStatus("nick")).toEqual(BUILDING);
    });
    it("should return null when getting the status of an unknown compiler", () => {
        const manager = new CompilerManager();
        manager.manageCompiler("nick", getMockCompiler(), {});
        expect(manager.getStatus("nick")).not.toBeNull();
        expect(manager.getStatus("three doors down")).toBeNull();
    });
});

describe("getAllBuildStatuses", () => {
    it("should show the build states of active compilers", () => {
        const manager = new CompilerManager();
        manager.manageCompiler("nick", getMockCompiler(), {});
        manager.manageCompiler("elback", getMockCompiler(), {}, BUILDING);
        manager.manageCompiler("isnt", getMockCompiler(), {}, DONE);
        manager.manageCompiler("good", getMockCompiler(), {}, ERROR);
        expect(manager.getAllBuildStatuses()).toEqual({
            nick: FIRST_BUILD,
            elback: BUILDING,
            isnt: DONE,
            good: ERROR,
        });
        manager.setStatus("nick", DONE);
        manager.setStatus("elback", DONE);
        manager.setStatus("isnt", DONE);
        manager.setStatus("good", DONE);
        expect(manager.getAllBuildStatuses()).toEqual({
            nick: DONE,
            elback: DONE,
            isnt: DONE,
            good: DONE,
        });
    });
});

describe("getAllCompilerInfo", () => {
    it("should return an object with both active and inactive compilers", () => {
        const manager = new CompilerManager();
        // Active compilers
        manager.manageCompiler("iam", getMockCompiler(), {});
        manager.manageCompiler("an", getMockCompiler(), {}, BUILDING);
        manager.manageCompiler("active", getMockCompiler(), {}, DONE);
        manager.manageCompiler("region", getMockCompiler(), {}, ERROR);

        // All compilers
        const configNames = ["foo", "bar", "lala", "iam", "an", "active", "region"];
        expect(manager.getAllCompilerInfo(configNames)).toEqual(
            expect.objectContaining({
                compilers: {
                    iam: expect.objectContaining({
                        status: FIRST_BUILD,
                    }),
                    an: expect.objectContaining({
                        status: BUILDING,
                    }),
                    active: expect.objectContaining({
                        status: DONE,
                    }),
                    region: expect.objectContaining({
                        status: ERROR,
                    }),
                    // Inactive compilers should not have any other info
                    foo: {
                        status: NOT_BUILT,
                    },
                    bar: {
                        status: NOT_BUILT,
                    },
                    lala: {
                        status: NOT_BUILT,
                    },
                },
            })
        );
    });

    it("should return more information about the active compilers", () => {
        const manager = new CompilerManager();
        // Active compilers
        manager.manageCompiler("iam", getMockCompiler(), {});
        manager.manageCompiler("an", getMockCompiler(), {}, BUILDING);
        manager.manageCompiler("active", getMockCompiler(), {}, DONE);
        manager.manageCompiler("region", getMockCompiler(), {}, ERROR);

        const configNames = ["foo", "bar", "lala", "iam", "an", "active", "region"];
        const moreInfo = {
            errors: expect.any(Array),
            frequency: expect.any(Number),
            frecency: expect.any(Number),
            frequencyChecks: expect.any(Array),
            pinned: expect.any(Boolean),
        };

        expect(manager.getAllCompilerInfo(configNames)).toEqual({
            compilers: expect.objectContaining({
                iam: {
                    status: FIRST_BUILD,
                    ...moreInfo,
                },
                an: {
                    status: BUILDING,
                    ...moreInfo,
                },
                active: {
                    status: DONE,
                    ...moreInfo,
                },
                region: {
                    status: ERROR,
                    ...moreInfo,
                },
            }),
            leastUsedCompiler: expect.any(String),
        });
    });
});
