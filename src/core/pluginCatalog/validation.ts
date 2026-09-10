import { validate } from "compare-versions";
import {
    MAX_CATALOG_BYTES,
    MAX_CATALOG_ENTRIES,
    MAX_PLUGIN_NAME_LENGTH,
    MAX_PLUGIN_URL_LENGTH,
    MAX_PLUGIN_VERSION_LENGTH,
} from "./constants";
import type { CatalogEntry } from "./types";

export function utf8ByteLength(value: string): number {
    return encodeURIComponent(value).replace(/%[0-9A-F]{2}|./gi, "x").length;
}

export function normalizeHttpsUrl(value: unknown): URL {
    if (typeof value !== "string" || value.length > MAX_PLUGIN_URL_LENGTH) {
        throw new Error("Invalid URL");
    }

    const url = new URL(value.trim());
    if (
        url.protocol !== "https:" ||
        url.username.length > 0 ||
        url.password.length > 0
    ) {
        throw new Error("Invalid URL");
    }
    url.hash = "";
    return url;
}

function normalizeEntry(value: unknown): CatalogEntry | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }

    const raw = value as Record<string, unknown>;
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const version = typeof raw.version === "string" ? raw.version.trim() : "";
    if (
        name.length === 0 ||
        name.length > MAX_PLUGIN_NAME_LENGTH ||
        version.length === 0 ||
        version.length > MAX_PLUGIN_VERSION_LENGTH ||
        !validate(version)
    ) {
        return null;
    }

    try {
        const url = normalizeHttpsUrl(raw.url);
        const canonicalUrl = url.toString();
        return Object.freeze({
            id: canonicalUrl,
            name,
            version,
            url: canonicalUrl,
            host: url.hostname,
        });
    } catch {
        return null;
    }
}

export function parseCatalogManifest(text: string): CatalogEntry[] {
    if (utf8ByteLength(text) > MAX_CATALOG_BYTES) {
        throw new Error("Plugin catalog is too large");
    }

    let manifest: unknown;
    try {
        manifest = JSON.parse(text);
    } catch {
        throw new Error("Invalid plugin catalog manifest");
    }
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
        throw new Error("Invalid plugin catalog manifest");
    }

    const rawEntries = (manifest as Record<string, unknown>).plugins;
    if (!Array.isArray(rawEntries)) {
        throw new Error("Invalid plugin catalog manifest");
    }
    if (rawEntries.length > MAX_CATALOG_ENTRIES) {
        throw new Error("Plugin catalog has too many entries");
    }

    const seenUrls = new Set<string>();
    const seenNames = new Set<string>();
    const entries = rawEntries.reduce<CatalogEntry[]>((result, rawEntry) => {
        const entry = normalizeEntry(rawEntry);
        const normalizedName = entry?.name.toLocaleLowerCase("en-US");
        if (
            !entry ||
            seenUrls.has(entry.url) ||
            seenNames.has(normalizedName!)
        ) {
            return result;
        }
        seenUrls.add(entry.url);
        seenNames.add(normalizedName!);
        return [...result, entry];
    }, []);

    if (rawEntries.length > 0 && entries.length === 0) {
        throw new Error("Plugin catalog contains no valid plugins");
    }
    return entries;
}

export function filterCatalogEntries(
    entries: CatalogEntry[],
    query: string,
): CatalogEntry[] {
    const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
    if (!normalizedQuery) {
        return [...entries];
    }
    return entries.filter(entry =>
        entry.name.toLocaleLowerCase("en-US").includes(normalizedQuery) ||
        entry.host.toLocaleLowerCase("en-US").includes(normalizedQuery),
    );
}
