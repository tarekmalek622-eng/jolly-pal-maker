import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock, Users } from "lucide-react";
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

export function RoomCard({ room, compact }: { room: RoomRow; compact?: boolean }) {
  const [img, setImg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void resolveMediaUrl(room.image_url).then((u) => active && setImg(u));
    return () => {
      active = false;
    };
  }, [room.image_url]);

  return (
    <Link
      to="/rooms/$roomId"
      params={{ roomId: room.id }}
      className={cn("surface-card block overflow-hidden", compact ? "p-0" : "flex items-center gap-3 p-3")}
    >
      {compact ? (
        <div>
          <div className="relative h-24 w-full gradient-hero">
            {img && <img src={img} alt={room.name} className="h-full w-full object-cover" loading="lazy" />}
            <span className="absolute bottom-2 end-2 flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-[10px]">
              <Users className="h-3 w-3" /> {room.member_count}
            </span>
            {room.room_type === "private" && (
              <span className="absolute top-2 start-2 rounded-full bg-background/70 p-1">
                <Lock className="h-3 w-3 text-primary" />
              </span>
            )}
          </div>
          <div className="p-3">
            <p className="truncate text-sm font-bold">{room.name}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">#{room.room_code} · {room.category}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl gradient-hero">
            {img && <img src={img} alt={room.name} className="h-full w-full object-cover" loading="lazy" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-bold">{room.name}</p>
              {room.room_type === "private" && <Lock className="h-3 w-3 text-primary" />}
            </div>
            <p className="truncate text-[11px] text-muted-foreground">
              {room.description || `غرفة ${room.category}`}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">#{room.room_code}</p>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1 text-[11px]">
            <Users className="h-3 w-3" /> {room.member_count}
          </span>
        </>
      )}
    </Link>
  );
}
