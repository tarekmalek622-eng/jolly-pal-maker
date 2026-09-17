import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { resolveMediaUrl } from "@/lib/media";
import { Button } from "@/components/ui/button";

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

  useEffect(() => {
    let active = true;
    void resolveMediaUrl(item.image_url).then((u) => active && setImg(u));
    return () => {
      active = false;
    };
  }, [item.image_url]);

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex h-32 items-center justify-center gradient-surface p-1.5">
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
          <span className="text-2xl">🎁</span>
        )}
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
