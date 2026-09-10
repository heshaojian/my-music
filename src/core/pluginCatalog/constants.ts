import type { PluginCatalogSource } from "./types";

export const MAX_CATALOG_BYTES = 512 * 1024;
export const MAX_CATALOG_ENTRIES = 100;
export const MAX_PLUGIN_NAME_LENGTH = 120;
export const MAX_PLUGIN_VERSION_LENGTH = 50;
export const MAX_PLUGIN_URL_LENGTH = 2048;

export const OFFICIAL_PLUGIN_CATALOG: PluginCatalogSource = Object.freeze({
    id: "musicfree-official",
    name: "MusicFree Official",
    manifestUrl:
        "https://raw.githubusercontent.com/maotoumao/MusicFreePlugins/master/plugins.json",
    trust: "official",
});
