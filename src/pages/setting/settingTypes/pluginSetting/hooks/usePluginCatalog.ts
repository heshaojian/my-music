import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import pluginCatalogService, {
    buildCatalogViewItems,
    CatalogEntry,
    CatalogLoadResult,
} from "@/core/pluginCatalog";

export default function usePluginCatalog() {
    const cached = useMemo(() => pluginCatalogService.readCached(), []);
    const recommendations = useMemo(
        () => pluginCatalogService.getManagedPluginRecommendations(),
        [],
    );
    const [result, setResult] = useState<CatalogLoadResult | null>(cached);
    const [query, setQuery] = useState("");
    const [refreshing, setRefreshing] = useState(false);
    const [installing, setInstalling] = useState<Record<string, boolean>>({});
    const [installErrors, setInstallErrors] = useState<Record<string, string>>({});
    const [installed, setInstalled] = useState(() =>
        pluginCatalogService.getInstalledPlugins(),
    );
    const mounted = useRef(true);

    useEffect(() => () => {
        mounted.current = false;
    }, []);

    const refresh = useCallback(async () => {
        setRefreshing(true);
        const nextResult = await pluginCatalogService.refresh();
        if (mounted.current) {
            setResult(nextResult);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    useEffect(() => {
        if (recommendations.length === 0) {
            return;
        }
        const managedIds = recommendations.map(
            item => `managed-plugin:${item.platform}`,
        );
        setInstalling(current => ({
            ...current,
            ...Object.fromEntries(managedIds.map(id => [id, true])),
        }));
        pluginCatalogService.reconcileManagedRecommendations().then(failures => {
            if (!mounted.current) {
                return;
            }
            setInstalled(pluginCatalogService.getInstalledPlugins());
            setInstalling(current => ({
                ...current,
                ...Object.fromEntries(managedIds.map(id => [id, false])),
            }));
            setInstallErrors(current => ({
                ...Object.fromEntries(Object.entries(current).filter(
                    ([id]) => !managedIds.includes(id),
                )),
                ...Object.fromEntries(Object.entries(failures).map(
                    ([platform, message]) =>
                        [`managed-plugin:${platform}`, message],
                )),
            }));
        }).catch(() => {
            if (!mounted.current) {
                return;
            }
            setInstalling(current => ({
                ...current,
                ...Object.fromEntries(managedIds.map(id => [id, false])),
            }));
            setInstallErrors(current => ({
                ...current,
                ...Object.fromEntries(managedIds.map(id => [
                    id,
                    "Unable to restore recommended plugin",
                ])),
            }));
        });
    }, [recommendations]);

    const install = useCallback(async (entry: CatalogEntry) => {
        setInstalling(current => ({ ...current, [entry.id]: true }));
        setInstallErrors(current => Object.fromEntries(
            Object.entries(current).filter(([id]) => id !== entry.id),
        ));
        const installResult = await pluginCatalogService.install(entry);
        if (mounted.current) {
            setInstalling(current => ({ ...current, [entry.id]: false }));
            if (installResult.success) {
                setInstalled(pluginCatalogService.getInstalledPlugins());
            } else {
                setInstallErrors(current => ({
                    ...current,
                    [entry.id]: installResult.message ?? "Installation failed",
                }));
            }
        }
        return installResult;
    }, []);

    const items = useMemo(
        () => buildCatalogViewItems(
            result?.entries ?? [],
            installed,
            query,
            recommendations,
        ),
        [installed, query, recommendations, result?.entries],
    );

    return {
        items,
        query,
        setQuery,
        refresh,
        refreshing,
        loading: result === null && recommendations.length === 0,
        stale: result?.stale ?? false,
        error: result?.error,
        hasCatalogEntries: Boolean(
            recommendations.length || result?.entries.length,
        ),
        installing,
        installErrors,
        install,
    };
}
