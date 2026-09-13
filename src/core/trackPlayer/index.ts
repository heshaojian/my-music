import { getCurrentDialog, showDialog } from "@/components/dialogs/useDialog";
import {
    internalFakeSoundKey,
    sortIndexSymbol,
    timeStampSymbol,
} from "@/constants/commonConst";
import { MusicRepeatMode } from "@/constants/repeatModeConst";
import delay from "@/utils/delay";
import getUrlExt from "@/utils/getUrlExt";
import { errorLog, trace } from "@/utils/log";
import { createMediaIndexMap } from "@/utils/mediaIndexMap";
import { getLocalPath, isSameMediaItem } from "@/utils/mediaUtils";
import Network from "@/utils/network";
import PersistStatus from "@/utils/persistStatus";
import { getQualityOrder } from "@/utils/qualities";
import { musicIsPaused } from "@/utils/trackUtils";
import EventEmitter from "eventemitter3";
import { produce } from "immer";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import shuffle from "lodash.shuffle";
import ReactNativeTrackPlayer, {
    Event,
    State,
    Track,
    TrackMetadataBase,
    usePlaybackState,
    useProgress,
} from "react-native-track-player";
import LocalMusicSheet from "../localMusicSheet";

import { TrackPlayerEvents } from "@/core.defination/trackPlayer";
import type { IAppConfig } from "@/types/core/config";
import type { IMusicHistory } from "@/types/core/musicHistory";
import { ITrackPlayer } from "@/types/core/trackPlayer/index";
import { IPluginManager } from "@/types/core/pluginManager";
import { ImgAsset } from "@/constants/assetsConst";
import { resolveImportedAssetOrPath } from "@/utils/fileUtils";
import i18n from "@/core/i18n";
import {
    getSafePlaybackErrorDetails,
    handlePlaybackSourceFailure,
} from "./playbackFailure";
import {
    createPersistedTrack,
    createPersistedTrackList,
} from "./trackPersistence";
import { URL } from "react-native-url-polyfill";
import {
    ensureCrossProviderPlaybackFallbackDefault,
    getPlaybackPersistenceTrack,
    resolveCrossProviderPlaybackFallback,
} from "./crossProviderPlaybackFallback";
import {
    canAttemptNativePlaybackRecovery,
    recoverNativePlaybackFailure,
} from "./nativePlaybackRecovery";
import { prepareIosGoogleVideoSource } from "./iosGoogleVideoCache";

const currentMusicAtom = atom<IMusic.IMusicItem | null>(null);
const repeatModeAtom = atom<MusicRepeatMode>(MusicRepeatMode.QUEUE);
const qualityAtom = atom<IMusic.IQualityKey>("standard");
const playListAtom = atom<IMusic.IMusicItem[]>([]);

class TrackPlayer
    extends EventEmitter<{
        [TrackPlayerEvents.PlayEnd]: () => void;
        [TrackPlayerEvents.CurrentMusicChanged]: (
            musicItem: IMusic.IMusicItem | null,
        ) => void;
        [TrackPlayerEvents.ProgressChanged]: (progress: {
            position: number;
            duration: number;
        }) => void;
    }>
    implements ITrackPlayer {
    // 依赖
    private configService!: IAppConfig;
    private musicHistoryService!: IMusicHistory;
    private pluginManagerService!: IPluginManager;

    // 当前播放的音乐下标
    private currentIndex = -1;
    // 音乐播放器服务是否启动
    private serviceInited = false;
    // 播放队列索引map
    private playListIndexMap = createMediaIndexMap([] as IMusic.IMusicItem[]);
    private sourceResolutionId = 0;
    private nativeRecoveryAttemptedFor = -1;
    private fallbackProviderForResolution: {
        sourceResolutionId: number;
        providerName: string;
    } | null = null;

    private static maxMusicQueueLength = 10000;
    private static halfMaxMusicQueueLength = 5000;
    private static toggleRepeatMapping = {
        [MusicRepeatMode.SHUFFLE]: MusicRepeatMode.SINGLE,
        [MusicRepeatMode.SINGLE]: MusicRepeatMode.QUEUE,
        [MusicRepeatMode.QUEUE]: MusicRepeatMode.SHUFFLE,
    };
    private static fakeAudioUrl = "musicfree://fake-audio";
    private static proposedAudioUrl = "musicfree://proposed-audio";

    constructor() {
        super();
    }

    public get previousMusic() {
        const currentMusic = this.currentMusic;
        if (!currentMusic) {
            return null;
        }

        return this.getPlayListMusicAt(this.currentIndex - 1);
    }

    public get currentMusic() {
        return getDefaultStore().get(currentMusicAtom);
    }

    public get nextMusic() {
        const currentMusic = this.currentMusic;
        if (!currentMusic) {
            return null;
        }

        return this.getPlayListMusicAt(this.currentIndex + 1);
    }

    public get repeatMode() {
        return getDefaultStore().get(repeatModeAtom);
    }

    public get quality() {
        return getDefaultStore().get(qualityAtom);
    }

    public get playList() {
        return getDefaultStore().get(playListAtom);
    }

    injectDependencies(
        configService: IAppConfig,
        musicHistoryService: IMusicHistory,
        pluginManager: IPluginManager,
    ): void {
        this.configService = configService;
        this.musicHistoryService = musicHistoryService;
        this.pluginManagerService = pluginManager;
    }

    async setupTrackPlayer() {
        ensureCrossProviderPlaybackFallbackDefault(this.configService);
        const rate = PersistStatus.get("music.rate");
        const musicQueue = PersistStatus.get("music.playList");
        const repeatMode = PersistStatus.get("music.repeatMode");
        const progress = PersistStatus.get("music.progress");
        const track = PersistStatus.get("music.musicItem");
        const quality =
            PersistStatus.get("music.quality") ||
            this.configService.getConfig("basic.defaultPlayQuality") ||
            "standard";

        // 状态恢复
        if (rate) {
            ReactNativeTrackPlayer.setRate(+rate / 100);
        }
        if (repeatMode) {
            getDefaultStore().set(
                repeatModeAtom,
                repeatMode as MusicRepeatMode,
            );
        }

        if (musicQueue && Array.isArray(musicQueue)) {
            this.addAll(
                musicQueue,
                undefined,
                repeatMode === MusicRepeatMode.SHUFFLE,
            );
        }

        if (track && this.isInPlayList(track)) {
            this.sourceResolutionId += 1;
            if (!this.configService.getConfig("basic.autoPlayWhenAppStart")) {
                track.isInit = true;
            }

            // 异步
            this.pluginManagerService
                .getByMedia(track)
                ?.methods.getMediaSource(track, quality)
                .then(async newSource => {
                    const resolvedTrack = {
                        ...track,
                        url: newSource?.url || track.url,
                        headers: newSource?.headers || track.headers,
                    };

                    if (isSameMediaItem(this.currentMusic, track)) {
                        this.setQuality(newSource?.quality ?? quality);
                        const sourceWasSet = await this.setTrackSource(
                            resolvedTrack as Track,
                            false,
                            track,
                        );
                        if (!sourceWasSet) {
                            return;
                        }
                        if (progress) {
                            // 异步
                            this.seekTo(progress);
                        }
                    }
                });
            this.setCurrentMusic(track);

            if (progress) {
                // 异步
                this.seekTo(progress);
            }
        }

        if (!this.serviceInited) {
            /**
             * 此事件可能会被触发多次（比如直接替换queue） 参考代码：https://github.com/doublesymmetry/KotlinAudio
             */
            ReactNativeTrackPlayer.addEventListener(
                Event.PlaybackActiveTrackChanged,
                async evt => {
                    if (
                        evt.index === 1 &&
                        evt.lastIndex === 0 &&
                        evt.track?.url === TrackPlayer.fakeAudioUrl
                    ) {
                        trace("队列末尾，播放下一首");
                        this.emit(TrackPlayerEvents.PlayEnd);
                        if (this.repeatMode === MusicRepeatMode.SINGLE) {
                            await this.play(null, true);
                        } else {
                            // 当前生效的歌曲是下一曲的标记
                            await this.skipToNext();
                        }
                    }
                },
            );

            ReactNativeTrackPlayer.addEventListener(
                Event.PlaybackError,
                async e => {
                    const safeErrorDetails = getSafePlaybackErrorDetails(e);
                    errorLog("播放出错", safeErrorDetails);
                    // WARNING: 不稳定，报错的时候有可能track已经变到下一首歌去了
                    const currentTrack =
                        await ReactNativeTrackPlayer.getActiveTrack();
                    if (currentTrack?.isInit) {
                        // HACK: 避免初始失败的情况
                        ReactNativeTrackPlayer.updateMetadataForTrack(0, {
                            ...currentTrack,
                            // @ts-ignore
                            isInit: undefined,
                        });
                        return;
                    }

                    if (
                        currentTrack?.url !== TrackPlayer.fakeAudioUrl &&
                        currentTrack?.url !== TrackPlayer.proposedAudioUrl &&
                        (await ReactNativeTrackPlayer.getActiveTrackIndex()) ===
                            0 &&
                        e.message &&
                        e.message !== "android-io-file-not-found"
                    ) {
                        trace("播放出错", safeErrorDetails);

                        const recovered =
                            await this.tryRecoverNativePlaybackError(
                                currentTrack as IMusic.IMusicItem,
                            );
                        if (!recovered) {
                            await this.handlePlayFail();
                        }
                    }
                },
            );

            this.serviceInited = true;
        }
    }

    /**************** 播放队列 ******************/
    getMusicIndexInPlayList(musicItem?: IMusic.IMusicItem | null) {
        if (!musicItem) {
            return -1;
        }
        return this.playListIndexMap.getIndex(musicItem);
    }

    isInPlayList(musicItem?: IMusic.IMusicItem | null) {
        if (!musicItem) {
            return false;
        }

        return this.playListIndexMap.has(musicItem);
    }

    getPlayListMusicAt(index: number): IMusic.IMusicItem | null {
        const playList = this.playList;
        const len = playList.length;
        if (len === 0) {
            return null;
        }
        return playList[(index + len) % len];
    }

    isPlayListEmpty() {
        return this.playList.length === 0;
    }

    /****** 播放逻辑 *****/
    addAll(
        musicItems: Array<IMusic.IMusicItem>,
        beforeIndex?: number,
        shouldShuffle?: boolean,
    ): void {
        const now = Date.now();
        let newPlayList: IMusic.IMusicItem[] = [];
        let currentPlayList = this.playList;
        musicItems.forEach((item, index) => {
            item[timeStampSymbol] = now;
            item[sortIndexSymbol] = index;
        });

        if (beforeIndex === undefined || beforeIndex < 0) {
            // 1.1. 添加到歌单末尾，并过滤掉已有的歌曲
            newPlayList = currentPlayList.concat(
                musicItems.filter(item => !this.isInPlayList(item)),
            );
        } else {
            // 1.2. 新的播放列表，插入
            const indexMap = createMediaIndexMap(musicItems);
            const beforeDraft = currentPlayList
                .slice(0, beforeIndex)
                .filter(item => !indexMap.has(item));
            const afterDraft = currentPlayList
                .slice(beforeIndex)
                .filter(item => !indexMap.has(item));

            newPlayList = [...beforeDraft, ...musicItems, ...afterDraft];
        }

        // 如果太长了
        if (newPlayList.length > TrackPlayer.maxMusicQueueLength) {
            newPlayList = this.shrinkPlayListToSize(
                newPlayList,
                beforeIndex ?? newPlayList.length - 1,
            );
        }

        // 2. 如果需要随机
        if (shouldShuffle) {
            newPlayList = shuffle(newPlayList);
        }
        // 3. 设置播放列表
        this.setPlayList(newPlayList);
    }

    add(
        musicItem: IMusic.IMusicItem | IMusic.IMusicItem[],
        beforeIndex?: number,
    ): void {
        this.addAll(
            Array.isArray(musicItem) ? musicItem : [musicItem],
            beforeIndex,
        );
    }

    addNext(musicItem: IMusic.IMusicItem | IMusic.IMusicItem[]): void {
        const shouldAutoPlay = this.isPlayListEmpty() || !this.currentMusic;

        this.add(musicItem, this.currentIndex + 1);

        if (shouldAutoPlay) {
            this.play(Array.isArray(musicItem) ? musicItem[0] : musicItem);
        }
    }

    async remove(musicItem: IMusic.IMusicItem): Promise<void> {
        const playList = this.playList;

        let newPlayList: IMusic.IMusicItem[] = [];
        let currentMusic: IMusic.IMusicItem | null = this.currentMusic;
        const targetIndex = this.getMusicIndexInPlayList(musicItem);
        let shouldPlayCurrent: boolean | null = null;
        if (targetIndex === -1) {
            // 1. 这种情况应该是出错了
            return;
        }
        // 2. 移除的是当前项
        if (this.currentIndex === targetIndex) {
            // 2.1 停止播放，移除当前项
            newPlayList = produce(playList, draft => {
                draft.splice(targetIndex, 1);
            });
            // 2.2 设置新的播放列表，并更新当前音乐
            if (newPlayList.length === 0) {
                currentMusic = null;
                shouldPlayCurrent = false;
            } else {
                currentMusic =
                    newPlayList[this.currentIndex % newPlayList.length];
                try {
                    const state = (
                        await ReactNativeTrackPlayer.getPlaybackState()
                    ).state;
                    shouldPlayCurrent = !musicIsPaused(state);
                } catch {
                    shouldPlayCurrent = false;
                }
            }
            this.setCurrentMusic(currentMusic);
        } else {
            // 3. 删除
            newPlayList = produce(playList, draft => {
                draft.splice(targetIndex, 1);
            });
        }

        this.setPlayList(newPlayList);
        if (shouldPlayCurrent === true) {
            await this.play(currentMusic, true);
        } else if (shouldPlayCurrent === false) {
            await ReactNativeTrackPlayer.reset();
        }
    }

    isCurrentMusic(musicItem?: IMusic.IMusicItem | null) {
        return isSameMediaItem(musicItem, this.currentMusic);
    }

    async play(
        musicItem?: IMusic.IMusicItem | null,
        forcePlay?: boolean,
    ): Promise<void> {
        try {
            // 如果不传参，默认是播放当前音乐
            if (!musicItem) {
                musicItem = this.currentMusic;
            }
            if (!musicItem) {
                throw new Error(PlayFailReason.PLAY_LIST_IS_EMPTY);
            }
            // 1. 移动网络禁止播放
            const localPath = getLocalPath(musicItem);
            if (
                Network.isCellular &&
                !this.configService.getConfig("basic.useCelluarNetworkPlay") &&
                !LocalMusicSheet.isLocalMusic(musicItem) &&
                !localPath
            ) {
                await ReactNativeTrackPlayer.reset();
                throw new Error(PlayFailReason.FORBID_CELLUAR_NETWORK_PLAY);
            }

            // 2. 如果是当前正在播放的音频
            if (this.isCurrentMusic(musicItem)) {
                // 获取底层播放器中的track
                const currentTrack = await ReactNativeTrackPlayer.getTrack(0);
                // 2.1 如果当前有源
                if (
                    currentTrack?.url &&
                    isSameMediaItem(
                        musicItem,
                        currentTrack as IMusic.IMusicItem,
                    )
                ) {
                    const currentActiveIndex =
                        await ReactNativeTrackPlayer.getActiveTrackIndex();
                    if (currentActiveIndex !== 0) {
                        await ReactNativeTrackPlayer.skip(0);
                    }
                    if (forcePlay) {
                        // 2.1.1 强制重新开始
                        await this.seekTo(0);
                    }
                    const currentState = (
                        await ReactNativeTrackPlayer.getPlaybackState()
                    ).state;
                    const shouldReloadSource =
                        currentState === State.Stopped ||
                        currentState === State.Error;
                    if (forcePlay || shouldReloadSource) {
                        this.sourceResolutionId += 1;
                    }
                    if (shouldReloadSource) {
                        await this.setTrackSource(
                            currentTrack,
                            true,
                            this.currentMusic ??
                                (currentTrack as IMusic.IMusicItem),
                        );
                    }
                    if (currentState !== State.Playing) {
                        // 2.1.2 恢复播放
                        await ReactNativeTrackPlayer.play();
                    }
                    // 这种情况下，播放队列和当前歌曲都不需要变化
                    return;
                }
                // 2.2 其他情况：重新获取源
            }

            // 3. 如果没有在播放列表中，添加到队尾；同时更新列表状态
            const inPlayList = this.isInPlayList(musicItem);
            if (!inPlayList) {
                this.add(musicItem);
            }

            // 4. 更新列表状态和当前音乐
            this.setCurrentMusic(musicItem);
            const sourceResolutionId = ++this.sourceResolutionId;
            this.fallbackProviderForResolution = null;
            await ReactNativeTrackPlayer.setQueue([
                {
                    ...musicItem,
                    url: TrackPlayer.proposedAudioUrl,
                    artwork: resolveImportedAssetOrPath(
                        musicItem.artwork?.trim?.()?.length
                            ? musicItem.artwork
                            : ImgAsset.albumDefault,
                    ) as unknown as any,
                },
                this.getFakeNextTrack(),
            ]);

            // 5. 获取音源
            let track: IMusic.IMusicItem;
            let usedCrossProviderFallback = false;

            // 5.1 通过插件获取音源
            const plugin = this.pluginManagerService.getByName(
                musicItem.platform,
            );
            // 5.2 获取音质排序
            const qualityOrder = getQualityOrder(
                this.configService.getConfig("basic.defaultPlayQuality") ??
                    "standard",
                this.configService.getConfig("basic.playQualityOrder") ?? "asc",
            );
            // 5.3 插件返回音源
            let source: IPlugin.IMediaSourceResult | null = null;
            for (let quality of qualityOrder) {
                if (this.isCurrentMusic(musicItem)) {
                    source =
                        (await plugin?.methods?.getMediaSource(
                            musicItem,
                            quality,
                        )) ?? null;
                    // 5.3.1 获取到真实源
                    if (source) {
                        this.setQuality(source.quality ?? quality);
                        break;
                    }
                } else {
                    // 5.3.2 已经切换到其他歌曲了，
                    return;
                }
            }

            if (!this.isCurrentMusic(musicItem)) {
                return;
            }
            if (!source) {
                // 如果有source
                if (musicItem.source) {
                    for (let quality of qualityOrder) {
                        if (musicItem.source[quality]?.url) {
                            source = musicItem.source[quality]!;
                            this.setQuality(quality);

                            break;
                        }
                    }
                }
                // 5.4 没有返回源
                if (!source && !musicItem.url) {
                    // 插件失效的情况
                    if (
                        this.configService.getConfig(
                            "basic.tryChangeSourceWhenPlayFail",
                        )
                    ) {
                        // 重试
                        const searchablePlugins =
                            this.pluginManagerService.getSearchablePlugins(
                                "music",
                            );
                        const fallback =
                            await resolveCrossProviderPlaybackFallback({
                                musicItem,
                                qualityOrder,
                                getPluginByName: name =>
                                    searchablePlugins.find(
                                        pluginItem => pluginItem.name === name,
                                    ),
                                shouldAbort: () =>
                                    !this.isCurrentMusic(musicItem),
                            });

                        if (fallback) {
                            source = fallback.source;
                            usedCrossProviderFallback = true;
                            this.fallbackProviderForResolution = {
                                sourceResolutionId,
                                providerName: fallback.matchedItem.platform,
                            };
                            this.setQuality(source.quality ?? "standard");
                        }

                        if (!source) {
                            throw new Error(PlayFailReason.INVALID_SOURCE);
                        }
                    } else {
                        throw new Error(PlayFailReason.INVALID_SOURCE);
                    }
                } else {
                    source = {
                        url: musicItem.url,
                    };
                    this.setQuality("standard");
                }
            }

            // 6. 特殊类型源
            const resolvedSource = source as IPlugin.IMediaSourceResult;
            const playbackSource: IPlugin.IMediaSourceResult & {
                type?: "hls";
            } =
                getUrlExt(resolvedSource.url) === ".m3u8"
                    ? {
                        ...resolvedSource,
                        type: "hls",
                    }
                    : resolvedSource;
            // 7. 合并结果
            track = this.mergeTrackSource(
                musicItem,
                playbackSource,
            ) as IMusic.IMusicItem;

            // 8. 新增历史记录
            this.musicHistoryService.addMusic(
                createPersistedTrack(musicItem, URL),
            );

            trace("获取音源成功", {
                platform: track.platform,
                title: track.title,
                hasUrl: Boolean(track.url),
            });
            // 9. 设置音源
            await this.setTrackSource(
                track as Track,
                true,
                getPlaybackPersistenceTrack(
                    track,
                    musicItem,
                    usedCrossProviderFallback,
                ),
            );

            // 10. 获取补充信息
            let info: Partial<IMusic.IMusicItem> | null = null;
            try {
                info =
                    (await plugin?.methods?.getMusicInfo?.(musicItem)) ?? null;
                if (
                    (typeof info?.url === "string" && info.url.trim() === "") ||
                    (info?.url && typeof info.url !== "string")
                ) {
                    delete info.url;
                }
            } catch {}

            // 11. 设置补充信息
            if (info && this.isCurrentMusic(musicItem)) {
                const mergedTrack = this.mergeTrackSource(track, info);
                getDefaultStore().set(
                    currentMusicAtom,
                    mergedTrack as IMusic.IMusicItem,
                );
                await ReactNativeTrackPlayer.updateMetadataForTrack(
                    0,
                    mergedTrack as TrackMetadataBase,
                );
            }
        } catch (e: any) {
            const message = e?.message;
            if (
                message ===
                "The player is not initialized. Call setupPlayer first."
            ) {
                await ReactNativeTrackPlayer.setupPlayer();
                this.play(musicItem, forcePlay);
            } else if (message === PlayFailReason.FORBID_CELLUAR_NETWORK_PLAY) {
                if (getCurrentDialog()?.name !== "SimpleDialog") {
                    showDialog("SimpleDialog", {
                        title: "流量提醒",
                        content:
                            "当前非WIFI环境，侧边栏设置中打开【使用移动网络播放】功能后可继续播放",
                    });
                }
            } else if (message === PlayFailReason.INVALID_SOURCE) {
                trace("音源为空，播放失败");
                await this.handlePlayFail();
            } else if (message === PlayFailReason.PLAY_LIST_IS_EMPTY) {
                // 队列是空的，不应该出现这种情况
            } else {
                errorLog("播放失败", {
                    message:
                        typeof message === "string"
                            ? message
                            : "Unknown playback error",
                });
            }
        }
    }

    async pause(): Promise<void> {
        await ReactNativeTrackPlayer.pause();
    }

    toggleRepeatMode(): void {
        this.setRepeatMode(TrackPlayer.toggleRepeatMapping[this.repeatMode]);
    }

    // 清空播放队列
    async clearPlayList(): Promise<void> {
        this.setPlayList([]);
        this.setCurrentMusic(null);

        await ReactNativeTrackPlayer.reset();
        PersistStatus.set("music.musicItem", undefined);
        PersistStatus.set("music.progress", 0);
    }

    async skipToNext(): Promise<void> {
        if (this.isPlayListEmpty()) {
            this.setCurrentMusic(null);
            return;
        }

        await this.play(this.getPlayListMusicAt(this.currentIndex + 1), true);
    }

    async skipToPrevious(): Promise<void> {
        if (this.isPlayListEmpty()) {
            this.setCurrentMusic(null);
            return;
        }

        await this.play(
            this.getPlayListMusicAt(
                this.currentIndex === -1 ? 0 : this.currentIndex - 1,
            ),
            true,
        );
    }

    async changeQuality(newQuality: IMusic.IQualityKey): Promise<boolean> {
        // 获取当前的音乐和进度
        if (newQuality === this.quality) {
            return true;
        }

        // 获取当前歌曲
        const musicItem = this.currentMusic;
        if (!musicItem) {
            return false;
        }
        try {
            const progress = await ReactNativeTrackPlayer.getProgress();
            const plugin = this.pluginManagerService.getByMedia(musicItem);
            const newSource = await plugin?.methods?.getMediaSource(
                musicItem,
                newQuality,
            );
            if (!newSource?.url) {
                throw new Error(PlayFailReason.INVALID_SOURCE);
            }
            if (this.isCurrentMusic(musicItem)) {
                const playingState = (
                    await ReactNativeTrackPlayer.getPlaybackState()
                ).state;
                this.sourceResolutionId += 1;
                const sourceWasSet = await this.setTrackSource(
                    this.mergeTrackSource(
                        musicItem,
                        newSource,
                    ) as unknown as Track,
                    !musicIsPaused(playingState),
                    musicItem,
                );
                if (!sourceWasSet) {
                    return false;
                }

                await this.seekTo(progress.position ?? 0);
                this.setQuality(newSource.quality ?? newQuality);
            }
            return true;
        } catch {
            // 修改失败
            return false;
        }
    }

    async playWithReplacePlayList(
        musicItem: IMusic.IMusicItem,
        newPlayList: IMusic.IMusicItem[],
    ): Promise<void> {
        if (newPlayList.length !== 0) {
            const now = Date.now();
            if (newPlayList.length > TrackPlayer.maxMusicQueueLength) {
                newPlayList = this.shrinkPlayListToSize(
                    newPlayList,
                    newPlayList.findIndex(it => isSameMediaItem(it, musicItem)),
                );
            }

            newPlayList.forEach((it, index) => {
                it[timeStampSymbol] = now;
                it[sortIndexSymbol] = index;
            });

            this.setPlayList(
                this.repeatMode === MusicRepeatMode.SHUFFLE
                    ? shuffle(newPlayList)
                    : newPlayList,
            );
            await this.play(musicItem, true);
        }
    }

    async seekTo(progress: number) {
        PersistStatus.set("music.progress", progress);
        return ReactNativeTrackPlayer.seekTo(progress);
    }

    getProgress = ReactNativeTrackPlayer.getProgress;
    getRate = ReactNativeTrackPlayer.getRate;
    setRate = ReactNativeTrackPlayer.setRate;
    reset = ReactNativeTrackPlayer.reset;

    /**************** 辅助函数 -- 设置内部状态 ****************/

    private setCurrentMusic(musicItem?: IMusic.IMusicItem | null) {
        // 设置UI内部状态的musicitem
        if (!musicItem) {
            this.currentIndex = -1;
            getDefaultStore().set(currentMusicAtom, null);
            PersistStatus.set("music.musicItem", undefined);
            PersistStatus.set("music.progress", 0);

            this.emit(TrackPlayerEvents.CurrentMusicChanged, null);
            return;
        }
        if (typeof musicItem.artwork !== "string") {
            musicItem.artwork = ImgAsset.albumDefault;
        }
        this.currentIndex = this.getMusicIndexInPlayList(musicItem);
        getDefaultStore().set(currentMusicAtom, musicItem);

        this.emit(TrackPlayerEvents.CurrentMusicChanged, musicItem);
    }

    private setRepeatMode(mode: MusicRepeatMode) {
        const playList = this.playList;
        let newPlayList: IMusic.IMusicItem[];
        const prevMode = getDefaultStore().get(repeatModeAtom);
        if (
            (prevMode === MusicRepeatMode.SHUFFLE &&
                mode !== MusicRepeatMode.SHUFFLE) ||
            (mode === MusicRepeatMode.SHUFFLE &&
                prevMode !== MusicRepeatMode.SHUFFLE)
        ) {
            if (mode === MusicRepeatMode.SHUFFLE) {
                newPlayList = shuffle(playList);
            } else {
                newPlayList = this.sortByTimestampAndIndex(playList, true);
            }
            this.setPlayList(newPlayList);
        }

        getDefaultStore().set(repeatModeAtom, mode);
        // 更新下一首歌的信息
        ReactNativeTrackPlayer.updateMetadataForTrack(
            1,
            this.getFakeNextTrack(),
        );
        // 记录
        PersistStatus.set("music.repeatMode", mode);
    }

    private setQuality(quality: IMusic.IQualityKey) {
        getDefaultStore().set(qualityAtom, quality);
        PersistStatus.set("music.quality", quality);
    }

    // 设置音源
    private async setTrackSource(
        track: Track,
        autoPlay = true,
        persistedTrack: IMusic.IMusicItem,
    ) {
        const clonedTrack = this.patchMediaArtwork(track);
        if (!clonedTrack) {
            return false;
        }
        const sourceResolutionId = this.sourceResolutionId;
        let playableTrack = clonedTrack;
        if (typeof clonedTrack.url === "string") {
            try {
                const googleVideoTrack = clonedTrack as Track & {
                    contentLength?: number;
                    formatId?: number;
                };
                const preparedSource = await prepareIosGoogleVideoSource({
                    source: {
                        url: clonedTrack.url,
                        headers: clonedTrack.headers as
                            | Record<string, string>
                            | undefined,
                        userAgent: clonedTrack.userAgent,
                        contentLength: googleVideoTrack.contentLength,
                        formatId: googleVideoTrack.formatId,
                    },
                    mediaId: String(persistedTrack.id ?? track.id ?? "media"),
                    shouldAbort: () =>
                        sourceResolutionId !== this.sourceResolutionId,
                });
                if (sourceResolutionId !== this.sourceResolutionId) {
                    return false;
                }
                playableTrack = {
                    ...clonedTrack,
                    ...preparedSource,
                };
            } catch {
                if (sourceResolutionId !== this.sourceResolutionId) {
                    return false;
                }
                throw new Error(PlayFailReason.INVALID_SOURCE);
            }
        }
        await ReactNativeTrackPlayer.setQueue([
            playableTrack,
            this.getFakeNextTrack(),
        ]);
        PersistStatus.set(
            "music.musicItem",
            createPersistedTrack(persistedTrack, URL),
        );
        PersistStatus.set("music.progress", 0);
        if (autoPlay) {
            await ReactNativeTrackPlayer.play();
        }
        return true;
    }

    /**
     * 设置播放队列
     * @param newPlayList 播放队列
     * @param persist 是否持久化
     */
    private setPlayList(newPlayList: IMusic.IMusicItem[], persist = true) {
        getDefaultStore().set(playListAtom, newPlayList);

        this.playListIndexMap = createMediaIndexMap(newPlayList);

        if (persist) {
            PersistStatus.set(
                "music.playList",
                createPersistedTrackList(newPlayList, URL),
            );
        }

        this.currentIndex = this.getMusicIndexInPlayList(this.currentMusic);
    }

    /**************** 辅助函数 -- 工具方法 ****************/
    private shrinkPlayListToSize = (
        queue: IMusic.IMusicItem[],
        targetIndex = this.currentIndex,
    ) => {
        // 播放列表上限，太多无法缓存状态
        if (queue.length > TrackPlayer.maxMusicQueueLength) {
            if (targetIndex < TrackPlayer.halfMaxMusicQueueLength) {
                queue = queue.slice(0, TrackPlayer.maxMusicQueueLength);
            } else {
                const right = Math.min(
                    queue.length,
                    targetIndex + TrackPlayer.halfMaxMusicQueueLength,
                );
                const left = Math.max(
                    0,
                    right - TrackPlayer.maxMusicQueueLength,
                );
                queue = queue.slice(left, right);
            }
        }
        return queue;
    };

    private mergeTrackSource(
        mediaItem: ICommon.IMediaBase,
        props: Record<string, any> | undefined,
    ) {
        return props
            ? {
                ...mediaItem,
                ...props,
                id: mediaItem.id,
                platform: mediaItem.platform,
            }
            : mediaItem;
    }

    private sortByTimestampAndIndex(array: any[], newArray = false) {
        if (newArray) {
            array = [...array];
        }
        return array.sort((a, b) => {
            const ts = a[timeStampSymbol] - b[timeStampSymbol];
            if (ts !== 0) {
                return ts;
            }
            return a[sortIndexSymbol] - b[sortIndexSymbol];
        });
    }

    private getFakeNextTrack() {
        let track: Track | undefined;
        const repeatMode = this.repeatMode;
        if (repeatMode === MusicRepeatMode.SINGLE) {
            // 单曲循环
            track = this.getPlayListMusicAt(this.currentIndex) as Track;
        } else {
            // 下一曲
            track = this.getPlayListMusicAt(this.currentIndex + 1) as Track;
        }

        if (track) {
            return produce(track, _ => {
                _.url = TrackPlayer.fakeAudioUrl;
                _.$ = internalFakeSoundKey;
                _.artwork = resolveImportedAssetOrPath(
                    ImgAsset.albumDefault,
                ) as unknown as any;
            });
        } else {
            // 只有列表长度为0时才会出现的特殊情况
            return {
                url: TrackPlayer.fakeAudioUrl,
                $: internalFakeSoundKey,
            } as Track;
        }
    }

    private async handlePlayFail() {
        await handlePlaybackSourceFailure(
            {
                platform:
                    this.currentMusic?.platform ?? i18n.t("common.unknownName"),
                autoStopWhenError: Boolean(
                    this.configService.getConfig("basic.autoStopWhenError"),
                ),
            },
            {
                getCurrentDialog,
                showDialog,
                translate: (key, args) => i18n.t(key, args),
                delay,
                skipToNext: () => this.skipToNext(),
            },
        );
    }

    private async tryRecoverNativePlaybackError(
        currentTrack: IMusic.IMusicItem,
    ) {
        const sourceResolutionId = this.sourceResolutionId;
        if (
            !canAttemptNativePlaybackRecovery(
                sourceResolutionId,
                this.nativeRecoveryAttemptedFor,
            )
        ) {
            return false;
        }

        const musicItem = this.currentMusic;
        if (
            !musicItem ||
            !isSameMediaItem(musicItem, currentTrack) ||
            LocalMusicSheet.isLocalMusic(musicItem) ||
            !this.configService.getConfig("basic.tryChangeSourceWhenPlayFail")
        ) {
            return false;
        }

        // Claim before networking so duplicate native errors cannot race.
        this.nativeRecoveryAttemptedFor = sourceResolutionId;
        const qualityOrder = getQualityOrder(
            this.configService.getConfig("basic.defaultPlayQuality") ??
                "standard",
            this.configService.getConfig("basic.playQualityOrder") ?? "asc",
        );
        const searchablePlugins =
            this.pluginManagerService.getSearchablePlugins("music");

        return recoverNativePlaybackFailure(
            {
                musicItem,
                qualityOrder,
                excludedProviderNames:
                    this.fallbackProviderForResolution?.sourceResolutionId ===
                    sourceResolutionId
                        ? [this.fallbackProviderForResolution.providerName]
                        : [],
                isStillCurrent: () =>
                    sourceResolutionId === this.sourceResolutionId &&
                    this.isCurrentMusic(musicItem),
            },
            {
                getPluginByName: name =>
                    searchablePlugins.find(plugin => plugin.name === name),
                getPosition: async () =>
                    (await ReactNativeTrackPlayer.getProgress()).position ?? 0,
                replaceSource: async (source, originalMusicItem, position) => {
                    if (
                        sourceResolutionId !== this.sourceResolutionId ||
                        !this.isCurrentMusic(originalMusicItem)
                    ) {
                        throw new Error("stale playback recovery");
                    }
                    this.setQuality(source.quality ?? "standard");
                    const normalizedSource =
                        getUrlExt(source.url) === ".m3u8"
                            ? {
                                ...source,
                                type: "hls" as const,
                            }
                            : source;
                    const replacement = this.mergeTrackSource(
                        originalMusicItem,
                        normalizedSource,
                    ) as unknown as Track;
                    await this.setTrackSource(
                        replacement,
                        true,
                        originalMusicItem,
                    );
                    if (
                        position > 0 &&
                        this.isCurrentMusic(originalMusicItem)
                    ) {
                        await this.seekTo(position);
                    }
                },
            },
        );
    }

    private patchMediaArtwork(track: Track) {
        // Bug: React native track player 在设置音频时，artwork不能为null，并且部分情况下artwork不能为ImageSource类型
        if (!track) {
            return null;
        }
        return {
            ...track,
            artwork: resolveImportedAssetOrPath(
                track.artwork?.trim?.()?.length
                    ? track.artwork
                    : ImgAsset.albumDefault,
            ) as unknown as any,
        };
    }
}

export const usePlayList = () => useAtomValue(playListAtom);
export const useCurrentMusic = () => useAtomValue(currentMusicAtom);
export const useRepeatMode = () => useAtomValue(repeatModeAtom);
export const useMusicQuality = () => useAtomValue(qualityAtom);
export function useMusicState() {
    const playbackState = usePlaybackState();

    return playbackState.state;
}
export { State as MusicState, useProgress };

enum PlayFailReason {
    /** 禁止移动网络播放 */
    FORBID_CELLUAR_NETWORK_PLAY = "FORBID_CELLUAR_NETWORK_PLAY",
    /** 播放列表为空 */
    PLAY_LIST_IS_EMPTY = "PLAY_LIST_IS_EMPTY",
    /** 无效源 */
    INVALID_SOURCE = "INVALID_SOURCE",
    /** 非当前音乐 */
}

const trackPlayer = new TrackPlayer();
export default trackPlayer;
