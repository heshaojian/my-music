import { Dimensions, NativeModules, Platform } from "react-native";

interface INativeUtils {
    exitApp: () => void;
    checkStoragePermission: () => Promise<boolean>;
    requestStoragePermission: () => void;
    getWindowDimensions: () => { width: number, height: number }; // Fix bug: https://github.com/facebook/react-native/issues/47080
}

const nativeUtils = NativeModules.NativeUtils as INativeUtils | undefined;
const hasSandboxedStorageAccess = Platform.OS === "ios";

const NativeUtils: INativeUtils = nativeUtils ?? {
    exitApp: () => undefined,
    checkStoragePermission: async () => hasSandboxedStorageAccess,
    requestStoragePermission: () => undefined,
    getWindowDimensions: () => Dimensions.get("window"),
};

export default NativeUtils;
