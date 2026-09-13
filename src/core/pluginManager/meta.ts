import getOrCreateMMKV from "@/utils/getOrCreateMMKV";
import { safeParse, safeStringify } from "@/utils/jsonUtil";
import { errorLog } from "@/utils/log";
import { getStorage, removeStorage } from "@/utils/storage";
import * as Keychain from "react-native-keychain";
import CryptoJs from "crypto-js";

type IPluginPlatform = string;
type IUserVariableDefinition = Pick<IPlugin.IUserVariable, "key" | "type">;

interface IPluginMetaStorage {
    $version: number;
    $secureStorageInitialized: number;
    $secureStorageOwned: number;
    $secureDeletionPending: Array<IPluginPlatform>;
    $secureStorageInstallationId: string;
    order: Record<IPluginPlatform, number>;
    disabledPlugins: Array<IPluginPlatform>;
    [key: `${IPluginPlatform}.alternativePlugin`]: IPluginPlatform | null;
    [key: `${IPluginPlatform}.userVariables`]: Record<string, string>;

}


const storage = getOrCreateMMKV("plugin-meta");
const KEYCHAIN_USERNAME = "plugin-user-variables";
const KEYCHAIN_SERVICE_PREFIX = "mymusic.plugin.";

function keychainServiceForPlatform(pluginPlatform: IPluginPlatform) {
    return `${KEYCHAIN_SERVICE_PREFIX}${pluginPlatform}`;
}

function getPasswordVariableKeys(
    definitions?: IUserVariableDefinition[] | null,
) {
    return new Set(
        (definitions ?? [])
            .filter(variable => variable?.key && variable.type === "password")
            .map(variable => variable.key),
    );
}

function splitUserVariables(
    userVariables: Record<string, string>,
    passwordKeys: Set<string>,
) {
    return Object.entries(userVariables).reduce<{
        publicVariables: Record<string, string>;
        secureVariables: Record<string, string>;
    }>((result, [key, value]) => {
        if (passwordKeys.has(key)) {
            if (typeof value === "string" && value.length > 0) {
                return {
                    publicVariables: result.publicVariables,
                    secureVariables: {
                        ...result.secureVariables,
                        [key]: value,
                    },
                };
            }
            return result;
        }
        return {
            publicVariables: {
                ...result.publicVariables,
                [key]: value,
            },
            secureVariables: result.secureVariables,
        };
    }, { publicVariables: {}, secureVariables: {} });
}

function normalizeSecureVariables(
    value: unknown,
    passwordKeys: Set<string>,
) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }
    return Object.entries(value as Record<string, unknown>)
        .reduce<Record<string, string>>((result, [key, rawValue]) => {
            if (
                passwordKeys.has(key) &&
                typeof rawValue === "string" &&
                rawValue.length > 0
            ) {
                return {
                    ...result,
                    [key]: rawValue,
                };
            }
            return result;
        }, {});
}

function withoutPasswordVariables(
    userVariables: Record<string, string>,
    passwordKeys: Set<string>,
) {
    return Object.entries(userVariables).reduce<Record<string, string>>(
        (result, [key, value]) =>
            passwordKeys.has(key)
                ? result
                : {
                    ...result,
                    [key]: value,
                },
        {},
    );
}

class PluginMeta {
    private cachedDisabledPlugins: Set<IPluginPlatform> | null = null;
    private secureUserVariablesCache: Record<IPluginPlatform, Record<string, string>> = {};
    private secureUserVariableOwnerHashes: Record<IPluginPlatform, string> = {};
    private secureStoragePrepared = false;

    async prepareSecureStorage() {
        this.getOrCreateSecureStorageInstallationId();
        await this.retryPendingSecureDeletions();
        if (storage.getNumber("$secureStorageInitialized") === 1) {
            this.secureStoragePrepared = true;
            return;
        }
        if (storage.getNumber("$secureStorageOwned") === 1) {
            storage.set("$secureStorageInitialized", 1);
            this.secureStoragePrepared = true;
            return;
        }
        try {
            const services = await Keychain.getAllGenericPasswordServices();
            await Promise.all(services
                .filter(service => service.startsWith(KEYCHAIN_SERVICE_PREFIX))
                .map(service => Keychain.resetGenericPassword({ service })));
            storage.set("$secureStorageInitialized", 1);
            this.secureStoragePrepared = true;
        } catch (_error) {
            errorLog("Plugin secure storage preparation failed", {});
        }
    }

    private getOrCreateSecureStorageInstallationId() {
        const current = storage.getString("$secureStorageInstallationId");
        if (current) {
            return current;
        }
        const installationId = CryptoJs.lib.WordArray.random(16).toString();
        storage.set("$secureStorageInstallationId", installationId);
        return installationId;
    }

    private getPendingSecureDeletions() {
        return new Set(
            this.getMetaStorage("$secureDeletionPending") ?? [],
        );
    }

    private setPendingSecureDeletions(platforms: Set<IPluginPlatform>) {
        this.setMetaStorage("$secureDeletionPending", [...platforms]);
    }

    private async retryPendingSecureDeletion(pluginPlatform: IPluginPlatform) {
        const pending = this.getPendingSecureDeletions();
        if (!pending.has(pluginPlatform)) {
            return false;
        }
        await Keychain.resetGenericPassword({
            service: keychainServiceForPlatform(pluginPlatform),
        });
        pending.delete(pluginPlatform);
        this.setPendingSecureDeletions(pending);
        return true;
    }

    private async retryPendingSecureDeletions() {
        const pending = this.getPendingSecureDeletions();
        for (const pluginPlatform of pending) {
            try {
                await this.retryPendingSecureDeletion(pluginPlatform);
            } catch (_error) {
                errorLog("Plugin credential deletion retry failed", {
                    platform: pluginPlatform,
                });
            }
        }
    }

    private getMetaStorage<K extends keyof IPluginMetaStorage>(key: K): IPluginMetaStorage[K] | null {
        return safeParse(storage.getString(key));
    }

    private setMetaStorage<K extends keyof IPluginMetaStorage>(key: K, value: IPluginMetaStorage[K]) {
        const storageValue = safeStringify(value);
        storage.set(key, storageValue);
    }

    async migratePluginMeta() {
        const metaVersion = storage.getNumber("$version") ?? -1;
        if (metaVersion < 0) {
            // 从async storage迁移到mmkv

            try {
                const rawMeta = await getStorage("plugin-meta");
                const order: Record<IPluginPlatform, number> = {};
                const disabledPlugins = new Set<IPluginPlatform>();

                if (rawMeta !== null) {
                    for (let platformName in rawMeta) {
                        const metaVal = rawMeta[platformName];
                        if (!metaVal) {
                            continue;
                        }
                        if (metaVal?.order !== undefined && metaVal.order !== null) {
                            order[platformName] = metaVal.order;
                        }
                        if (metaVal?.enabled !== undefined && metaVal.enabled === false) {
                            disabledPlugins.add(platformName);
                        }
                        if (metaVal?.userVariables !== undefined && metaVal.userVariables !== null) {
                            storage.set(platformName + ".userVariables", safeStringify(metaVal.userVariables));
                        }
                    }
                }
                // 将 order 和 disabledPlugins 存储到 mmkv
                storage.set("order", safeStringify(order));
                storage.set("disabledPlugins", safeStringify(Array.from(disabledPlugins)));

                // 移除
                await removeStorage("plugin-meta");
            } catch (e) {
                errorLog("迁移 plugin meta 失败", e);
            }


            storage.set("$version", 1);
        }
    }

    getPluginOrder() {
        return this.getMetaStorage("order") ?? {};
    }

    setPluginOrder(orderMap: Record<IPluginPlatform, number>) {
        this.setMetaStorage("order", orderMap);
    }


    public get disabledPlugins() {
        if (this.cachedDisabledPlugins) {
            return this.cachedDisabledPlugins;
        }
        const disabledPlugins = this.getMetaStorage("disabledPlugins") ?? [];
        this.cachedDisabledPlugins = new Set(disabledPlugins);
        return this.cachedDisabledPlugins;
    }

    isPluginEnabled(pluginPlatform: IPluginPlatform) {
        const disabledPluginsSet = this.disabledPlugins;
        return !disabledPluginsSet.has(pluginPlatform);
    }


    setPluginEnabled(pluginPlatform: IPluginPlatform, enabled: boolean) {
        const disabledPluginsSet = this.disabledPlugins;

        if (enabled) {
            disabledPluginsSet.delete(pluginPlatform);
        } else {
            disabledPluginsSet.add(pluginPlatform);
        }
        this.setMetaStorage("disabledPlugins", Array.from(disabledPluginsSet));
        this.cachedDisabledPlugins = disabledPluginsSet;
    }

    getUserVariables(pluginPlatform: IPluginPlatform, pluginHash?: string) {
        const userVariables = this.getMetaStorage(`${pluginPlatform}.userVariables`) ?? {};
        const secureVariables = pluginHash &&
            this.secureUserVariableOwnerHashes[pluginPlatform] === pluginHash
            ? this.secureUserVariablesCache[pluginPlatform] ?? {}
            : {};
        return {
            ...userVariables,
            ...secureVariables,
        };
    }

    private async readSecureUserVariables(
        pluginPlatform: IPluginPlatform,
        passwordKeys: Set<string>,
        ownerHash: string,
    ) {
        const credentials = await Keychain.getGenericPassword({
            service: keychainServiceForPlatform(pluginPlatform),
        });
        if (!credentials) {
            return {};
        }
        const payload = safeParse(credentials.password);
        if (
            !payload ||
            typeof payload !== "object" ||
            Array.isArray(payload) ||
            (payload as { ownerHash?: unknown }).ownerHash !== ownerHash ||
            (payload as { installationId?: unknown }).installationId !==
                this.getOrCreateSecureStorageInstallationId()
        ) {
            return {};
        }
        return normalizeSecureVariables(
            (payload as { variables?: unknown }).variables,
            passwordKeys,
        );
    }

    private async writeSecureUserVariables(
        pluginPlatform: IPluginPlatform,
        secureVariables: Record<string, string>,
        ownerHash: string,
    ) {
        await this.retryPendingSecureDeletion(pluginPlatform);
        if (Object.keys(secureVariables).length === 0) {
            await Keychain.resetGenericPassword({
                service: keychainServiceForPlatform(pluginPlatform),
            });
            storage.set("$secureStorageOwned", 1);
            storage.set("$secureStorageInitialized", 1);
            this.secureStoragePrepared = true;
            this.secureUserVariablesCache = {
                ...this.secureUserVariablesCache,
                [pluginPlatform]: {},
            };
            this.secureUserVariableOwnerHashes = {
                ...this.secureUserVariableOwnerHashes,
                [pluginPlatform]: ownerHash,
            };
            return;
        }
        const result = await Keychain.setGenericPassword(
            KEYCHAIN_USERNAME,
            safeStringify({
                installationId: this.getOrCreateSecureStorageInstallationId(),
                ownerHash,
                variables: secureVariables,
            }),
            {
                service: keychainServiceForPlatform(pluginPlatform),
                accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
            },
        );
        if (!result) {
            throw new Error("Unable to store plugin password variables securely");
        }
        storage.set("$secureStorageOwned", 1);
        storage.set("$secureStorageInitialized", 1);
        this.secureStoragePrepared = true;
        this.secureUserVariablesCache = {
            ...this.secureUserVariablesCache,
            [pluginPlatform]: { ...secureVariables },
        };
        this.secureUserVariableOwnerHashes = {
            ...this.secureUserVariableOwnerHashes,
            [pluginPlatform]: ownerHash,
        };
    }

    async hydrateSecureUserVariablesForPlugins(
        plugins: Array<{
            name?: string;
            hash?: string;
            instance?: {
                platform?: string;
                userVariables?: IUserVariableDefinition[];
            };
        }>,
    ) {
        for (const plugin of plugins) {
            const pluginPlatform = plugin.name ?? plugin.instance?.platform;
            const pluginHash = plugin.hash;
            const passwordKeys = getPasswordVariableKeys(
                plugin.instance?.userVariables,
            );
            if (!pluginPlatform || !pluginHash || passwordKeys.size === 0) {
                continue;
            }
            try {
                if (await this.retryPendingSecureDeletion(pluginPlatform)) {
                    continue;
                }
            } catch (_error) {
                errorLog("Plugin credential deletion retry failed", {
                    platform: pluginPlatform,
                });
                continue;
            }
            const legacyVariables =
                this.getMetaStorage(`${pluginPlatform}.userVariables`) ?? {};
            if (!this.secureStoragePrepared) {
                this.setMetaStorage(
                    `${pluginPlatform}.userVariables`,
                    withoutPasswordVariables(legacyVariables, passwordKeys),
                );
                continue;
            }
            try {
                const legacySecureVariables = normalizeSecureVariables(
                    legacyVariables,
                    passwordKeys,
                );
                let secureVariables = await this.readSecureUserVariables(
                    pluginPlatform,
                    passwordKeys,
                    pluginHash,
                );

                if (
                    Object.keys(secureVariables).length === 0 &&
                    Object.keys(legacySecureVariables).length > 0
                ) {
                    await this.writeSecureUserVariables(
                        pluginPlatform,
                        legacySecureVariables,
                        pluginHash,
                    );
                    secureVariables = { ...legacySecureVariables };
                } else {
                    this.secureUserVariablesCache = {
                        ...this.secureUserVariablesCache,
                        [pluginPlatform]: { ...secureVariables },
                    };
                    this.secureUserVariableOwnerHashes = {
                        ...this.secureUserVariableOwnerHashes,
                        [pluginPlatform]: pluginHash,
                    };
                }

                if (Object.keys(legacySecureVariables).length > 0) {
                    this.setMetaStorage(
                        `${pluginPlatform}.userVariables`,
                        withoutPasswordVariables(legacyVariables, passwordKeys),
                    );
                }
            } catch (_error) {
                this.setMetaStorage(
                    `${pluginPlatform}.userVariables`,
                    withoutPasswordVariables(legacyVariables, passwordKeys),
                );
                errorLog("Plugin secure variable hydration failed", {
                    platform: pluginPlatform,
                });
            }
        }
    }

    async setUserVariables(
        pluginPlatform: IPluginPlatform,
        userVariables: Record<string, string>,
        definitions?: IUserVariableDefinition[] | null,
        ownerHash = "",
    ) {
        const passwordKeys = getPasswordVariableKeys(definitions);
        const { publicVariables, secureVariables } = splitUserVariables(
            userVariables,
            passwordKeys,
        );
        if (passwordKeys.size > 0) {
            if (!ownerHash) {
                throw new Error("Plugin identity is required for password variables");
            }
            await this.writeSecureUserVariables(
                pluginPlatform,
                secureVariables,
                ownerHash,
            );
            this.setMetaStorage(`${pluginPlatform}.userVariables`, publicVariables);
            return;
        }
        this.setMetaStorage(`${pluginPlatform}.userVariables`, userVariables);
    }

    async removeUserVariables(pluginPlatform: IPluginPlatform) {
        const pending = this.getPendingSecureDeletions();
        pending.add(pluginPlatform);
        this.setPendingSecureDeletions(pending);
        try {
            await Keychain.resetGenericPassword({
                service: keychainServiceForPlatform(pluginPlatform),
            });
            pending.delete(pluginPlatform);
            this.setPendingSecureDeletions(pending);
        } finally {
            storage.delete(`${pluginPlatform}.userVariables`);
            this.secureUserVariablesCache = Object.fromEntries(
                Object.entries(this.secureUserVariablesCache)
                    .filter(([platform]) => platform !== pluginPlatform),
            );
            this.secureUserVariableOwnerHashes = Object.fromEntries(
                Object.entries(this.secureUserVariableOwnerHashes)
                    .filter(([platform]) => platform !== pluginPlatform),
            );
        }
    }

    setAlternativePlugin(pluginPlatform: IPluginPlatform, alternativePluginPlatform: IPluginPlatform) {
        this.setMetaStorage(`${pluginPlatform}.alternativePlugin`, alternativePluginPlatform);
    }

    getAlternativePlugin(pluginPlatform: IPluginPlatform): IPluginPlatform | null {
        const alternativePlugin = this.getMetaStorage(`${pluginPlatform}.alternativePlugin`);
        if (alternativePlugin) {
            return alternativePlugin;
        }
        return null;
    }
}


const _internalPluginMeta = new PluginMeta();
 
export default _internalPluginMeta;
