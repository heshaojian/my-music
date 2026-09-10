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
    const statusText = t(`pluginLibrary.status.${item.status}`);
    const actionText = item.status === "update"
        ? t("pluginLibrary.action.update")
        : item.status === "installed"
            ? t("pluginLibrary.status.installed")
            : t("pluginLibrary.action.install");

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
                disabled={busy || item.status === "installed"}
                accessibilityState={{
                    busy,
                    disabled: busy || item.status === "installed",
                }}
                style={styles.action}
                onPress={() => onInstall(item)}>
                {busy ? t("common.loading") : actionText}
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
