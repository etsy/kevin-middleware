"use strict";

const PublicConfigManager = require("../../lib/PublicConfigManager");

const getMockKevin = () => {
    return {
        buildConfig: jest.fn(),
    };
};

const getMockCompiler = () => {
    return {
        closeCompiler: jest.fn(),
        isCompilerActive: jest.fn(),
        getAllBuildStatuses: jest.fn(),
    };
};

describe("buildConfig", () => {
    const mockKevin = getMockKevin();
    const mockCompiler = getMockCompiler();

    const configManager = new PublicConfigManager(mockKevin, mockCompiler);
    it("should proxy the call to kevins buildConfig.", () => {
        configManager.buildConfig("test-config");
        expect(mockKevin.buildConfig).toHaveBeenCalledWith("test-config");
    });
});

describe("closeCompiler", () => {
    const mockKevin = getMockKevin();
    const mockCompiler = getMockCompiler();

    const configManager = new PublicConfigManager(mockKevin, mockCompiler);
    it("should proxy the call to CompilerManager's closeCompiler.", () => {
        configManager.closeCompiler("test-config");
        expect(mockCompiler.closeCompiler).toHaveBeenCalledWith("test-config");
    });
});

describe("isCompilerActive", () => {
    const mockKevin = getMockKevin();
    const mockCompiler = getMockCompiler();

    const configManager = new PublicConfigManager(mockKevin, mockCompiler);
    it("should proxy the call to CompilerManager's isCompilerActive.", () => {
        configManager.isCompilerActive("test-config");
        expect(mockCompiler.isCompilerActive).toHaveBeenCalledWith("test-config");
    });
});

describe("getActiveCompilerNames", () => {
    const mockKevin = getMockKevin();
    const mockCompiler = getMockCompiler();

    mockCompiler.getAllBuildStatuses.mockReturnValue({
        "common-entrypoints": "done",
        "mission-control": "done",
        "core-marketplace": "done",
    });

    const configManager = new PublicConfigManager(mockKevin, mockCompiler);
    it("should return a list of active compilers in kevin", () => {
        const compilerNames = configManager.getActiveCompilerNames();
        compilerNames.sort();
        expect(mockCompiler.getAllBuildStatuses).toHaveBeenCalled();
        expect(compilerNames).toEqual([
            "common-entrypoints",
            "core-marketplace",
            "mission-control",
        ]);
    });
});
