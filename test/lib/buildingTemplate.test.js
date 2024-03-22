const buildingTemplate = require("../../lib/buildingTemplate");

describe("buildingTemplate", () => {
    describe("perfMarkerPrefix argument", () => {
        const assetName = "fish.js";
        const configName = "aquatic";
        const kevinStatusUrl = "http://gonefishingtonight.com";
        const additionalInfo = "blub blub";
        it("uses empty string when not passed in", () => {
            const result = buildingTemplate(
                assetName,
                configName,
                kevinStatusUrl,
                additionalInfo
            );
            expect(result).toContain(`performance.mark("kevin-overlay-start")`);
            expect(result).toContain(`performance.mark("kevin-overlay-end")`);
            expect(result).toContain(
                `performance.measure("kevin-overlay", "kevin-overlay-start", "kevin-overlay-end")`
            );
        });
        it("uses provided prefix string", () => {
            const result = buildingTemplate(
                assetName,
                configName,
                kevinStatusUrl,
                additionalInfo,
                "ocean_"
            );
            expect(result).toContain(`performance.mark("ocean_kevin-overlay-start")`);
            expect(result).toContain(`performance.mark("ocean_kevin-overlay-end")`);
            expect(result).toContain(
                `performance.measure("ocean_kevin-overlay", "ocean_kevin-overlay-start", "ocean_kevin-overlay-end")`
            );
        });
    });
});
