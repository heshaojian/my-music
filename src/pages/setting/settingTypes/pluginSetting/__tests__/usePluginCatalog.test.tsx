import { act, renderHook, waitFor } from "@testing-library/react-native";
import usePluginCatalog from "../hooks/usePluginCatalog";

const mockReadCached = jest.fn();
const mockRefresh = jest.fn();
const mockInstall = jest.fn();
const mockGetInstalledPlugins = jest.fn();
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
    },
    buildCatalogViewItems: (
        entries: Array<Record<string, unknown>>,
        installed: unknown,
        query: unknown,
    ) => mockBuildCatalogViewItems(entries, installed, query),
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
        );

        act(() => result.current.setQuery("exam"));
        expect(mockBuildCatalogViewItems).toHaveBeenLastCalledWith(
            [entry],
            [],
            "exam",
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
});
