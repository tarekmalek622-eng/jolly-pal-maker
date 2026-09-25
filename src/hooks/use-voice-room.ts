import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LocalAudioTrack,
  RemoteTrack,
  RemoteTrackPublication,
  Room as LiveKitRoom,
} from "livekit-client";
import type { IAgoraRTCClient, IMicrophoneAudioTrack, IRemoteAudioTrack } from "agora-rtc-sdk-ng";
import {
  endVoiceSession,
  getAgoraVoiceToken,
  getVoiceToken,
  logVoiceEvent,
  startVoiceSession,
} from "@/lib/voice.functions";

export type VoiceStatus =
  "idle" | "connecting" | "connected" | "reconnecting" | "error" | "unconfigured";

export type VoiceQuality = "excellent" | "good" | "poor" | "unknown";

type VoiceProvider = "livekit" | "agora" | null;

const MAX_AUTO_RETRIES = 5;

const ARABIC_RE = /[\u0600-\u06FF]/;

/** يحوّل أخطاء الصوت التقنية (الإنجليزية) إلى رسالة عربية واضحة للمستخدم. */
function friendlyVoiceError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (ARABIC_RE.test(msg)) return msg;
  if (/not allowed|permission|denied|microphone|device/i.test(msg))
    return "اسمح بالوصول إلى المايك من إعدادات المتصفح ثم أعد المحاولة";
  return "تعذر الاتصال بالصوت — تحقق من الإنترنت ثم أعد المحاولة";
}

/**
 * اتصال الصوت داخل الغرفة.
 * الأساسي LiveKit، ولو فشل أو مش متظبط يتحوّل تلقائيًا لمزود احتياطي (Agora)
 * عشان الصوت يفضل شغال حتى لو خدمة وقعت.
 * المكتبتان يُحمَّلان عند دخول الغرفة فقط (استيراد كسول) عشان باقي الصفحات تفتح بسرعة.
 */
export function useVoiceRoom(roomId: string | null, canPublish: boolean) {
  const roomRef = useRef<LiveKitRoom | null>(null);
  const agoraRef = useRef<{ client: IAgoraRTCClient; micTrack: IMicrophoneAudioTrack | null } | null>(null);
  const agoraRemoteAudio = useRef<Map<string, IRemoteAudioTrack>>(new Map());
  const providerRef = useRef<VoiceProvider>(null);
  const audioElements = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [speakingIds, setSpeakingIds] = useState<string[]>([]);
  const [retryKey, setRetryKey] = useState(0);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicName, setMusicName] = useState<string | null>(null);
  const [quality, setQuality] = useState<VoiceQuality>("unknown");
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [dataSaver, setDataSaverState] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem("sawtak-data-saver") === "on",
  );
  const musicElRef = useRef<HTMLAudioElement | null>(null);
  const stopMusicRef = useRef<(() => void) | null>(null);
  const autoRetryCount = useRef(0);
  const autoRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartRef = useRef<number>(0);
  const dataSaverRef = useRef(dataSaver);
  dataSaverRef.current = dataSaver;

  /** Re-run the connection attempt after a failure. */
  const retry = useCallback(() => {
    autoRetryCount.current = 0;
    setRetryKey((k) => k + 1);
  }, []);

  /** وضع توفير البيانات: جودة صوت أقل للإنترنت الضعيف. */
  const setDataSaver = useCallback((on: boolean) => {
    setDataSaverState(on);
    if (typeof window !== "undefined")
      window.localStorage.setItem("sawtak-data-saver", on ? "on" : "off");
  }, []);

  /** يسجّل حدث صوتي في السجل (بدون تعطيل التجربة عند الفشل). */
  const logEvent = useCallback(
    (event: string, provider?: string | null, detail?: string) => {
      void logVoiceEvent({
        data: {
          event,
          ...(roomId ? { roomId } : {}),
          ...(provider ? { provider } : {}),
          ...(detail ? { detail } : {}),
        },
      }).catch(() => {});
    },
    [roomId],
  );

  /** يبدأ تتبع جلسة الصوت (لحساب الساعات الأسبوعية). */
  const beginSession = useCallback(() => {
    if (!roomId || sessionIdRef.current) return;
    sessionStartRef.current = Date.now();
    void startVoiceSession({ data: { roomId } })
      .then((r) => {
        sessionIdRef.current = r.sessionId;
      })
      .catch(() => {});
  }, [roomId]);

  const endSession = useCallback(() => {
    const id = sessionIdRef.current;
    sessionIdRef.current = null;
    if (!id) return;
    const seconds = Math.round((Date.now() - sessionStartRef.current) / 1000);
    void endVoiceSession({ data: { sessionId: id, seconds } }).catch(() => {});
  }, []);

  const attach = useCallback((track: RemoteTrack, publication: RemoteTrackPublication) => {
    if (track.kind !== "audio") return;
    const el = track.attach();
    el.autoplay = true;
    audioElements.current.set(publication.trackSid, el as HTMLAudioElement);
    document.body.appendChild(el);
  }, []);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    const attachedAudio = audioElements.current;

    void (async () => {
      setStatus("connecting");
      setError(null);
      let livekitReason: string | null = null;

      // يحاول الاتصال بخادم LiveKit معين (أساسي أو احتياطي)
      const tryLiveKit = async (url: string, token: string, label?: string) => {
        const lk = await import("livekit-client");
        const room = new lk.Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;
        room
          .on(lk.RoomEvent.TrackSubscribed, attach)
          .on(lk.RoomEvent.TrackUnsubscribed, (track, publication) => {
            track.detach().forEach((el) => el.remove());
            attachedAudio.delete(publication.trackSid);
          })
          .on(lk.RoomEvent.ActiveSpeakersChanged, (speakers) => {
            setSpeakingIds(speakers.map((s) => s.identity));
          })
          .on(lk.RoomEvent.ConnectionQualityChanged, (q) => {
            if (q === lk.ConnectionQuality.Excellent) setQuality("excellent");
            else if (q === lk.ConnectionQuality.Good) setQuality("good");
            else if (q === lk.ConnectionQuality.Poor) setQuality("poor");
            else setQuality("unknown");
          })
          .on(lk.RoomEvent.ConnectionStateChanged, (state) => {
            if (state === lk.ConnectionState.Connected) {
              setStatus("connected");
              autoRetryCount.current = 0;
            } else if (state === lk.ConnectionState.Reconnecting) {
              setStatus("reconnecting");
            } else if (state === lk.ConnectionState.Disconnected) {
              // فصل غير متوقع — إعادة اتصال تلقائية حتى 5 مرات
              if (!cancelled && autoRetryCount.current < MAX_AUTO_RETRIES) {
                autoRetryCount.current += 1;
                setStatus("reconnecting");
                logEvent("auto_reconnect", providerRef.current ?? undefined, `محاولة ${autoRetryCount.current}`);
                autoRetryTimer.current = setTimeout(() => {
                  if (!cancelled) setRetryKey((k) => k + 1);
                }, 3000);
              } else if (!cancelled) {
                setStatus("error");
                setError("انقطع الاتصال بالصوت — اضغط إعادة المحاولة");
              }
            }
          });
        await room.connect(url, token, { autoSubscribe: true });
        if (cancelled) {
          void room.disconnect();
          return false;
        }
        providerRef.current = "livekit";
        setActiveProvider(label ?? "livekit");
        setStatus("connected");
        beginSession();
        return true;
      };

      // 1) المزود الأساسي: LiveKit (ثم مفاتيحه الاحتياطية، ثم Agora)
      try {
        const result = await getVoiceToken({ data: { roomId, canPublish } });
        if (cancelled) return;
        if (result.configured && result.token && result.url) {
          // أ) الخادم الأساسي
          try {
            if (await tryLiveKit(result.url, result.token, result.providerLabel)) return;
            return;
          } catch (e) {
            livekitReason = friendlyVoiceError(e);
            roomRef.current = null;
            logEvent("provider_failed", result.providerLabel ?? "livekit", "فشل الاتصال بالمزود الأساسي");
          }
          // ب) الخادم الاحتياطي (مفاتيح LiveKit التانية) لو الأساسي فصل
          if (!cancelled && result.backupToken && result.backupUrl) {
            try {
              logEvent("provider_switch", result.backupLabel ?? "livekit-backup", "تحويل تلقائي للمزود الاحتياطي");
              if (await tryLiveKit(result.backupUrl, result.backupToken, result.backupLabel)) return;
              return;
            } catch {
              /* نكمل للمزود الاحتياطي Agora */
              roomRef.current = null;
              logEvent("provider_failed", result.backupLabel ?? "livekit-backup", "فشل الاتصال بالمزود الاحتياطي");
            }
          }
        } else {
          livekitReason = result.reason ?? null;
        }
      } catch (e) {
        livekitReason = friendlyVoiceError(e);
      }

      // 2) المزود الاحتياطي: Agora — يشتغل تلقائيًا لو الأساسي فشل أو مش متظبط
      try {
        const ag = await getAgoraVoiceToken({ data: { roomId, canPublish } });
        if (cancelled) return;
        if (ag.configured && ag.token && ag.appId) {
          const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
          const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
          agoraRef.current = { client, micTrack: null };
          const remoteAudio = agoraRemoteAudio.current;
          client.on("user-published", async (user, mediaType) => {
            if (mediaType !== "audio") return;
            await client.subscribe(user, mediaType);
            if (user.audioTrack) {
              remoteAudio.set(String(user.uid), user.audioTrack);
              user.audioTrack.play();
            }
          });
          client.on("user-unpublished", (user, mediaType) => {
            if (mediaType === "audio") remoteAudio.delete(String(user.uid));
          });
          client.on("user-left", (user) => remoteAudio.delete(String(user.uid)));
          client.enableAudioVolumeIndicator();
          client.on("volume-indicator", (vols) => {
            setSpeakingIds(vols.filter((v) => v.level > 5).map((v) => String(v.uid)));
          });
          client.on("network-quality", (stats) => {
            const q = stats.uplinkNetworkQuality;
            if (q <= 2) setQuality("excellent");
            else if (q <= 4) setQuality("good");
            else setQuality("poor");
          });
          logEvent("provider_switch", "agora", "تحويل تلقائي لمزود الصوت الاحتياطي");
          await client.join(ag.appId, ag.channel, ag.token, null);
          if (cancelled) {
            void client.leave();
            return;
          }
          providerRef.current = "agora";
          setActiveProvider("agora");
          setStatus("connected");
          beginSession();
          return;
        }
      } catch {
        /* كلا المزودين فشل — نعرض سبب الأساسي */
      }

      if (cancelled) return;
      if (livekitReason) {
        setStatus("error");
        setError(livekitReason);
      } else {
        setStatus("unconfigured");
      }
    })();

    return () => {
      cancelled = true;
      if (autoRetryTimer.current) clearTimeout(autoRetryTimer.current);
      endSession();
      attachedAudio.forEach((el) => el.remove());
      attachedAudio.clear();
      const room = roomRef.current;
      roomRef.current = null;
      if (room) void room.disconnect();
      const ag = agoraRef.current;
      agoraRef.current = null;
      if (ag) {
        try {
          ag.micTrack?.close();
        } catch {
          /* تجاهل */
        }
        void ag.client.leave();
      }
      agoraRemoteAudio.current.clear();
      providerRef.current = null;
      setActiveProvider(null);
      setQuality("unknown");
    };
  }, [roomId, canPublish, attach, retryKey, beginSession, endSession, logEvent]);

  // Refresh publish permission when the user's mic seat changes (LiveKit فقط).
  useEffect(() => {
    const room = roomRef.current;
    if (!room || status !== "connected" || providerRef.current !== "livekit") return;
    if (!canPublish && micEnabled) {
      void room.localParticipant.setMicrophoneEnabled(false);
      setMicEnabled(false);
    }
  }, [canPublish, micEnabled, status]);

  const toggleMic = useCallback(async () => {
    if (!canPublish) throw new Error("اصعد على المايك أولًا");
    const next = !micEnabled;
    try {
      if (providerRef.current === "agora" && agoraRef.current) {
        const { client } = agoraRef.current;
        if (next) {
          const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
          // وضع توفير البيانات: جودة صوت أقل للإنترنت الضعيف
          const track = await AgoraRTC.createMicrophoneAudioTrack(
            dataSaverRef.current
              ? { encoderConfig: "speech_low_quality" }
              : { encoderConfig: "music_standard" },
          );
          await client.publish(track);
          agoraRef.current.micTrack = track;
        } else if (agoraRef.current.micTrack) {
          await client.unpublish(agoraRef.current.micTrack);
          agoraRef.current.micTrack.close();
          agoraRef.current.micTrack = null;
        }
        setMicEnabled(next);
        return;
      }

      const room = roomRef.current;
      if (!room) return;
      if (next) {
        const token = await getVoiceToken({ data: { roomId: roomId!, canPublish: true } });
        if (token.reason) throw new Error(token.reason);
        if (token.configured && token.token) {
          // refresh grants so publishing is allowed after taking a seat
          try {
            await room.disconnect();
            await room.connect(token.url!, token.token, { autoSubscribe: true });
          } catch {
            // الخادم الأساسي فصل — نجرّب المفاتيح الاحتياطية
            if (token.backupToken && token.backupUrl) {
              try {
                await room.connect(token.backupUrl, token.backupToken, { autoSubscribe: true });
              } catch {
                /* keep existing connection */
              }
            }
          }
        }
      }
      // وضع توفير البيانات: نشر المايك بجودة أقل للإنترنت الضعيف
      if (next && dataSaverRef.current) {
        const lk = await import("livekit-client");
        await room.localParticipant.setMicrophoneEnabled(true, undefined, {
          audioPreset: lk.AudioPresets.speech,
        });
      } else {
        await room.localParticipant.setMicrophoneEnabled(next);
      }
      setMicEnabled(next);
    } catch (e) {
      if (e instanceof Error && ARABIC_RE.test(e.message)) throw e;
      throw new Error(friendlyVoiceError(e));
    }
  }, [canPublish, micEnabled, roomId]);

  const toggleSpeaker = useCallback(() => {
    const next = !speakerEnabled;
    audioElements.current.forEach((el) => {
      el.muted = !next;
    });
    agoraRemoteAudio.current.forEach((track) => {
      track.setVolume(next ? 100 : 0);
    });
    setSpeakerEnabled(next);
  }, [speakerEnabled]);

  /** تشغيل أغنية من ملفات الهاتف وبثّها لكل الحاضرين في الغرفة. */
  const playMusic = useCallback(
    async (file: File) => {
      if (status !== "connected") throw new Error("الصوت غير متصل");
      if (!canPublish) throw new Error("اصعد على المايك أولًا");

      stopMusicRef.current?.();

      const el = new Audio(URL.createObjectURL(file));
      el.loop = false;
      el.crossOrigin = "anonymous";
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(el);
      const dest = ctx.createMediaStreamDestination();
      source.connect(dest);
      source.connect(ctx.destination); // ليسمعها المشغّل أيضًا
      await el.play();

      const mediaTrack = dest.stream.getAudioTracks()[0];
      if (!mediaTrack) throw new Error("تعذر قراءة الملف الصوتي");

      let unpublish: () => Promise<void> = async () => {};
      if (providerRef.current === "agora" && agoraRef.current) {
        const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
        const track = AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: mediaTrack });
        const client = agoraRef.current.client;
        await client.publish(track);
        unpublish = async () => {
          await client.unpublish(track);
          track.close();
        };
      } else {
        const room = roomRef.current;
        if (!room) throw new Error("الصوت غير متصل");
        const lk = await import("livekit-client");
        const track = new lk.LocalAudioTrack(mediaTrack);
        const publication = await room.localParticipant.publishTrack(
          // livekit types + exactOptionalPropertyTypes لا يتوافقان مع LocalAudioTrack مباشرة
          track as unknown as MediaStreamTrack,
          { name: "room-music" },
        );
        unpublish = async () => {
          if (publication?.track) await room.localParticipant.unpublishTrack(publication.track);
        };
      }

      musicElRef.current = el;
      setMusicName(file.name.replace(/\.[^.]+$/, ""));
      setMusicPlaying(true);

      stopMusicRef.current = () => {
        try {
          el.pause();
          URL.revokeObjectURL(el.src);
          void unpublish();
          void ctx.close();
        } catch {
          /* تجاهل */
        }
        musicElRef.current = null;
        stopMusicRef.current = null;
        setMusicPlaying(false);
        setMusicName(null);
      };
      el.onended = () => stopMusicRef.current?.();
    },
    [canPublish, status],
  );

  const stopMusic = useCallback(() => stopMusicRef.current?.(), []);

  useEffect(
    () => () => {
      stopMusicRef.current?.();
    },
    [],
  );

  return {
    status,
    error,
    micEnabled,
    speakerEnabled,
    speakingIds,
    quality,
    activeProvider,
    dataSaver,
    setDataSaver,
    toggleMic,
    toggleSpeaker,
    retry,
    playMusic,
    stopMusic,
    musicPlaying,
    musicName,
    musicEl: musicElRef,
  };
}
