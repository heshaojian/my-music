import type { MMKV } from "react-native-mmkv";
import { safeParse, safeStringify } from "@/utils/jsonUtil";
import type { CatalogCacheRecord, CatalogTransport } from "./types";
import { normalizeHttpsUrl, utf8ByteLength } from "./validation";

type CatalogStore = Pick<MMKV, "getString" | "set">;
interface CatalogHttpClient {
    get(url: string, config?: Record<string, any>): Promise<any>;
}

function contentLength(headers: unknown): number | undefined {
    if (!headers || typeof headers !== "object") {
        return undefined;
    }
    const values = headers as Record<string, unknown> & {
        get?: (name: string) => unknown;
    };
    const raw = values["content-length"] ?? values.get?.("content-length");
    const parsed = typeof raw === "string" ? Number(raw) : raw;
    return typeof parsed === "number" && Number.isFinite(parsed)
        ? parsed
        : undefined;
}

export function createCatalogTransport(client: CatalogHttpClient): CatalogTransport {
    return {
        async getText(url, maxBytes) {
            const requestUrl = normalizeHttpsUrl(url).toString();
            const controller = new AbortController();
            const response = await client.get(requestUrl, {
                responseType: "text",
                maxContentLength: maxBytes,
                maxBodyLength: maxBytes,
                transformResponse: [(data: unknown) => data],
                signal: controller.signal,
                onDownloadProgress: ({ loaded }: { loaded?: number }) => {
                    if (typeof loaded === "number" && loaded > maxBytes) {
                        controller.abort();
                    }
                },
            });
            const declaredLength = contentLength(response.headers);
            if (declaredLength !== undefined && declaredLength > maxBytes) {
                throw new Error("Plugin catalog is too large");
            }
            if (
                typeof response.data !== "string" ||
                utf8ByteLength(response.data) > maxBytes
            ) {
                throw new Error("Plugin catalog is too large");
            }
            const finalUrl = response.request?.responseURL;
            return {
                text: response.data,
                finalUrl: typeof finalUrl === "string" ? finalUrl : undefined,
            };
        },
    };
}

export function createCatalogCache(store: CatalogStore) {
    const keyFor = (sourceId: string) => `source.${sourceId}`;
    return {
        read(sourceId: string): CatalogCacheRecord | null {
            return safeParse<CatalogCacheRecord>(
                store.getString(keyFor(sourceId)),
            );
        },
        write(record: CatalogCacheRecord): void {
            store.set(keyFor(record.sourceId), safeStringify(record));
        },
    };
}
