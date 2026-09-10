type PersistedLocale = string | null;

function loadI18n(savedLocale: PersistedLocale) {
    const set = jest.fn();

    jest.resetModules();
    jest.doMock("@/utils/persistStatus", () => ({
        __esModule: true,
        default: {
            get: jest.fn(() => savedLocale),
            set,
        },
    }));
    jest.doMock("jotai", () => ({
        atom: (value: unknown) => ({ value }),
        getDefaultStore: () => ({
            get: (state: { value: unknown }) => state.value,
            set: (state: { value: unknown }, value: unknown) => {
                state.value = value;
            },
        }),
        useAtomValue: (state: { value: unknown }) => state.value,
    }));

    const i18n = require("@/core/i18n").default;
    return { i18n, set };
}

describe("i18n language defaults", () => {
    afterEach(() => {
        jest.resetModules();
        jest.dontMock("@/utils/persistStatus");
        jest.dontMock("jotai");
    });

    it("defaults a new installation to English", () => {
        const { i18n } = loadI18n(null);

        expect(i18n.getLanguage().locale).toBe("en-US");
    });

    it.each(["zh-CN", "zh-TW"])("preserves the saved %s locale", locale => {
        const { i18n } = loadI18n(locale);

        expect(i18n.getLanguage().locale).toBe(locale);
    });

    it("falls back to English for an unsupported saved locale", () => {
        const { i18n } = loadI18n("invalid-locale");

        expect(i18n.getLanguage().locale).toBe("en-US");
    });

    it("persists a supported language selection", () => {
        const { i18n, set } = loadI18n(null);

        i18n.setLanguage("zh-CN");

        expect(i18n.getLanguage().locale).toBe("zh-CN");
        expect(set).toHaveBeenCalledWith("app.language", "zh-CN");
    });

    it("persists English when an unsupported language is selected", () => {
        const { i18n, set } = loadI18n(null);

        i18n.setLanguage("invalid-locale");

        expect(i18n.getLanguage().locale).toBe("en-US");
        expect(set).toHaveBeenCalledWith("app.language", "en-US");
    });

    it("exposes supported languages and translates interpolation arguments", () => {
        const { i18n } = loadI18n(null);

        expect(i18n.setup()).toBeUndefined();
        expect(i18n.getSupportedLanguages().map((language: { locale: string }) => language.locale))
            .toEqual(["zh-CN", "zh-TW", "en-US"]);
        expect(i18n.t("home.songCount", { count: 3 })).toBe("3 songs");
        expect(i18n.t("home.songCount", {})).toBe(" songs");
        expect(i18n.t("common.search")).toBe("Search");
    });
});
