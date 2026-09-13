type MemoryStore = {
    values: Map<string, string | number>;
    getString: jest.Mock<string | undefined, [string]>;
    getNumber: jest.Mock<number | undefined, [string]>;
    set: jest.Mock<void, [string, string | number]>;
    delete: jest.Mock<void, [string]>;
};

type KeychainMocks = {
    getGenericPassword: jest.Mock;
    setGenericPassword: jest.Mock;
    resetGenericPassword: jest.Mock;
    getAllGenericPasswordServices: jest.Mock;
    ACCESSIBLE: {
        WHEN_UNLOCKED_THIS_DEVICE_ONLY: string;
    };
};

function createMemoryStore(initial: Record<string, unknown> = {}): MemoryStore {
    const values = new Map<string, string | number>();
    Object.entries(initial).forEach(([key, value]) => {
        values.set(
            key,
            typeof value === "number"
                ? value
                : key === "$secureStorageInstallationId"
                    ? String(value)
                    : JSON.stringify(value),
        );
    });
    return {
        values,
        getString: jest.fn(key => {
            const value = values.get(key);
            return typeof value === "string" ? value : undefined;
        }),
        getNumber: jest.fn(key => {
            const value = values.get(key);
            return typeof value === "number" ? value : undefined;
        }),
        set: jest.fn((key, value) => {
            values.set(key, value);
        }),
        delete: jest.fn(key => {
            values.delete(key);
        }),
    };
}

async function loadPluginMeta({
    initialStorage = {},
    keychain,
}: {
    initialStorage?: Record<string, unknown>;
    keychain?: Partial<KeychainMocks>;
} = {}) {
    jest.resetModules();
    const store = createMemoryStore(initialStorage);
    const keychainMocks: KeychainMocks = {
        getGenericPassword: jest.fn(async () => false),
        setGenericPassword: jest.fn(async () => true),
        resetGenericPassword: jest.fn(async () => true),
        getAllGenericPasswordServices: jest.fn(async () => []),
        ACCESSIBLE: {
            WHEN_UNLOCKED_THIS_DEVICE_ONLY: "AccessibleWhenUnlockedThisDeviceOnly",
        },
        ...keychain,
    };

    jest.doMock("@/utils/getOrCreateMMKV", () => ({
        __esModule: true,
        default: jest.fn(() => store),
    }));
    jest.doMock("@/utils/storage", () => ({
        getStorage: jest.fn(async () => null),
        removeStorage: jest.fn(async () => undefined),
    }));
    jest.doMock("@/utils/log", () => ({
        errorLog: jest.fn(),
    }));
    jest.doMock("react-native-keychain", () => keychainMocks, {
        virtual: true,
    });

    const meta = require("../meta").default;
    return { meta, store, keychain: keychainMocks };
}

const navidromeVariables: IPlugin.IUserVariable[] = [
    { key: "url", name: "Server URL" },
    { key: "username", name: "Username" },
    { key: "password", name: "Password", type: "password" },
];

const navidromePlugin = {
    name: "Navidrome",
    hash: "navidrome-managed-hash",
    instance: { userVariables: navidromeVariables },
};

describe("plugin secure user variable storage", () => {
    it("splits password variables into keychain while preserving non-secrets in MMKV", async () => {
        const { meta, store, keychain } = await loadPluginMeta();

        await meta.setUserVariables(
            "Navidrome",
            {
                url: "https://music.example",
                username: "john",
                password: "secret",
            },
            navidromeVariables,
            navidromePlugin.hash,
        );

        expect(JSON.parse(store.getString("Navidrome.userVariables")!))
            .toEqual({
                url: "https://music.example",
                username: "john",
            });
        expect(keychain.setGenericPassword).toHaveBeenCalledWith(
            "plugin-user-variables",
            JSON.stringify({
                installationId: store.getString("$secureStorageInstallationId"),
                ownerHash: navidromePlugin.hash,
                variables: { password: "secret" },
            }),
            {
                service: "mymusic.plugin.Navidrome",
                accessible: "AccessibleWhenUnlockedThisDeviceOnly",
            },
        );
        expect(meta.getUserVariables("Navidrome", navidromePlugin.hash)).toEqual({
            url: "https://music.example",
            username: "john",
            password: "secret",
        });
    });

    it("migrates legacy plaintext passwords after plugin definitions are loaded", async () => {
        const { meta, store, keychain } = await loadPluginMeta({
            initialStorage: {
                "Navidrome.userVariables": {
                    url: "https://music.example",
                    username: "john",
                    password: "legacy-secret",
                },
            },
        });

        await meta.prepareSecureStorage();
        await meta.hydrateSecureUserVariablesForPlugins([navidromePlugin]);

        expect(keychain.setGenericPassword).toHaveBeenCalledWith(
            "plugin-user-variables",
            JSON.stringify({
                installationId: store.getString("$secureStorageInstallationId"),
                ownerHash: navidromePlugin.hash,
                variables: { password: "legacy-secret" },
            }),
            {
                service: "mymusic.plugin.Navidrome",
                accessible: "AccessibleWhenUnlockedThisDeviceOnly",
            },
        );
        expect(JSON.parse(store.getString("Navidrome.userVariables")!))
            .toEqual({
                url: "https://music.example",
                username: "john",
            });
        expect(meta.getUserVariables("Navidrome", navidromePlugin.hash)).toEqual({
            url: "https://music.example",
            username: "john",
            password: "legacy-secret",
        });
    });

    it("hydrates existing keychain secrets into the synchronous runtime cache", async () => {
        const { meta, keychain } = await loadPluginMeta({
            initialStorage: {
                $secureStorageInstallationId: "install-a",
                "Navidrome.userVariables": {
                    url: "https://music.example",
                    username: "john",
                },
            },
            keychain: {
                getGenericPassword: jest.fn(async () => ({
                    username: "plugin-user-variables",
                    password: JSON.stringify({
                        installationId: "install-a",
                        ownerHash: navidromePlugin.hash,
                        variables: { password: "saved-secret" },
                    }),
                    service: "mymusic.plugin.Navidrome",
                    storage: "keychain",
                })),
            },
        });

        await meta.prepareSecureStorage();
        await meta.hydrateSecureUserVariablesForPlugins([navidromePlugin]);

        expect(keychain.getGenericPassword).toHaveBeenCalledWith({
            service: "mymusic.plugin.Navidrome",
        });
        expect(meta.getUserVariables("Navidrome", navidromePlugin.hash)).toEqual({
            url: "https://music.example",
            username: "john",
            password: "saved-secret",
        });
    });

    it("removes stale keychain secrets when password values are cleared", async () => {
        const { meta, keychain } = await loadPluginMeta({
            keychain: {
                getGenericPassword: jest.fn(async () => ({
                    username: "plugin-user-variables",
                    password: JSON.stringify({
                        ownerHash: navidromePlugin.hash,
                        variables: { password: "old-secret" },
                    }),
                })),
            },
        });
        await meta.prepareSecureStorage();
        await meta.hydrateSecureUserVariablesForPlugins([navidromePlugin]);

        await meta.setUserVariables(
            "Navidrome",
            {
                url: "https://music.example",
                username: "john",
                password: "",
            },
            navidromeVariables,
            navidromePlugin.hash,
        );

        expect(keychain.resetGenericPassword).toHaveBeenCalledWith({
            service: "mymusic.plugin.Navidrome",
        });
        expect(meta.getUserVariables("Navidrome", navidromePlugin.hash)).toEqual({
            url: "https://music.example",
            username: "john",
        });
    });

    it("contains keychain read failures and removes plaintext passwords", async () => {
        const { meta, store } = await loadPluginMeta({
            initialStorage: {
                "Navidrome.userVariables": {
                    url: "https://music.example",
                    password: "legacy-secret",
                },
            },
            keychain: {
                getGenericPassword: jest.fn(async () => {
                    throw new Error("native keychain unavailable");
                }),
            },
        });

        await meta.prepareSecureStorage();
        await expect(meta.hydrateSecureUserVariablesForPlugins([
            navidromePlugin,
        ])).resolves.toBeUndefined();
        expect(JSON.parse(store.getString("Navidrome.userVariables")!))
            .toEqual({
                url: "https://music.example",
            });
    });

    it("removes public and secure variables when a plugin is uninstalled", async () => {
        const { meta, store, keychain } = await loadPluginMeta({
            initialStorage: {
                "Navidrome.userVariables": {
                    url: "https://music.example",
                },
            },
        });

        await meta.removeUserVariables("Navidrome");

        expect(store.delete).toHaveBeenCalledWith("Navidrome.userVariables");
        expect(keychain.resetGenericPassword).toHaveBeenCalledWith({
            service: "mymusic.plugin.Navidrome",
        });
        expect(meta.getUserVariables("Navidrome", navidromePlugin.hash)).toEqual({});
    });

    it("does not expose a hydrated secret to a different plugin source hash", async () => {
        const { meta } = await loadPluginMeta({
            initialStorage: {
                $secureStorageInitialized: 1,
                $secureStorageInstallationId: "install-a",
            },
            keychain: {
                getGenericPassword: jest.fn(async () => ({
                    username: "plugin-user-variables",
                    password: JSON.stringify({
                        installationId: "install-a",
                        ownerHash: navidromePlugin.hash,
                        variables: { password: "saved-secret" },
                    }),
                })),
            },
        });
        await meta.prepareSecureStorage();
        await meta.hydrateSecureUserVariablesForPlugins([navidromePlugin]);

        expect(meta.getUserVariables("Navidrome", navidromePlugin.hash))
            .toEqual({ password: "saved-secret" });
        expect(meta.getUserVariables("Navidrome", "hostile-replacement-hash"))
            .toEqual({});
    });

    it("does not rebind a persisted secret to a replacement hash after restart", async () => {
        const keychainPayload = {
            username: "plugin-user-variables",
            password: JSON.stringify({
                installationId: "install-a",
                ownerHash: navidromePlugin.hash,
                variables: { password: "saved-secret" },
            }),
        };
        const { meta } = await loadPluginMeta({
            initialStorage: {
                $secureStorageInitialized: 1,
                $secureStorageInstallationId: "install-a",
            },
            keychain: {
                getGenericPassword: jest.fn(async () => keychainPayload),
            },
        });
        const replacement = {
            ...navidromePlugin,
            hash: "replacement-hash",
        };

        await meta.prepareSecureStorage();
        await meta.hydrateSecureUserVariablesForPlugins([replacement]);

        expect(meta.getUserVariables("Navidrome", replacement.hash)).toEqual({});
    });

    it("does not legitimize another installation's orphan after one new write", async () => {
        const orphan = {
            username: "plugin-user-variables",
            password: JSON.stringify({
                installationId: "previous-install",
                ownerHash: navidromePlugin.hash,
                variables: { password: "orphan-secret" },
            }),
        };
        const getServices = jest.fn()
            .mockRejectedValueOnce(new Error("keychain unavailable"));
        const { meta, keychain } = await loadPluginMeta({
            keychain: {
                getAllGenericPasswordServices: getServices,
                getGenericPassword: jest.fn(async () => orphan),
            },
        });

        await meta.prepareSecureStorage();
        await meta.setUserVariables(
            "WebDAV",
            { password: "new-secret" },
            [{ key: "password", name: "Password", type: "password" }],
            "webdav-hash",
        );
        await meta.prepareSecureStorage();
        await meta.hydrateSecureUserVariablesForPlugins([navidromePlugin]);

        expect(keychain.getGenericPassword).toHaveBeenCalled();
        expect(meta.getUserVariables("Navidrome", navidromePlugin.hash)).toEqual({});
    });

    it("purges orphaned plugin credentials on a fresh installation", async () => {
        const { meta, store, keychain } = await loadPluginMeta({
            keychain: {
                getAllGenericPasswordServices: jest.fn(async () => [
                    "mymusic.plugin.Navidrome",
                    "other.application",
                ]),
            },
        });

        await meta.prepareSecureStorage();

        expect(keychain.resetGenericPassword).toHaveBeenCalledTimes(1);
        expect(keychain.resetGenericPassword).toHaveBeenCalledWith({
            service: "mymusic.plugin.Navidrome",
        });
        expect(store.getNumber("$secureStorageInitialized")).toBe(1);
    });

    it("does not purge keychain services after secure storage initialization", async () => {
        const { meta, keychain } = await loadPluginMeta({
            initialStorage: { $secureStorageInitialized: 1 },
        });

        await meta.prepareSecureStorage();

        expect(keychain.getAllGenericPasswordServices).not.toHaveBeenCalled();
        expect(keychain.resetGenericPassword).not.toHaveBeenCalled();
    });

    it("does not purge credentials written after secure storage preparation failed", async () => {
        const getServices = jest.fn()
            .mockRejectedValueOnce(new Error("keychain unavailable"))
            .mockResolvedValueOnce(["mymusic.plugin.Navidrome"]);
        const { meta, keychain } = await loadPluginMeta({
            keychain: { getAllGenericPasswordServices: getServices },
        });

        await meta.prepareSecureStorage();
        await meta.setUserVariables(
            "Navidrome",
            { password: "new-secret" },
            navidromeVariables,
            navidromePlugin.hash,
        );
        await meta.prepareSecureStorage();

        expect(keychain.setGenericPassword).toHaveBeenCalledTimes(1);
        expect(keychain.resetGenericPassword).not.toHaveBeenCalled();
    });

    it("strips legacy plaintext passwords when fresh-install preparation fails", async () => {
        const { meta, store } = await loadPluginMeta({
            initialStorage: {
                "Navidrome.userVariables": {
                    url: "https://music.example",
                    password: "legacy-secret",
                },
            },
            keychain: {
                getAllGenericPasswordServices: jest.fn(async () => {
                    throw new Error("keychain unavailable");
                }),
            },
        });

        await meta.prepareSecureStorage();
        await meta.hydrateSecureUserVariablesForPlugins([navidromePlugin]);

        expect(JSON.parse(store.getString("Navidrome.userVariables")!))
            .toEqual({ url: "https://music.example" });
        expect(meta.getUserVariables("Navidrome", navidromePlugin.hash))
            .toEqual({ url: "https://music.example" });
    });

    it("tombstones a failed credential deletion and retries it before hydration", async () => {
        const reset = jest.fn()
            .mockRejectedValueOnce(new Error("keychain locked"))
            .mockResolvedValueOnce(true);
        const getCredential = jest.fn(async () => ({
            username: "plugin-user-variables",
            password: JSON.stringify({ password: "deleted-secret" }),
        }));
        const { meta, store } = await loadPluginMeta({
            keychain: {
                resetGenericPassword: reset,
                getGenericPassword: getCredential,
            },
        });

        await expect(meta.removeUserVariables("Navidrome"))
            .rejects.toThrow("keychain locked");
        expect(JSON.parse(store.getString("$secureDeletionPending")!))
            .toEqual(["Navidrome"]);

        await meta.hydrateSecureUserVariablesForPlugins([navidromePlugin]);

        expect(reset).toHaveBeenCalledTimes(2);
        expect(getCredential).not.toHaveBeenCalled();
        expect(meta.getUserVariables("Navidrome", navidromePlugin.hash)).toEqual({});
        expect(JSON.parse(store.getString("$secureDeletionPending")!))
            .toEqual([]);
    });
});
