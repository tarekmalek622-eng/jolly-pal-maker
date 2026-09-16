import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Crown, Lock, Mic, Users } from "lucide-react";
import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

export type RoomRow = {
  id: string;
  room_code: string;
  name: string;
  description: string | null;
  image_url: string | null;
  category: string;
  room_type: "public" | "private";
  member_count: number;
  popularity: number;
  created_at: string;
  owner_id: string;
  mic_count: number;
};

/** إطار الغرفة: يتحدد تلقائيًا حسب نشاط الغرفة، ويمكن تجاوزه بإطار مملوك من المتجر. */
export type RoomFrameTier = "normal" | "vip" | "rare" | "featured" | "animated" | "legendary";

export function roomFrameTier(room: RoomRow, override?: RoomFrameTier | null): RoomFrameTier {
  if (override) return override;
  if (room.member_count >= 50) return "legendary";
  if (room.member_count >= 25) return "animated";
  if (room.member_count >= 12) return "featured";
  if (room.member_count >= 5) return "rare";
  if (room.popularity >= 100) return "vip";
  return "normal";
}

const FRAME_CLASS: Record<RoomFrameTier, string> = {
  normal: "room-frame-normal",
  vip: "room-frame-vip",
  rare: "room-frame-rare",
  featured: "room-frame-featured",
  animated: "room-frame-animated",
  legendary: "room-frame-legendary",
};

const FRAME_LABEL: Record<RoomFrameTier, string> = {
  normal: "عادي",
  vip: "VIP",
  rare: "نادر",
  featured: "مميز",
  animated: "متحرك",
  legendary: "أسطوري",
};

export function RoomCard({
  room,
  ownerName,
  frame,
}: {
  room: RoomRow;
  ownerName?: string | null;
  frame?: RoomFrameTier | null;
}) {
  const [img, setImg] = useState<string | null>(null);
  const tier = roomFrameTier(room, frame);
  const live = room.member_count > 0;

  useEffect(() => {
    let active = true;
    void resolveMediaUrl(room.image_url).then((u) => active && setImg(u));
    return () => {
      active = false;
    };
  }, [room.image_url]);

  return (
    <Link to="/rooms/$roomId" params={{ roomId: room.id }} className="block">
      <div className={cn("room-frame", FRAME_CLASS[tier])}>
        <div className="room-frame-inner">
          <div className="relative h-36 w-full gradient-hero">
            {img && <img src={img} alt={room.name} className="h-full w-full object-cover" loading="lazy" />}
            <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/25 to-transparent" />

            <span className="absolute top-2 start-2 rounded-full bg-background/75 px-2 py-0.5 text-[10px] font-bold backdrop-blur">
              {FRAME_LABEL[tier]}
            </span>
            {room.room_type === "private" && (
              <span className="absolute top-2 end-2 rounded-full bg-background/75 p-1.5 backdrop-blur">
                <Lock className="h-3 w-3 text-primary" />
              </span>
            )}

            <div className="absolute bottom-2 start-3 end-3">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    live ? "animate-pulse bg-success" : "bg-muted-foreground/60",
                  )}
                />
                <p className="truncate text-base font-black">{room.name}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2 p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="font-bold text-foreground/80">ID: {room.room_code}</span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" /> {room.member_count}
              </span>
              <span className="flex items-center gap-1">
                <Mic className="h-3 w-3" /> {room.mic_count}
              </span>
              <span className={live ? "text-success" : ""}>{live ? "نشطة" : "هادئة"}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Crown className="h-3 w-3 text-primary" />
              <span className="truncate">صاحب الغرفة: {ownerName || "—"}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
