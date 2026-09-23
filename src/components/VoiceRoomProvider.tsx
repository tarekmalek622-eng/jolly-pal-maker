import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Mic, MicOff, X } from "lucide-react";
import { useVoiceRoom } from "@/hooks/use-voice-room";
import { resolveMediaUrl } from "@/lib/media";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

type ActiveRoom = { id: string; name: string; imageUrl: string | null };

type VoiceRoomContextValue = {
  voice: ReturnType<typeof useVoiceRoom>;
  activeRoom: ActiveRoom | null;
  /** يشغّل الصوت لغرفة معينة (يُستدعى من صفحة الغرفة). */
  enterRoom: (room: ActiveRoom, canPublish: boolean) => void;
  /** يصغّر الغرفة: يبقى الصوت متصلًا ويظهر مربع عائم للعودة. */
  minimizeRoom: () => void;
  /** يخرج من الغرفة ويقطع الصوت. */
  exitRoom: () => void;
  minimized: boolean;
  setMinimized: (v: boolean) => void;
};

const VoiceRoomContext = createContext<VoiceRoomContextValue | null>(null);

export function VoiceRoomProvider({ children }: { children: ReactNode }) {
  const [activeRoom, setActiveRoom] = useState<ActiveRoom | null>(null);
  const [canPublish, setCanPublish] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const voice = useVoiceRoom(activeRoom?.id ?? null, canPublish);

  const enterRoom = useCallback((room: ActiveRoom, publish: boolean) => {
    setActiveRoom((prev) =>
      prev && prev.id === room.id && prev.name === room.name && prev.imageUrl === room.imageUrl
        ? prev
        : room,
    );
    setCanPublish(publish);
    setMinimized(false);
  }, []);

  const minimizeRoom = useCallback(() => setMinimized(true), []);

  const exitRoom = useCallback(() => {
    setMinimized(false);
    setCanPublish(false);
    setActiveRoom(null);
  }, []);

  const value = useMemo(
    () => ({ voice, activeRoom, enterRoom, minimizeRoom, exitRoom, minimized, setMinimized }),
    [voice, activeRoom, enterRoom, minimizeRoom, exitRoom, minimized],
  );

  return (
    <VoiceRoomContext.Provider value={value}>
      {children}
      {activeRoom && minimized && (
        <MiniRoomBubble room={activeRoom} micOn={voice.micEnabled} onClose={exitRoom} />
      )}
    </VoiceRoomContext.Provider>
  );
}

export function useVoiceRoomContext() {
  const ctx = useContext(VoiceRoomContext);
  if (!ctx) throw new Error("useVoiceRoomContext must be used inside VoiceRoomProvider");
  return ctx;
}

function MiniRoomBubble({
  room,
  micOn,
  onClose,
}: {
  room: ActiveRoom;
  micOn: boolean;
  onClose: () => void;
}) {
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void resolveMediaUrl(room.imageUrl).then((u) => active && setImg(u));
    return () => {
      active = false;
    };
  }, [room.imageUrl]);

  return (
    <div className="fixed bottom-24 left-3 z-50">
      <div className="relative">
        <Link
          to="/rooms/$roomId"
          params={{ roomId: room.id }}
          className="block h-16 w-16 overflow-hidden rounded-2xl border-2 border-primary shadow-lg"
          aria-label={`العودة إلى ${room.name}`}
        >
          {img ? (
            <img src={img} alt={room.name} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="flex h-full w-full items-center justify-center gradient-gold text-xs font-bold text-primary-foreground">
              {room.name.slice(0, 6)}
            </span>
          )}
          <span
            className={cn(
              "absolute bottom-0 start-0 flex h-5 w-5 items-center justify-center rounded-tr-lg",
              micOn ? "bg-success" : "bg-surface-2",
            )}
          >
            {micOn ? (
              <Mic className="h-3 w-3 text-background" />
            ) : (
              <MicOff className="h-3 w-3 text-muted-foreground" />
            )}
          </span>
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق الغرفة"
          className="absolute -top-2 -end-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
