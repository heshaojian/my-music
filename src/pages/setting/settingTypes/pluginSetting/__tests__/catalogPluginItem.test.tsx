import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import CatalogPluginItem from "../components/catalogPluginItem";

jest.mock("@/core/i18n", () => ({
    useI18N: () => ({ t: (key: string) => key }),
}));
jest.mock("@/utils/rpx", () => ({
    __esModule: true,
    default: (value: number) => value,
}));
jest.mock("@/components/base/listItem", () => {
    const { View } = require("react-native");
    const ListItem = ({ children }: { children: React.ReactNode }) => (
        <View>{children}</View>
    );
    ListItem.Content = ({ title, description }: Record<string, unknown>) => (
        <View accessibilityLabel={String(title)}>{description}</View>
    );
    return ListItem;
});
jest.mock("@/components/base/themeText", () => {
    const { Text } = require("react-native");
    return ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>;
});
jest.mock("@/components/base/textButton", () => {
    const { Pressable, Text } = require("react-native");
    return ({
        children,
        disabled,
        accessibilityState,
        onPress,
    }: Record<string, any>) => (
        <Pressable
            accessibilityLabel={String(children)}
            accessibilityState={accessibilityState}
            disabled={disabled}
            onPress={onPress}>
            <Text>{children}</Text>
        </Pressable>
    );
});

const availableItem = {
    id: "https://plugins.example.com/a.js",
    name: "Example",
    version: "1.0.0",
    url: "https://plugins.example.com/a.js",
    host: "plugins.example.com",
    managed: false,
    status: "available" as const,
};

describe("CatalogPluginItem", () => {
    it("shows metadata and invokes install for an available plugin", () => {
        const onInstall = jest.fn();
        const screen = render(
            <CatalogPluginItem
                item={availableItem}
                busy={false}
                onInstall={onInstall} />,
        );

        expect(screen.getByText(
            "1.0.0 - plugins.example.com - pluginLibrary.status.available",
        )).toBeTruthy();
        fireEvent.press(screen.getByLabelText("pluginLibrary.action.install"));
        expect(onInstall).toHaveBeenCalledWith(availableItem);
    });

    it("disables an already-installed plugin", () => {
        const onInstall = jest.fn();
        const screen = render(
            <CatalogPluginItem
                item={{ ...availableItem, status: "installed" }}
                busy={false}
                onInstall={onInstall} />,
        );

        const button = screen.getByLabelText("pluginLibrary.status.installed");
        expect(button.props.accessibilityState).toEqual({
            busy: false,
            disabled: true,
        });
        fireEvent.press(button);
        expect(onInstall).not.toHaveBeenCalled();
    });

    it("shows busy and row error states", () => {
        const screen = render(
            <CatalogPluginItem
                item={{ ...availableItem, status: "update" }}
                busy
                error="Install failed"
                onInstall={jest.fn()} />,
        );

        expect(screen.getByText("Install failed")).toBeTruthy();
        expect(screen.getByLabelText("common.loading").props.accessibilityState)
            .toEqual({ busy: true, disabled: true });
    });

    it("shows automatic restoration for a missing managed plugin", () => {
        const managedItem = {
            ...availableItem,
            name: "猫耳FM",
            managed: true,
        };
        const screen = render(
            <CatalogPluginItem
                item={managedItem}
                busy
                onInstall={jest.fn()} />,
        );

        expect(screen.getByLabelText("pluginLibrary.status.restoring")
            .props.accessibilityState).toEqual({ busy: true, disabled: true });
        expect(screen.queryByText("pluginLibrary.action.repair")).toBeNull();
    });

    it("offers an exact local retry after managed restoration fails", () => {
        const managedItem = {
            ...availableItem,
            name: "猫耳FM",
            managed: true,
        };
        const onInstall = jest.fn();
        const screen = render(
            <CatalogPluginItem
                item={managedItem}
                busy={false}
                error="Unable to restore recommended plugin"
                onInstall={onInstall} />,
        );

        fireEvent.press(screen.getByLabelText("pluginLibrary.action.retry"));
        expect(onInstall).toHaveBeenCalledWith(managedItem);
    });

    it("labels an installed managed plugin without an action", () => {
        const screen = render(
            <CatalogPluginItem
                item={{
                    ...availableItem,
                    name: "猫耳FM",
                    managed: true,
                    status: "installed",
                }}
                busy={false}
                onInstall={jest.fn()} />,
        );

        expect(screen.getByText(
            "1.0.0 - plugins.example.com - pluginLibrary.status.recommendedInstalled",
        )).toBeTruthy();
        expect(screen.getByLabelText("pluginLibrary.status.recommendedInstalled")
            .props.accessibilityState.disabled).toBe(true);
    });

    it("labels an installed community plugin without an action", () => {
        const screen = render(
            <CatalogPluginItem
                item={{
                    ...availableItem,
                    name: "网易云",
                    managed: true,
                    managedTrust: "community",
                    managedAvailability: "bundled",
                    status: "installed",
                }}
                busy={false}
                onInstall={jest.fn()} />,
        );

        expect(screen.getByText(
            "1.0.0 - plugins.example.com - pluginLibrary.status.communityInstalled",
        )).toBeTruthy();
        expect(screen.getByLabelText("pluginLibrary.status.communityInstalled")
            .props.accessibilityState.disabled).toBe(true);
    });

    it("renders unavailable community providers without an enabled action", () => {
        const onInstall = jest.fn();
        const screen = render(
            <CatalogPluginItem
                item={{
                    ...availableItem,
                    name: "5sing",
                    managed: true,
                    managedTrust: "community",
                    managedAvailability: "unavailable",
                    status: "unavailable",
                }}
                busy={false}
                onInstall={onInstall} />,
        );

        const label = "pluginLibrary.status.communityUnavailable · pluginLibrary.reason.noSafeSource";
        expect(screen.getByText(`1.0.0 - plugins.example.com - ${label}`))
            .toBeTruthy();
        const button = screen.getByLabelText(label);
        expect(button.props.accessibilityState.disabled).toBe(true);
        fireEvent.press(button);
        expect(onInstall).not.toHaveBeenCalled();
    });
});
