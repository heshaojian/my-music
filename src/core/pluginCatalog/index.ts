import axios from "axios";
import getOrCreateMMKV from "@/utils/getOrCreateMMKV";
import PluginManager from "@/core/pluginManager";
import { createCatalogCache, createCatalogTransport } from "./adapters";
import { createPluginCatalogService } from "./service";

const catalogCacheStore = getOrCreateMMKV("plugin.catalog");

const pluginCatalogService = createPluginCatalogService({
    transport: createCatalogTransport(axios),
    cache: createCatalogCache(catalogCacheStore),
    installer: PluginManager,
    now: Date.now,
});

export default pluginCatalogService;
export * from "./constants";
export * from "./status";
export * from "./types";
export * from "./validation";
export * from "./viewModel";
