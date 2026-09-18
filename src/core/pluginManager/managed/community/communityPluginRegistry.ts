import type { ManagedPluginRecommendation } from "@/types/core/pluginManager";
import type { ManagedPluginDescriptor } from "../managedPluginLifecycle";
import KUWO_MANAGED_PLUGIN from "./sources/kuwoPluginSource";
import MIGU_MANAGED_PLUGIN from "./sources/miguPluginSource";
import NETEASE_MANAGED_PLUGIN from "./sources/neteasePluginSource";
import QQ_MANAGED_PLUGIN from "./sources/qqPluginSource";
import XIMALAYA_MANAGED_PLUGIN from "./sources/ximalayaPluginSource";

export const COMMUNITY_MANAGED_PLUGINS: readonly ManagedPluginDescriptor[] =
    Object.freeze([
        NETEASE_MANAGED_PLUGIN,
        QQ_MANAGED_PLUGIN,
        KUWO_MANAGED_PLUGIN,
        MIGU_MANAGED_PLUGIN,
        XIMALAYA_MANAGED_PLUGIN,
    ]);

export const UNAVAILABLE_COMMUNITY_RECOMMENDATIONS:
readonly ManagedPluginRecommendation[] = Object.freeze([
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
