import type {
    IInstallPluginResult,
} from "@/types/core/pluginManager";

export interface PluginCatalogSource {
    id: string;
    name: string;
    manifestUrl: string;
    trust: "official";
}

export interface CatalogEntry {
    id: string;
    name: string;
    version: string;
    url: string;
    host: string;
}

export interface CatalogCacheRecord {
    schemaVersion: 1;
    sourceId: string;
    fetchedAt: number;
    entries: CatalogEntry[];
}

export interface InstalledPluginSnapshot {
    name: string;
    version?: string;
    srcUrl?: string;
}

export type CatalogEntryStatus = "available" | "installed" | "update";

export interface CatalogLoadResult {
    entries: CatalogEntry[];
    fetchedAt?: number;
    stale: boolean;
    error?: string;
}

export interface CatalogTransport {
    getText(url: string, maxBytes: number): Promise<{
        text: string;
        finalUrl?: string;
    }>;
}

export interface CatalogCache {
    read(sourceId: string): CatalogCacheRecord | null;
    write(record: CatalogCacheRecord): void;
}

export interface CatalogInstaller {
    installPluginFromUrl(url: string): Promise<IInstallPluginResult>;
    getInstalledPlugins(): InstalledPluginSnapshot[];
}
