import React from "react";
import {
    FlatList,
    RefreshControl,
    StyleSheet,
    View,
} from "react-native";
import AppBar from "@/components/base/appBar";
import Empty from "@/components/base/empty";
import HorizontalSafeAreaView from "@/components/base/horizontalSafeAreaView";
import Input from "@/components/base/input";
import Loading from "@/components/base/loading";
import TextButton from "@/components/base/textButton";
import ThemeText from "@/components/base/themeText";
import { showDialog } from "@/components/dialogs/useDialog";
import { useI18N } from "@/core/i18n";
import type { CatalogViewItem } from "@/core/pluginCatalog";
import useColors from "@/hooks/useColors";
import PersistStatus from "@/utils/persistStatus";
import rpx from "@/utils/rpx";
import CatalogPluginItem from "../components/catalogPluginItem";
import usePluginCatalog from "../hooks/usePluginCatalog";

export default function PluginLibrary() {
    const { t } = useI18N();
    const colors = useColors();
    const catalog = usePluginCatalog();

    const install = (item: CatalogViewItem) => {
        if (PersistStatus.get("app.pluginCatalogTrustAccepted")) {
            catalog.install(item);
            return;
        }
        showDialog("SimpleDialog", {
            title: t("pluginLibrary.trust.title"),
            content: t("pluginLibrary.trust.content"),
            okText: t("pluginLibrary.trust.confirm"),
            onOk() {
                PersistStatus.set("app.pluginCatalogTrustAccepted", true);
                catalog.install(item);
            },
        });
    };

    const emptyContent = catalog.hasCatalogEntries
        ? t("pluginLibrary.noResults")
        : t("pluginLibrary.empty");

    return (
        <>
            <AppBar>{t("pluginLibrary.title")}</AppBar>
            <HorizontalSafeAreaView style={styles.wrapper}>
                <Input
                    value={catalog.query}
                    onChangeText={catalog.setQuery}
                    accessibilityLabel={t("pluginLibrary.search")}
                    placeholder={t("pluginLibrary.search")}
                    style={[styles.search, { backgroundColor: colors.card }]} />
                {catalog.stale ? (
                    <ThemeText
                        fontSize="description"
                        fontColor="textSecondary"
                        style={styles.notice}>
                        {t("pluginLibrary.cachedNotice")}
                    </ThemeText>
                ) : null}
                {catalog.loading ? (
                    <Loading />
                ) : catalog.error && !catalog.hasCatalogEntries ? (
                    <View style={styles.center}>
                        <ThemeText fontSize="title">
                            {t("pluginLibrary.loadError")}
                        </ThemeText>
                        <TextButton
                            withHorizontalPadding
                            style={styles.retry}
                            onPress={catalog.refresh}>
                            {t("pluginLibrary.retry")}
                        </TextButton>
                    </View>
                ) : (
                    <FlatList
                        data={catalog.items}
                        keyExtractor={item => item.id}
                        refreshControl={
                            <RefreshControl
                                refreshing={catalog.refreshing}
                                onRefresh={catalog.refresh}
                                tintColor={colors.text} />
                        }
                        ListEmptyComponent={<Empty content={emptyContent} />}
                        renderItem={({ item }) => (
                            <CatalogPluginItem
                                item={item}
                                busy={Boolean(catalog.installing[item.id])}
                                error={catalog.installErrors[item.id]}
                                onInstall={install} />
                        )} />
                )}
            </HorizontalSafeAreaView>
        </>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        width: "100%",
        flex: 1,
    },
    search: {
        height: rpx(76),
        marginHorizontal: rpx(24),
        marginVertical: rpx(16),
        borderRadius: rpx(20),
    },
    notice: {
        marginHorizontal: rpx(24),
        marginBottom: rpx(12),
    },
    center: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    retry: {
        marginTop: rpx(24),
    },
});
