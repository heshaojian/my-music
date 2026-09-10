import type { ILanguage, ILanguageData } from "@/types/core/i18n";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import PersistStatus from "@/utils/persistStatus";

import zhCN from "./languages/zh-cn.json";
import enUS from "./languages/en-us.json";
import zhTW from "./languages/zh-tw.json";


const allLanguages: ILanguage[] = [{
    locale: "zh-CN",
    name: "简体中文",
    languageData: zhCN,
}, {
    locale: "zh-TW",
    name: "繁体中文",
    languageData: zhTW,
}, {
    locale: "en-US",
    name: "English",
    languageData: enUS,
}];

const DEFAULT_LOCALE = "en-US";
const defaultLanguage = allLanguages.find(
    item => item.locale === DEFAULT_LOCALE,
) as ILanguage;
const resolveLanguage = (locale: string | null) =>
    allLanguages.find(item => item.locale === locale) ?? defaultLanguage;
const currentLanguageAtom = atom<ILanguage>(
    resolveLanguage(PersistStatus.get("app.language")),
);


class I18N<K extends keyof ILanguageData> {
    setup() {

    }

    getSupportedLanguages() {
        return allLanguages;
    }

    getLanguage() {
        return getDefaultStore().get(currentLanguageAtom);
    }

    setLanguage(locale: string) {
        const language = resolveLanguage(locale);
        getDefaultStore().set(currentLanguageAtom, language);
        PersistStatus.set("app.language", language.locale);
    }

    t(key: K, args?: Record<string, any>): ILanguageData[K] {
        const language = getDefaultStore().get(currentLanguageAtom);
        if (!language) {
            return "";
        }
        const value = language.languageData[key] ?? defaultLanguage.languageData[key] ?? "";
        if (!args) {
            return value as ILanguageData[K];
        }

        return value.replace(/{(\w+)}/g, (_, argKey) => args[argKey] ?? "");
    }
}

const i18n = new I18N();
export default i18n;

export function useI18N(): I18N<keyof ILanguageData> {
    useAtomValue(currentLanguageAtom); // 用来通知组件刷新

    return i18n;
}
