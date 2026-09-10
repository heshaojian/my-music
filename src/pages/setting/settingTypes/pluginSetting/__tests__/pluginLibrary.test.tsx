import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import PluginLibrary from "../views/pluginLibrary";

const mockShowDialog = jest.fn();
const mockPersistGet = jest.fn();
const mockPersistSet = jest.fn();
const mockInstall = jest.fn(async () => ({ success: true }));
const mockRefresh = jest.fn(async () => undefined);

const item = {
    id: "https://plugins.example.com/a.js",
    name: "Example",
    version: "1.0.0",
    url: "https://plugins.example.com/a.js",
    host: "plugins.example.com",
    status: "available" as const,
};

let mockCatalogState: Record<string, any>;

jest.mock("../hooks/usePluginCatalog", () => ({
    __esModule: true,
    default: () => mockCatalogState,
}));
jest.mock("@/components/dialogs/useDialog", () => ({
    showDialog: (...args: unknown[]) => mockShowDialog(...args),
}));
jest.mock("@/utils/persistStatus", () => ({
    __esModule: true,
    default: {
        get: (...args: unknown[]) => mockPersistGet(...args),
        set: (...args: unknown[]) => mockPersistSet(...args),
    },
}));
jest.mock("@/core/i18n", () => ({
    useI18N: () => ({ t: (key: string) => key }),
}));
jest.mock("@/hooks/useColors", () => ({
    __esModule: true,
    default: () => ({ card: "#222", text: "#fff" }),
}));
jest.mock("@/components/base/appBar", () => {
    const { Text } = require("react-native");
    return ({ children }: { children: string }) => <Text>{children}</Text>;
});
jest.mock("@/components/base/horizontalSafeAreaView", () => {
    const { View } = require("react-native");
    return ({ children }: { children: React.ReactNode }) => <View>{children}</View>;
});
jest.mock("@/components/base/themeText", () => {
    const { Text } = require("react-native");
    return ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>;
});
jest.mock("@/components/base/input", () => {
    const { TextInput } = require("react-native");
    return (props: Record<string, unknown>) => <TextInput {...props} />;
});
jest.mock("@/components/base/textButton", () => {
    const { Pressable, Text } = require("react-native");
    return ({ children, onPress }: { children: string; onPress: () => void }) => (
        <Pressable accessibilityLabel={children} onPress={onPress}>
            <Text>{children}</Text>
        </Pressable>
    );
});
jest.mock("../components/catalogPluginItem", () => {
    const { Pressable, Text } = require("react-native");
    return ({ item: plugin, onInstall }: Record<string, any>) => (
        <Pressable
            accessibilityLabel={`install-${plugin.name}`}
            onPress={() => onInstall(plugin)}>
            <Text>{plugin.name}</Text>
        </Pressable>
    );
});

describe("PluginLibrary", () => {
    beforeEach(() => {
        mockCatalogState = {
            items: [item],
            query: "",
            setQuery: jest.fn(),
            refresh: mockRefresh,
            refreshing: false,
            loading: false,
            stale: false,
            error: undefined,
            hasCatalogEntries: true,
            installing: {},
            installErrors: {},
            install: mockInstall,
        };
        mockPersistGet.mockReturnValue(false);
    });

    it("gates the first installation behind the trust warning", () => {
        const screen = render(<PluginLibrary />);

        fireEvent.press(screen.getByLabelText("install-Example"));

        expect(mockInstall).not.toHaveBeenCalled();
        expect(mockShowDialog).toHaveBeenCalledWith(
            "SimpleDialog",
            expect.objectContaining({
                title: "pluginLibrary.trust.title",
            }),
        );

        const dialog = mockShowDialog.mock.calls[0][1];
        dialog.onOk();
        expect(mockPersistSet).toHaveBeenCalledWith(
            "app.pluginCatalogTrustAccepted",
            true,
        );
        expect(mockInstall).toHaveBeenCalledWith(item);
    });

    it("installs directly after trust was accepted", () => {
        mockPersistGet.mockReturnValue(true);
        const screen = render(<PluginLibrary />);

        fireEvent.press(screen.getByLabelText("install-Example"));

        expect(mockShowDialog).not.toHaveBeenCalled();
        expect(mockInstall).toHaveBeenCalledWith(item);
    });

    it("shows cached and retryable failure states", () => {
        mockCatalogState = {
            ...mockCatalogState,
            items: [],
            stale: true,
            error: "offline",
            hasCatalogEntries: false,
        };
        const screen = render(<PluginLibrary />);

        expect(screen.getByText("pluginLibrary.cachedNotice")).toBeTruthy();
        fireEvent.press(screen.getByLabelText("pluginLibrary.retry"));
        expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    it("shows initial loading before catalog data is available", () => {
        mockCatalogState = {
            ...mockCatalogState,
            items: [],
            loading: true,
            hasCatalogEntries: false,
        };

        const screen = render(<PluginLibrary />);

        expect(screen.getByText("common.loading")).toBeTruthy();
    });
});
