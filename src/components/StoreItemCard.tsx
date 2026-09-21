import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { resolveMediaUrl } from "@/lib/media";
import { Button } from "@/components/ui/button";
import {
  CATEGORY_LABEL,
  RARITY_LABEL,
  storeArt,
  storeGlyph,
} from "@/lib/store-art";

export type StoreItem = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  category: string;
  price: number;
  duration_days: number | null;
  rarity: string;
  required_vip: number;
  art_key?: string | null;
};

export function StoreItemCard({
  item,
  owned,
  busy,
  onBuy,
}: {
  item: StoreItem;
  owned: boolean;
  busy: boolean;
  onBuy: () => void;
}) {
  const [img, setImg] = useState<string | null>(null);
  const art = storeArt(item.art_key ?? null, item.category);

  useEffect(() => {
    let active = true;
    void resolveMediaUrl(item.image_url).then((u) => active && setImg(u));
    return () => {
      active = false;
    };
  }, [item.image_url]);

  return (
    <div className={`surface-card overflow-hidden ring-1 ${art.ring}`}>
      <div
        className={`relative flex h-32 items-center justify-center bg-gradient-to-br ${art.grad} p-1.5`}
      >
        <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_60%)]" />
        {img ? (
          <img
            src={img}
            alt={item.name}
            className={
              item.category === "room_background" || item.category === "profile_background"
                ? "h-full w-full rounded-lg object-cover"
                : "h-full w-full object-contain"
            }
            loading="lazy"
          />
        ) : (
          <div
            className={`relative flex h-20 w-20 items-center justify-center rounded-full bg-black/25 text-3xl ring-2 ${art.ring} ${art.glow}`}
          >
            {storeGlyph(item.category)}
          </div>
        )}
        <span
          className={`absolute top-1.5 start-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold backdrop-blur ${art.chip}`}
        >
          {CATEGORY_LABEL[item.category] ?? item.category}
        </span>
        <span className="absolute top-1.5 end-1.5 rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
          {RARITY_LABEL[item.rarity] ?? item.rarity}
        </span>
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-bold">{item.name}</p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {item.duration_days ? `${item.duration_days} يوم` : "دائم"}
          {item.required_vip > 0 ? ` · VIP ${item.required_vip}+` : ""}
        </p>
        <Button
          onClick={onBuy}
          disabled={owned || busy}
          className="mt-3 h-9 w-full rounded-xl gradient-gold text-xs font-bold text-primary-foreground"
        >
          {owned ? (
            "مملوك"
          ) : (
            <span className="flex items-center gap-1">
              <Coins className="h-3.5 w-3.5" />
              {item.price.toLocaleString("en-US")}
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
