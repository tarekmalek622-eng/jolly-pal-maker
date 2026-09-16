import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  RoomEvent,
  Room as LiveKitRoom,
  type RemoteTrack,
  type RemoteTrackPublication,
  Track,
} from "livekit-client";
import { getVoiceToken } from "@/lib/voice.functions";

export type VoiceStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error" | "unconfigured";

export function useVoiceRoom(roomId: string | null, canPublish: boolean) {
  const roomRef = useRef<LiveKitRoom | null>(null);
  const audioElements = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [speakingIds, setSpeakingIds] = useState<string[]>([]);
  const [retryKey, setRetryKey] = useState(0);

  /** Re-run the connection attempt after a failure. */
  const retry = useCallback(() => setRetryKey((k) => k + 1), []);

  const attach = useCallback((track: RemoteTrack, publication: RemoteTrackPublication) => {
    if (track.kind !== Track.Kind.Audio) return;
    const el = track.attach();
    el.autoplay = true;
    audioElements.current.set(publication.trackSid, el as HTMLAudioElement);
    document.body.appendChild(el);
  }, []);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    const room = new LiveKitRoom({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    room
      .on(RoomEvent.TrackSubscribed, attach)
      .on(RoomEvent.TrackUnsubscribed, (track, publication) => {
        track.detach().forEach((el) => el.remove());
        audioElements.current.delete(publication.trackSid);
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setSpeakingIds(speakers.map((s) => s.identity));
      })
      .on(RoomEvent.ConnectionStateChanged, (state) => {
        if (state === ConnectionState.Connected) setStatus("connected");
        else if (state === ConnectionState.Reconnecting) setStatus("reconnecting");
        else if (state === ConnectionState.Disconnected) setStatus("idle");
      });

    void (async () => {
      setStatus("connecting");
      setError(null);
      try {
        const result = await getVoiceToken({ data: { roomId, canPublish } });
        if (cancelled) return;
        if (!result.configured || !result.token || !result.url) {
          setStatus("unconfigured");
          return;
        }
        await room.connect(result.url, result.token, { autoSubscribe: true });
        if (cancelled) return;
        setStatus("connected");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setError(e instanceof Error ? e.message : "تعذر الاتصال بالصوت");
      }
    })();

    return () => {
      cancelled = true;
      audioElements.current.forEach((el) => el.remove());
      audioElements.current.clear();
      void room.disconnect();
      roomRef.current = null;
    };
  }, [roomId, attach, retryKey]);

  // Refresh publish permission when the user's mic seat changes.
  useEffect(() => {
    const room = roomRef.current;
    if (!room || status !== "connected") return;
    if (!canPublish && micEnabled) {
      void room.localParticipant.setMicrophoneEnabled(false);
      setMicEnabled(false);
    }
  }, [canPublish, micEnabled, status]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    if (!canPublish) throw new Error("اصعد على المايك أولًا");
    const next = !micEnabled;
    if (next) {
      const token = await getVoiceToken({ data: { roomId: roomId!, canPublish: true } });
      if (token.configured && token.token) {
        // refresh grants so publishing is allowed after taking a seat
        try {
          await room.disconnect();
          await room.connect(token.url!, token.token, { autoSubscribe: true });
        } catch {
          /* keep existing connection */
        }
      }
    }
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicEnabled(next);
  }, [canPublish, micEnabled, roomId]);

  const toggleSpeaker = useCallback(() => {
    const next = !speakerEnabled;
    audioElements.current.forEach((el) => {
      el.muted = !next;
    });
    setSpeakerEnabled(next);
  }, [speakerEnabled]);

  return { status, error, micEnabled, speakerEnabled, speakingIds, toggleMic, toggleSpeaker, retry };
}
