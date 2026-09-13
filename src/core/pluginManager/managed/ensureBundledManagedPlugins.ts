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

interface ManagedPluginInstaller {
    ensureManagedPlugin(
        descriptor: ManagedPluginDescriptor,
    ): Promise<unknown>;
}

type ManagedPluginFailureHandler = (
    platform: string,
    error: unknown,
) => void;

const reportManagedPluginFailure: ManagedPluginFailureHandler = platform => {
    errorLog("Managed plugin setup failed", { platform });
};

export const BUNDLED_MANAGED_PLUGINS: readonly ManagedPluginDescriptor[] = [
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
];

const BUNDLED_MANAGED_PLATFORMS = new Set(
    BUNDLED_MANAGED_PLUGINS.map(plugin => plugin.platform),
);

export function isBundledManagedPluginPlatform(platform: string) {
    return BUNDLED_MANAGED_PLATFORMS.has(platform);
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
