import { Platform } from "react-native";
import type {
    Permission,
    PermissionStatus,
} from "react-native-permissions";

export interface AndroidPermissionApi {
    check: (permission: Permission) => Promise<PermissionStatus>;
    request: (permission: Permission) => Promise<PermissionStatus>;
    readExternalStorage?: Permission;
    writeExternalStorage?: Permission;
}

export function getAndroidPermissionApi(): AndroidPermissionApi | undefined {
    if (Platform.OS !== "android") {
        return undefined;
    }

    const permissionModule = require("react-native-permissions") as typeof import("react-native-permissions");

    return {
        check: permissionModule.check,
        request: permissionModule.request,
        readExternalStorage:
            permissionModule.PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE,
        writeExternalStorage:
            permissionModule.PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE,
    };
}
