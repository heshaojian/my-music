import {
    createPersistedTrack,
    createPersistedTrackList,
} from "../trackPersistence";

const createTrack = (url: string) => ({
    id: "1047916",
    title: "Rain Keeps Falling",
    artist: "MaoerFM artist",
    platform: "猫耳FM",
    url,
    headers: { Authorization: "Bearer private-token" },
    userAgent: "private-agent",
    source: {
        standard: {
            url: "https://media.example.com/song.m4a?token=nested-private",
            headers: { Authorization: "Bearer nested-private" },
        },
    },
}) as unknown as IMusic.IMusicItem;

describe("persisted playback track", () => {
    it("removes signed URLs and request credentials without mutating the track", () => {
        const track = createTrack(
            "https://media.example.com/song.m4a?token=private#fragment",
        );
        const original = JSON.parse(JSON.stringify(track));

        const persisted = createPersistedTrack(track);

        expect(persisted.url).toBeUndefined();
        expect(persisted.headers).toBeUndefined();
        expect(persisted.userAgent).toBeUndefined();
        expect(persisted.source).toBeUndefined();
        expect(track).toEqual(original);
        expect(JSON.stringify(persisted)).not.toContain("private");
    });

    it("keeps a static HTTPS URL required to resume MaoerFM playback", () => {
        const persisted = createPersistedTrack(
            createTrack("https://media.example.com/song.m4a"),
        );

        expect(persisted.url).toBe("https://media.example.com/song.m4a");
        expect(persisted.headers).toBeUndefined();
        expect(persisted.source).toBeUndefined();
    });

    it("sanitizes every queued track into a new list", () => {
        const tracks = [
            createTrack("https://media.example.com/one.m4a?token=one"),
            createTrack("https://media.example.com/two.m4a?token=two"),
        ];

        const persisted = createPersistedTrackList(tracks);

        expect(persisted).not.toBe(tracks);
        expect(persisted[0]).not.toBe(tracks[0]);
        expect(JSON.stringify(persisted)).not.toContain("token");
        expect(tracks[0].url).toContain("token=one");
    });
});
