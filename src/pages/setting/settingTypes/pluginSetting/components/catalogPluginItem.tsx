import React from "react";
import { StyleSheet, View } from "react-native";
import ListItem from "@/components/base/listItem";
import TextButton from "@/components/base/textButton";
import ThemeText from "@/components/base/themeText";
import { useI18N } from "@/core/i18n";
import type { CatalogViewItem } from "@/core/pluginCatalog";
import rpx from "@/utils/rpx";

interface CatalogPluginItemProps {
    item: CatalogViewItem;
    busy: boolean;
    error?: string;
    onInstall: (item: CatalogViewItem) => void;
}

export default function CatalogPluginItem({
    item,
    busy,
    error,
    onInstall,
}: CatalogPluginItemProps) {
    const { t } = useI18N();
    const managedInstalled = item.managed && item.status === "installed" && !error;
    const statusText = managedInstalled
        ? t("pluginLibrary.status.recommendedInstalled")
        : item.managed
            ? t("pluginLibrary.status.restoring")
            : t(`pluginLibrary.status.${item.status}`);
    const actionText = item.managed && error
        ? t("pluginLibrary.action.retry")
        : item.managed
            ? statusText
            : item.status === "update"
                ? t("pluginLibrary.action.update")
                : item.status === "installed"
                    ? statusText
                    : t("pluginLibrary.action.install");

    const disabled = busy || (item.managed ? !error : item.status === "installed");

    return (
        <ListItem withHorizontalPadding heightType="big">
            <ListItem.Content
                title={item.name}
                description={
                    <View>
                        <ThemeText fontSize="description" fontColor="textSecondary">
                            {`${item.version} - ${item.host} - ${statusText}`}
                        </ThemeText>
                        {error ? (
                            <ThemeText
                                numberOfLines={1}
                                fontSize="description"
                                color="red">
                                {error}
                            </ThemeText>
                        ) : null}
                    </View>
                }
            />
            <TextButton
                withHorizontalPadding
                disabled={disabled}
                accessibilityState={{
                    busy,
                    disabled,
                }}
                style={styles.action}
                onPress={() => onInstall(item)}>
                {busy && item.managed
                    ? t("pluginLibrary.status.restoring")
                    : busy
                        ? t("common.loading")
                        : actionText}
            </TextButton>
        </ListItem>
    );
}

const styles = StyleSheet.create({
    action: {
        minWidth: rpx(140),
        alignItems: "center",
    },
});
