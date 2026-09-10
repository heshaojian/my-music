import type { Permission, PermissionStatus } from "react-native-permissions";

export type BootstrapPlatform = "android" | "ios" | string;

export interface BootstrapPermissionDependencies {
    checkAllFilesAccess: () => Promise<boolean>;
    shouldSkipAllFilesDialog: () => boolean;
    showAllFilesDialog: () => void;
    checkLegacyPermission: (permission: Permission) => Promise<PermissionStatus>;
    requestLegacyPermission: (permission: Permission) => Promise<PermissionStatus>;
    legacyReadPermission?: Permission;
    legacyWritePermission?: Permission;
}

export async function ensureBootstrapPermissions(
    platform: BootstrapPlatform,
    version: number,
    dependencies: BootstrapPermissionDependencies,
): Promise<void> {
    if (platform !== "android") {
        return;
    }

    if (version >= 30) {
        const hasPermission = await dependencies.checkAllFilesAccess();
        if (!hasPermission && !dependencies.shouldSkipAllFilesDialog()) {
            dependencies.showAllFilesDialog();
        }
        return;
    }

    const permissions = [
        dependencies.legacyReadPermission ?? "android.permission.READ_EXTERNAL_STORAGE",
        dependencies.legacyWritePermission ?? "android.permission.WRITE_EXTERNAL_STORAGE",
    ];
    const statuses = await Promise.all(
        permissions.map(permission => dependencies.checkLegacyPermission(permission)),
    );

    await Promise.all(
        permissions
            .filter((_, index) => statuses[index] !== "granted")
            .map(permission => dependencies.requestLegacyPermission(permission)),
    );
}
