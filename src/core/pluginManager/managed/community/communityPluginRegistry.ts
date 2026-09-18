import type { ManagedPluginRecommendation } from "@/types/core/pluginManager";
import type { ManagedPluginDescriptor } from "../managedPluginLifecycle";
import KUWO_MANAGED_PLUGIN from "./sources/kuwoPluginSource";
import NETEASE_MANAGED_PLUGIN from "./sources/neteasePluginSource";

export const COMMUNITY_MANAGED_PLUGINS: readonly ManagedPluginDescriptor[] =
    Object.freeze([
        NETEASE_MANAGED_PLUGIN,
        KUWO_MANAGED_PLUGIN,
    ]);

export const UNAVAILABLE_COMMUNITY_RECOMMENDATIONS:
readonly ManagedPluginRecommendation[] = Object.freeze([
    Object.freeze({
        platform: "QQ音乐",
        trust: "community",
        availability: "unavailable",
        reason: "no-safe-source",
    }),
    Object.freeze({
        platform: "咪咕",
        trust: "community",
        availability: "unavailable",
        reason: "no-safe-source",
    }),
    Object.freeze({
        platform: "喜马拉雅",
        trust: "community",
        availability: "unavailable",
        reason: "no-safe-source",
    }),
    Object.freeze({
        platform: "5sing",
        trust: "community",
        availability: "unavailable",
        reason: "no-safe-source",
    }),
    Object.freeze({
        platform: "酷狗",
        trust: "community",
        availability: "unavailable",
        reason: "no-safe-source",
    }),
    Object.freeze({
        platform: "汽水音乐",
        trust: "community",
        availability: "unavailable",
        reason: "no-safe-source",
    }),
]);
