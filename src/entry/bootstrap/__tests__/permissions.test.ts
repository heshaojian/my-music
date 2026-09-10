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

describe("getAndroidPermissionApi", () => {
    afterEach(() => {
        jest.resetModules();
        jest.dontMock("react-native");
        jest.dontMock("react-native-permissions");
    });

    it("does not load the native permissions package on iOS", () => {
        jest.resetModules();
        jest.doMock("react-native", () => ({
            Platform: { OS: "ios" },
        }));
        jest.doMock("react-native-permissions", () => {
            throw new Error("react-native-permissions must not initialize on iOS");
        });

        const { getAndroidPermissionApi } = require("@/entry/bootstrap/permissionApi");

        expect(getAndroidPermissionApi()).toBeUndefined();
    });

    it("loads Android permission functions only on Android", () => {
        const check = jest.fn();
        const request = jest.fn();
        jest.resetModules();
        jest.doMock("react-native", () => ({
            Platform: { OS: "android" },
        }));
        jest.doMock("react-native-permissions", () => ({
            check,
            request,
            PERMISSIONS: {
                ANDROID: {
                    READ_EXTERNAL_STORAGE: "android.permission.READ_EXTERNAL_STORAGE",
                    WRITE_EXTERNAL_STORAGE: "android.permission.WRITE_EXTERNAL_STORAGE",
                },
            },
        }));

        const { getAndroidPermissionApi } = require("@/entry/bootstrap/permissionApi");

        expect(getAndroidPermissionApi()).toEqual({
            check,
            request,
            readExternalStorage: "android.permission.READ_EXTERNAL_STORAGE",
            writeExternalStorage: "android.permission.WRITE_EXTERNAL_STORAGE",
        });
    });
});
