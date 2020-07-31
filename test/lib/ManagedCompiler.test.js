"use strict";

const ManagedCompiler = require("../../lib/ManagedCompiler");
const { FIRST_BUILD, BUILDING, ERROR, DONE } = require("../../lib/constants");

let consoleSpy;

beforeAll(() => {
    consoleSpy = jest.spyOn(global.console, "error").mockImplementation(() => {});
});

afterAll(() => {
    consoleSpy.mockRestore();
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

describe("constructor", () => {
    it("should throw an exception if you don't provide a name", () => {
        expect(() => {
            new ManagedCompiler(null, null, null, null);
        }).toThrow("ManagedCompiler must be initialized with a string name.");
    });
    it("should throw an exception if compiler or watching instances are missing", () => {
        const error =
            "ManagedCompiler needs a reference to a compiler and its Watching instance.";
        expect(() => {
            new ManagedCompiler("name", null, {}, null);
        }).toThrow(error);
        expect(() => {
            new ManagedCompiler("name", getMockCompiler(), null, null);
        }).toThrow(error);
    });
    it("should throw an exception if initialized with an invalid status", () => {
        expect(() => {
            new ManagedCompiler("name", getMockCompiler(), {}, null);
        }).toThrow(/is not a valid status for a compiler/);
    });
    it("should not throw anything if provided with all of its required inputs", () => {
        expect(() => {
            new ManagedCompiler("name", getMockCompiler(), {}, FIRST_BUILD);
        }).not.toThrow();
    });
});

describe("setStatus", () => {
    const compiler = new ManagedCompiler("name", getMockCompiler(), {}, BUILDING);
    it("should update a compiler's status.", () => {
        compiler.setStatus(ERROR);
        expect(compiler.status).toEqual(ERROR);
        compiler.setStatus(DONE);
        expect(compiler.status).toEqual(DONE);
    });
    it("should throw an exception if provided with a bad status", () => {
        expect(() => {
            compiler.setStatus(null);
        }).toThrow(/is not a valid status for a compiler/);
        expect(() => {
            compiler.setStatus("THAKNS");
        }).toThrow(/is not a valid status for a compiler/);
    });
});

describe("logFrequencyUsage", () => {
    it("should update usage stats when called", () => {
        const compiler = new ManagedCompiler("name", getMockCompiler(), {}, BUILDING);

        compiler.logFrequencyUsage();
        const lastUse = compiler.lastUse;
        const frequencyChecksCount = compiler.frequencyChecks.length;
        const numberOfUses = compiler.numberOfUses;

        compiler.logFrequencyUsage();
        expect(compiler.numberOfUses).toEqual(numberOfUses + 1);
        expect(compiler.frequencyChecks.length).toEqual(frequencyChecksCount + 1);
        expect(compiler.lastUse).toBeGreaterThanOrEqual(lastUse);
        expect(compiler.frequencyChecks).toContain(lastUse);
        expect(compiler.frequencyChecks).toContain(compiler.lastUse);
    });
});

describe("getFrequency", () => {
    it("should return Infinity for pinned compilers", () => {
        const comp = getMockCompiler();
        const compiler = new ManagedCompiler("name", comp, {}, BUILDING, true);
        expect(compiler.getFrequency()).toEqual(Infinity);
    });
    it("should return zero for an unused (unpinned) compiler", () => {
        const compiler = new ManagedCompiler("name", getMockCompiler(), {}, BUILDING);
        expect(compiler.getFrequency()).toEqual(0);
    });
    it("should strictly increase with increased usage", () => {
        const compiler = new ManagedCompiler("name", getMockCompiler(), {}, BUILDING);
        const freq1 = compiler.getFrequency();
        compiler.logFrequencyUsage();
        const freq2 = compiler.getFrequency();
        compiler.logFrequencyUsage();
        const freq3 = compiler.getFrequency();
        expect(freq1).toBeLessThan(freq2);
        expect(freq2).toBeLessThan(freq3);
    });
});

describe("getFrecency", () => {
    it("should return Infinity for pinned compilers", () => {
        const comp = getMockCompiler();
        const compiler = new ManagedCompiler("name", comp, {}, BUILDING, true);
        expect(compiler.getFrecency()).toEqual(Infinity);
    });
    it("should return zero for an unused (unpinned) compiler", () => {
        const compiler = new ManagedCompiler("name", getMockCompiler(), {}, BUILDING);
        expect(compiler.getFrecency()).toEqual(0);
    });
    it("should strictly increase with increased usage", () => {
        const compiler = new ManagedCompiler("name", getMockCompiler(), {}, BUILDING);
        const freq1 = compiler.getFrecency();
        compiler.logFrequencyUsage();
        const freq2 = compiler.getFrecency();
        compiler.logFrequencyUsage();
        const freq3 = compiler.getFrecency();
        expect(freq1).toBeLessThan(freq2);
        expect(freq2).toBeLessThan(freq3);
    });
});
describe("getFrecency", () => {
    const watching = {
        invalidate: jest.fn(),
    };
    const compiler = new ManagedCompiler("name", getMockCompiler(), watching, DONE);
    it("should call watching.invalidate()", () => {
        expect(watching.invalidate).not.toHaveBeenCalled();
        compiler.invalidate();
        expect(watching.invalidate).toHaveBeenCalled();
    });
    it("should set the status to BUILDING", () => {
        compiler.setStatus(DONE);
        compiler.invalidate();
        expect(compiler.status).toEqual(BUILDING);
    });
});
