const MAOER_FM_PLATFORM = "猫耳FM";
const DIRECT_AUDIO_PATH = /\.(?:m4a|mp3|aac)$/i;

interface URLValue {
    protocol: string;
    username: string;
    password: string;
    pathname: string;
}

type URLConstructor = new (url: string) => URLValue;

type MediaSourceResolver = () => Promise<
    IPlugin.IMediaSourceResult | null | undefined
>;

export function getPreferredDirectMediaSource(
    musicItem: IMusic.IMusicItemBase,
    URLType: URLConstructor = URL,
): IPlugin.IMediaSourceResult | null {
    if (
        musicItem.platform !== MAOER_FM_PLATFORM ||
        typeof musicItem.url !== "string"
    ) {
        return null;
    }

    try {
        const parsedUrl = new URLType(musicItem.url);
        if (
            parsedUrl.protocol !== "https:" ||
            parsedUrl.username !== "" ||
            parsedUrl.password !== "" ||
            !DIRECT_AUDIO_PATH.test(parsedUrl.pathname)
        ) {
            return null;
        }

        return { url: musicItem.url };
    } catch {
        return null;
    }
}

export async function resolveProviderMediaSource(
    musicItem: IMusic.IMusicItemBase,
    resolver?: MediaSourceResolver,
    URLType?: URLConstructor,
): Promise<IPlugin.IMediaSourceResult | null | undefined> {
    return getPreferredDirectMediaSource(musicItem, URLType) ?? resolver?.();
}
