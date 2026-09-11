interface URLValue {
    protocol: string;
    username: string;
    password: string;
    search: string;
    hash: string;
}

type URLConstructor = new (url: string) => URLValue;

function canPersistUrl(url: unknown, URLType: URLConstructor): url is string {
    if (typeof url !== "string") {
        return false;
    }

    try {
        const parsedUrl = new URLType(url);
        return parsedUrl.username === "" &&
            parsedUrl.password === "" &&
            parsedUrl.search === "" &&
            parsedUrl.hash === "" &&
            ["https:", "file:", "content:", "musicfree:"].includes(
                parsedUrl.protocol,
            );
    } catch {
        return false;
    }
}

export function createPersistedTrack(
    track: IMusic.IMusicItem,
    URLType: URLConstructor = URL,
): IMusic.IMusicItem {
    const metadata = {
        ...track,
        headers: undefined,
        userAgent: undefined,
        source: undefined,
        qualities: undefined,
    };

    if (canPersistUrl(metadata.url, URLType)) {
        return { ...metadata } as IMusic.IMusicItem;
    }

    return { ...metadata, url: undefined } as IMusic.IMusicItem;
}
