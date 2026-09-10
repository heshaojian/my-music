import { describe, expect, it } from "@jest/globals";

import { aliasFixture } from "@/test/mocks/aliasFixture";

describe("test harness", () => {
    it("resolves application modules through the @/ alias", () => {
        expect(aliasFixture).toBe("resolved");
    });
});
