import { ensureBootstrapPermissions } from "@/entry/bootstrap/permissions";
import type { PermissionStatus } from "react-native-permissions";

describe("ensureBootstrapPermissions", () => {
    const createDependencies = () => ({
        checkAllFilesAccess: jest.fn(async () => false),
        shouldSkipAllFilesDialog: jest.fn(() => false),
        showAllFilesDialog: jest.fn(),
        checkLegacyPermission: jest.fn(async (): Promise<PermissionStatus> => "denied"),
        requestLegacyPermission: jest.fn(async (): Promise<PermissionStatus> => "granted"),
    });

    it("does not request Android storage permissions on iOS", async () => {
        const dependencies = createDependencies();

        await ensureBootstrapPermissions("ios", 18, dependencies);

        expect(dependencies.checkAllFilesAccess).not.toHaveBeenCalled();
        expect(dependencies.checkLegacyPermission).not.toHaveBeenCalled();
        expect(dependencies.requestLegacyPermission).not.toHaveBeenCalled();
    });

    it("shows the existing all-files dialog on modern Android", async () => {
        const dependencies = createDependencies();

        await ensureBootstrapPermissions("android", 35, dependencies);

        expect(dependencies.showAllFilesDialog).toHaveBeenCalledTimes(1);
        expect(dependencies.checkLegacyPermission).not.toHaveBeenCalled();
    });

    it("requests denied legacy permissions on older Android", async () => {
        const dependencies = createDependencies();

        await ensureBootstrapPermissions("android", 29, dependencies);

        expect(dependencies.checkLegacyPermission).toHaveBeenCalledTimes(2);
        expect(dependencies.requestLegacyPermission).toHaveBeenCalledTimes(2);
    });
});
