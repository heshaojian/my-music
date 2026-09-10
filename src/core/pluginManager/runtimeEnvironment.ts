interface PluginRuntimeEnvironmentOptions {
    platform: string;
    locale: string;
    appVersion: string;
    getUserVariables: () => Record<string, string> | null | undefined;
}

function readUserVariables(
    getUserVariables: PluginRuntimeEnvironmentOptions["getUserVariables"],
) {
    return getUserVariables() ?? {};
}

export function createPluginRuntimeEnvironment({
    platform,
    locale,
    appVersion,
    getUserVariables,
}: PluginRuntimeEnvironmentOptions) {
    const env = {
        getUserVariables: () => readUserVariables(getUserVariables),
        get userVariables() {
            return readUserVariables(getUserVariables);
        },
        appVersion,
        os: platform,
        lang: locale,
    };

    return {
        env,
        process: {
            platform,
            version: appVersion,
            env,
        },
    };
}
