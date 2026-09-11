import { errorLog } from "@/utils/log";
import BILIBILI_MANAGED_PLUGIN from "./bilibiliPluginSource";
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

export async function ensureBundledManagedPlugins(
    manager: ManagedPluginInstaller,
    descriptors: readonly ManagedPluginDescriptor[] = [
        BILIBILI_MANAGED_PLUGIN,
    ],
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
