import { act, renderHook, waitFor } from "@testing-library/react-native";
import usePluginCatalog from "../hooks/usePluginCatalog";

const mockReadCached = jest.fn();
const mockRefresh = jest.fn();
const mockInstall = jest.fn();
const mockGetInstalledPlugins = jest.fn();
const mockIsManagedPlugin = jest.fn((_platform: string) => false);
const mockGetManagedPluginRecommendations = jest.fn();
const mockReconcileManagedRecommendations = jest.fn();
const mockBuildCatalogViewItems = jest.fn(
    (entries: Array<Record<string, unknown>>, ..._args: unknown[]) => entries,
);

jest.mock("@/core/pluginCatalog", () => ({
    __esModule: true,
    default: {
        readCached: (...args: unknown[]) => mockReadCached(...args),
        refresh: (...args: unknown[]) => mockRefresh(...args),
        install: (...args: unknown[]) => mockInstall(...args),
        getInstalledPlugins: (...args: unknown[]) =>
            mockGetInstalledPlugins(...args),
        isManagedPlugin: (platform: string) => mockIsManagedPlugin(platform),
        getManagedPluginRecommendations: () =>
            mockGetManagedPluginRecommendations(),
        reconcileManagedRecommendations: () =>
            mockReconcileManagedRecommendations(),
    },
    buildCatalogViewItems: (
        entries: Array<Record<string, unknown>>,
        installed: unknown,
        query: unknown,
        recommendations: unknown,
    ) => mockBuildCatalogViewItems(
        entries,
        installed,
        query,
        recommendations,
    ),
}));

const entry = {
    id: "https://plugins.example.com/a.js",
    name: "Example",
    version: "1.0.0",
    url: "https://plugins.example.com/a.js",
    host: "plugins.example.com",
};

describe("usePluginCatalog", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockBuildCatalogViewItems.mockImplementation(
            (entries: Array<Record<string, unknown>>) => entries,
        );
        mockReadCached.mockReturnValue({
            entries: [entry],
            fetchedAt: 1,
            stale: false,
        });
        mockRefresh.mockResolvedValue({
            entries: [entry],
            fetchedAt: 2,
            stale: false,
        });
        mockGetInstalledPlugins.mockReturnValue([]);
        mockGetManagedPluginRecommendations.mockReturnValue([]);
        mockReconcileManagedRecommendations.mockResolvedValue({});
    });

    it("renders cached entries and replaces them after refresh", async () => {
        const { result } = renderHook(() => usePluginCatalog());

        expect(result.current.items).toEqual([entry]);
        await waitFor(() => expect(result.current.refreshing).toBe(false));
        expect(mockRefresh).toHaveBeenCalledTimes(1);
        expect(mockBuildCatalogViewItems).toHaveBeenLastCalledWith(
            [entry],
            [],
            "",
            [],
        );

        act(() => result.current.setQuery("exam"));
        expect(mockBuildCatalogViewItems).toHaveBeenLastCalledWith(
            [entry],
            [],
            "exam",
            [],
        );
        expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    it("refreshes installed state after a successful install", async () => {
        mockInstall.mockResolvedValue({ success: true });
        mockGetInstalledPlugins
            .mockReturnValueOnce([])
            .mockReturnValueOnce([{ name: "Example", version: "1.0.0" }]);
        const { result } = renderHook(() => usePluginCatalog());
        await waitFor(() => expect(result.current.refreshing).toBe(false));

        await act(async () => {
            await result.current.install(entry);
        });

        expect(result.current.installing[entry.id]).toBe(false);
        expect(result.current.installErrors[entry.id]).toBeUndefined();
        expect(mockGetInstalledPlugins).toHaveBeenCalledTimes(2);
    });

    it("keeps an installation failure scoped to its row", async () => {
        mockInstall.mockResolvedValue({
            success: false,
            message: "Plugin rejected",
        });
        const { result } = renderHook(() => usePluginCatalog());
        await waitFor(() => expect(result.current.refreshing).toBe(false));

        await act(async () => {
            await result.current.install(entry);
        });

        expect(result.current.installing[entry.id]).toBe(false);
        expect(result.current.installErrors).toEqual({
            [entry.id]: "Plugin rejected",
        });
    });

    it("automatically reconciles recommendations and rereads installed state", async () => {
        const recommendation = {
            platform: "猫耳FM",
            version: "0.1.5-mymusic.1",
        };
        let finishReconciliation: ((failures: Record<string, string>) => void) |
            undefined;
        mockGetManagedPluginRecommendations.mockReturnValue([recommendation]);
        mockReconcileManagedRecommendations.mockImplementation(() =>
            new Promise(resolve => {
                finishReconciliation = resolve;
            }));
        mockGetInstalledPlugins
            .mockReturnValueOnce([])
            .mockReturnValue([{ name: "猫耳FM", version: recommendation.version }]);

        const { result } = renderHook(() => usePluginCatalog());

        await waitFor(() => expect(
            result.current.installing["managed-plugin:猫耳FM"],
        ).toBe(true));
        expect(mockReconcileManagedRecommendations).toHaveBeenCalledTimes(1);

        await act(async () => finishReconciliation?.({}));

        expect(result.current.installing["managed-plugin:猫耳FM"]).toBe(false);
        expect(mockGetInstalledPlugins).toHaveBeenCalledTimes(2);
        expect(mockBuildCatalogViewItems).toHaveBeenLastCalledWith(
            [entry],
            [{ name: "猫耳FM", version: recommendation.version }],
            "",
            [recommendation],
        );
    });

    it("clears stale managed errors after automatic reconciliation succeeds", async () => {
        const recommendation = {
            platform: "猫耳FM",
            version: "0.1.5-mymusic.1",
        };
        let finishReconciliation: ((failures: Record<string, string>) => void) |
            undefined;
        mockGetManagedPluginRecommendations.mockReturnValue([recommendation]);
        mockReconcileManagedRecommendations.mockImplementation(() =>
            new Promise(resolve => {
                finishReconciliation = resolve;
            }));
        mockInstall.mockResolvedValueOnce({
            success: false,
            message: "Unable to restore recommended plugin",
        });
        mockBuildCatalogViewItems.mockImplementation(
            (_entries, _installed, _query, recommendations) =>
                (recommendations as Array<typeof recommendation>).map(item => ({
                    id: `managed-plugin:${item.platform}`,
                    name: item.platform,
                    version: item.version,
                    host: "MyMusic",
                    managed: true,
                })),
        );

        const { result } = renderHook(() => usePluginCatalog());
        await waitFor(() => expect(result.current.items).toHaveLength(1));

        await act(async () => {
            await result.current.install(result.current.items[0] as never);
        });
        expect(result.current.installErrors).toEqual({
            "managed-plugin:猫耳FM": "Unable to restore recommended plugin",
        });

        await act(async () => finishReconciliation?.({}));
        await waitFor(() => expect(
            result.current.installErrors["managed-plugin:猫耳FM"],
        ).toBeUndefined());
    });

    it("keeps recommendations available without a remote catalog", async () => {
        const recommendation = {
            platform: "猫耳FM",
            version: "0.1.5-mymusic.1",
        };
        mockReadCached.mockReturnValue(null);
        mockRefresh.mockResolvedValue({
            entries: [],
            stale: false,
            error: "Unable to refresh the plugin catalog",
        });
        mockGetManagedPluginRecommendations.mockReturnValue([recommendation]);
        mockBuildCatalogViewItems.mockImplementation(
            (_entries, _installed, _query, recommendations) =>
                (recommendations as Array<typeof recommendation>).map(item => ({
                    id: `managed-plugin:${item.platform}`,
                    name: item.platform,
                })),
        );

        const { result } = renderHook(() => usePluginCatalog());

        expect(result.current.loading).toBe(false);
        expect(result.current.hasCatalogEntries).toBe(true);
        expect(result.current.items).toContainEqual({
            id: "managed-plugin:猫耳FM",
            name: "猫耳FM",
        });
        await waitFor(() => expect(result.current.refreshing).toBe(false));
        await waitFor(() => expect(
            result.current.installing["managed-plugin:猫耳FM"],
        ).toBe(false));
    });
});
