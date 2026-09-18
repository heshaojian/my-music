import { errorLog } from "@/utils/log";
import BILIBILI_MANAGED_PLUGIN from "./bilibiliPluginSource";
import AUDIOMACK_MANAGED_PLUGIN from "./audiomackPluginSource";
import YOUTUBE_MANAGED_PLUGIN from "./youtubePluginSource";
import GECIWANG_MANAGED_PLUGIN from "./geciwangPluginSource";
import GECIQIANXUN_MANAGED_PLUGIN from "./geciqianxunPluginSource";
import NAVIDROME_MANAGED_PLUGIN from "./navidromePluginSource";
import SUNO_MANAGED_PLUGIN from "./sunoPluginSource";
import UDIO_MANAGED_PLUGIN from "./udioPluginSource";
import MAOERFM_MANAGED_PLUGIN from "./maoerfmPluginSource";
import KUAISHOU_MANAGED_PLUGIN from "./kuaishouPluginSource";
import YINYUETAI_MANAGED_PLUGIN from "./yinyuetaiPluginSource";
import WEBDAV_MANAGED_PLUGIN from "./webdavPluginSource";
import { ManagedPluginDescriptor } from "./managedPluginLifecycle";
import type { ManagedPluginRecommendation } from "@/types/core/pluginManager";
import {
    COMMUNITY_MANAGED_PLUGINS,
    UNAVAILABLE_COMMUNITY_RECOMMENDATIONS,
} from "./community/communityPluginRegistry";

export type { ManagedPluginRecommendation } from "@/types/core/pluginManager";

interface ManagedPluginInstaller {
    ensureManagedPlugin(
        descriptor: ManagedPluginDescriptor,
    ): Promise<unknown>;
}

interface ManagedPluginRepairInstaller {
    ensureManagedPlugin(
        descriptor: ManagedPluginDescriptor,
    ): Promise<{
        plugin: {
            name: string;
            hash: string;
        };
    }>;
}

type ManagedPluginFailureHandler = (
    platform: string,
    error: unknown,
) => void;

export const OFFICIAL_MANAGED_PLUGINS: readonly ManagedPluginDescriptor[] =
Object.freeze([
    BILIBILI_MANAGED_PLUGIN,
    AUDIOMACK_MANAGED_PLUGIN,
    YOUTUBE_MANAGED_PLUGIN,
    GECIWANG_MANAGED_PLUGIN,
    GECIQIANXUN_MANAGED_PLUGIN,
    NAVIDROME_MANAGED_PLUGIN,
    SUNO_MANAGED_PLUGIN,
    UDIO_MANAGED_PLUGIN,
    MAOERFM_MANAGED_PLUGIN,
    KUAISHOU_MANAGED_PLUGIN,
    YINYUETAI_MANAGED_PLUGIN,
    WEBDAV_MANAGED_PLUGIN,
]);

export const BUNDLED_MANAGED_PLUGINS: readonly ManagedPluginDescriptor[] =
Object.freeze([
    ...OFFICIAL_MANAGED_PLUGINS,
    ...COMMUNITY_MANAGED_PLUGINS,
]);

const COMMUNITY_MANAGED_PLATFORMS = new Set(
    COMMUNITY_MANAGED_PLUGINS.map(plugin => plugin.platform),
);

const reportManagedPluginFailure: ManagedPluginFailureHandler = platform => {
    errorLog("Managed plugin setup failed", {
        platform,
        trust: COMMUNITY_MANAGED_PLATFORMS.has(platform)
            ? "community"
            : "official",
    });
};

const BUNDLED_MANAGED_PLATFORMS = new Set(
    [
        ...BUNDLED_MANAGED_PLUGINS.map(plugin => plugin.platform),
        ...UNAVAILABLE_COMMUNITY_RECOMMENDATIONS.map(item => item.platform),
    ],
);

export function isBundledManagedPluginPlatform(platform: string) {
    return BUNDLED_MANAGED_PLATFORMS.has(platform);
}

export function getBundledManagedPluginRecommendations():
readonly ManagedPluginRecommendation[] {
    return [
        ...BUNDLED_MANAGED_PLUGINS.map(({ platform, version }) =>
            Object.freeze({
                platform,
                version,
                trust: COMMUNITY_MANAGED_PLATFORMS.has(platform)
                    ? "community" as const
                    : "official" as const,
                availability: "bundled",
            })),
        ...UNAVAILABLE_COMMUNITY_RECOMMENDATIONS.map(item =>
            Object.freeze({ ...item })),
    ];
}

export function getBundledManagedPlugin(platform: string) {
    return BUNDLED_MANAGED_PLUGINS.find(
        descriptor => descriptor.platform === platform,
    );
}

export async function repairBundledManagedPlugin(
    manager: ManagedPluginRepairInstaller,
    platform: string,
) {
    const descriptor = getBundledManagedPlugin(platform);
    if (!descriptor) {
        return {
            success: false,
            message: "Managed plugin is unavailable",
        };
    }
    try {
        const result = await manager.ensureManagedPlugin(descriptor);
        return {
            success: true,
            pluginName: result.plugin.name,
            pluginHash: result.plugin.hash,
        };
    } catch {
        errorLog("Managed plugin repair failed", { platform });
        return {
            success: false,
            message: "Managed plugin repair failed",
        };
    }
}

export async function ensureBundledManagedPlugins(
    manager: ManagedPluginInstaller,
    descriptors: readonly ManagedPluginDescriptor[] = BUNDLED_MANAGED_PLUGINS,
    onFailure: ManagedPluginFailureHandler = reportManagedPluginFailure,
) {
    for (const descriptor of descriptors) {
        try {
            await manager.ensureManagedPlugin(descriptor);
        } catch (error) {
            onFailure(descriptor.platform, error);
        }
    }
}
