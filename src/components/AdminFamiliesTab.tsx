import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  adminCreateFamily,
  adminDeleteFamily,
  adminSetFamilyMember,
  adminSetFamilySettings,
  adminUpdateFamily,
} from "@/lib/families.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FamilyCrest } from "@/components/FamilyCrest";
import { UserAvatar } from "@/components/UserAvatar";
import { FAMILY_PERMISSION_LABEL, FAMILY_ROLE_LABEL, familyStyle } from "@/lib/family-art";
import { formatCoins } from "@/lib/format";
import { cn } from "@/lib/utils";

type FamilyRow = {
  id: string;
  family_code: string;
  name: string;
  logo_url: string | null;
  cover_url: string | null;
  animation_url: string | null;
  join_mode: "open" | "request" | "closed";
  permissions: Record<string, boolean>;
  description: string | null;
  leader_id: string | null;
  level: number;
  points: number;
  member_count: number;
  max_members: number;
  is_active: boolean;
  is_suspended: boolean;
};

type FamilyLevel = {
  level: number;
  name: string;
  points: number;
  max_members: number;
  style: string;
};
type FamilySettings = {
  enabled: boolean;
  max_deputies: number;
  default_max_members: number;
  levels: FamilyLevel[];
};

type FamilyPatch = {
  familyId: string;
  name?: string;
  familyCode?: string;
  logoUrl?: string | null;
  coverUrl?: string | null;
  animationUrl?: string | null;
  joinMode?: "open" | "request" | "closed";
  permissions?: Record<string, boolean>;
  description?: string | null;
  leaderId?: string;
  level?: number;
  points?: number;
  maxMembers?: number;
  isActive?: boolean;
  isSuspended?: boolean;
};

async function lookupProfile(publicId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, public_id, display_name, avatar_url, vip_level")
    .eq("public_id", publicId.trim())
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("لا يوجد مستخدم بهذا المعرّف");
  return data;
}

export function AdminFamiliesTab() {
  const families = useQuery({
    queryKey: ["admin-families"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("families")
        .select(
          "id, family_code, name, logo_url, cover_url, animation_url, join_mode, permissions, description, leader_id, level, points, member_count, max_members, is_active, is_suspended",
        )
        .order("points", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as FamilyRow[];
    },
  });

  const settings = useQuery({
    queryKey: ["admin-family-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "families")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.value ?? {
        enabled: true,
        max_deputies: 4,
        default_max_members: 50,
        levels: [],
      }) as unknown as FamilySettings;
    },
  });

  const [draftSettings, setDraftSettings] = useState<FamilySettings | null>(null);
  const cfg = draftSettings ?? settings.data ?? null;

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [logo, setLogo] = useState("");
  const [description, setDescription] = useState("");
  const [leaderPublicId, setLeaderPublicId] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [memberPublicId, setMemberPublicId] = useState("");
  const [memberRole, setMemberRole] = useState<"leader" | "deputy" | "member">("member");

  const create = useMutation({
    mutationFn: async () => {
      const leader = await lookupProfile(leaderPublicId);
      return adminCreateFamily({
        data: {
          name: name.trim(),
          leaderId: leader.id,
          ...(code.trim() ? { familyCode: code.trim() } : {}),
          ...(logo.trim() ? { logoUrl: logo.trim() } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
        },
      });
    },
    onSuccess: () => {
      toast.success("تم إنشاء العائلة");
      setName("");
      setCode("");
      setLogo("");
      setDescription("");
      setLeaderPublicId("");
      void families.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر إنشاء العائلة"),
  });

  const update = useMutation({
    mutationFn: async (input: FamilyPatch) => adminUpdateFamily({ data: input }),
    onSuccess: () => {
      toast.success("تم التحديث");
      void families.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر التحديث"),
  });

  const remove = useMutation({
    mutationFn: async (familyId: string) => adminDeleteFamily({ data: { familyId } }),
    onSuccess: () => {
      toast.success("تم حذف العائلة");
      setSelected(null);
      void families.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر الحذف"),
  });

  const setMember = useMutation({
    mutationFn: async (input: {
      familyId: string;
      publicId?: string;
      userId?: string;
      role?: "leader" | "deputy" | "member";
      remove?: boolean;
    }) => {
      const userId = input.userId ?? (await lookupProfile(input.publicId ?? "")).id;
      return adminSetFamilyMember({
        data: {
          familyId: input.familyId,
          userId,
          ...(input.role ? { role: input.role } : {}),
          ...(input.remove ? { remove: true } : {}),
        },
      });
    },
    onSuccess: () => {
      toast.success("تم تحديث العضوية");
      setMemberPublicId("");
      void families.refetch();
      void membersQuery.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر تحديث العضوية"),
  });

  const membersQuery = useQuery({
    queryKey: ["admin-family-members", selected],
    enabled: Boolean(selected),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("family_members")
        .select("user_id, role, points, profiles(display_name, avatar_url, public_id, vip_level)")
        .eq("family_id", selected ?? "")
        .order("points", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as {
        user_id: string;
        role: string;
        points: number;
        profiles: {
          display_name: string;
          avatar_url: string | null;
          public_id: string;
          vip_level: number;
        } | null;
      }[];
    },
  });

  const saveSettings = useMutation({
    mutationFn: async () => {
      if (!cfg) return;
      await adminSetFamilySettings({ data: cfg });
    },
    onSuccess: () => {
      toast.success("تم حفظ إعدادات العائلات");
      setDraftSettings(null);
      void settings.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر الحفظ"),
  });

  const selectedFamily = families.data?.find((f) => f.id === selected) ?? null;

  return (
    <div className="space-y-3">
      <div className="surface-card space-y-2 p-3">
        <p className="text-sm font-bold">إنشاء عائلة جديدة</p>
        <p className="text-[10px] text-muted-foreground">
          الإنشاء من الإدارة فقط — المستخدم لا يستطيع إنشاء عائلة.
        </p>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="اسم العائلة"
          className="h-9 rounded-xl text-xs"
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ID العائلة (اختياري)"
            className="h-9 rounded-xl text-xs"
          />
          <Input
            value={leaderPublicId}
            onChange={(e) => setLeaderPublicId(e.target.value)}
            placeholder="ID قائد العائلة"
            className="h-9 rounded-xl text-xs"
          />
        </div>
        <Input
          value={logo}
          onChange={(e) => setLogo(e.target.value)}
          placeholder="رابط شعار العائلة"
          className="h-9 rounded-xl text-xs"
        />
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="وصف العائلة"
          className="h-9 rounded-xl text-xs"
        />
        <Button
          disabled={create.isPending || !name.trim() || !leaderPublicId.trim()}
          onClick={() => create.mutate()}
          className="h-11 w-full rounded-2xl gradient-gold text-xs font-bold text-primary-foreground"
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "إنشاء العائلة"}
        </Button>
      </div>

      <div className="space-y-2">
        {families.isLoading && (
          <div className="surface-card p-4 text-xs text-muted-foreground">جارٍ التحميل…</div>
        )}
        {(families.data ?? []).map((f) => {
          const style = familyStyle(cfg?.levels.find((l) => l.level === f.level)?.style);
          const active = selected === f.id;
          return (
            <div
              key={f.id}
              className={cn(
                "surface-card space-y-2 bg-gradient-to-br p-3",
                style.card,
                active && style.glow,
              )}
            >
              <button
                type="button"
                onClick={() => setSelected(active ? null : f.id)}
                className="flex w-full items-center gap-3 text-start"
              >
                <FamilyCrest
                  name={f.name}
                  logoUrl={f.logo_url}
                  styleKey={style.key}
                  level={f.level}
                  size={44}
                  className={style.ring}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black">{f.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    ID {f.family_code} · مستوى {f.level} · {f.member_count}/{f.max_members} عضو ·{" "}
                    {formatCoins(f.points)}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-bold",
                    style.badge,
                  )}
                >
                  {f.is_suspended ? "موقوفة" : f.is_active ? "مفعّلة" : "مخفية"}
                </span>
              </button>

              {active && (
                <div className="space-y-2 border-t border-border/60 pt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="h-9 rounded-xl text-[11px]"
                      onClick={() =>
                        update.mutate({ familyId: f.id, isSuspended: !f.is_suspended })
                      }
                    >
                      {f.is_suspended ? "إلغاء الإيقاف" : "إيقاف العائلة"}
                    </Button>
                    <Button
                      variant="outline"
                      className="h-9 rounded-xl text-[11px]"
                      onClick={() => update.mutate({ familyId: f.id, isActive: !f.is_active })}
                    >
                      {f.is_active ? "إخفاء" : "إظهار"}
                    </Button>
                  </div>
                  <FamilyEditor
                    family={f}
                    onSave={(patch) => update.mutate({ ...patch, familyId: f.id })}
                    pending={update.isPending}
                  />

                  <div className="space-y-2 rounded-2xl border border-border/60 p-2">
                    <p className="text-[11px] font-bold">الأعضاء</p>
                    <div className="flex gap-2">
                      <Input
                        value={memberPublicId}
                        onChange={(e) => setMemberPublicId(e.target.value)}
                        placeholder="ID المستخدم"
                        className="h-9 rounded-xl text-xs"
                      />
                      <select
                        value={memberRole}
                        onChange={(e) => setMemberRole(e.target.value as typeof memberRole)}
                        className="h-9 rounded-xl border border-border bg-surface px-2 text-xs"
                      >
                        <option value="member">عضو</option>
                        <option value="deputy">نائب</option>
                        <option value="leader">قائد</option>
                      </select>
                      <Button
                        disabled={setMember.isPending || !memberPublicId.trim()}
                        onClick={() =>
                          setMember.mutate({
                            familyId: f.id,
                            publicId: memberPublicId,
                            role: memberRole,
                          })
                        }
                        className="h-9 shrink-0 rounded-xl text-[11px]"
                      >
                        إضافة
                      </Button>
                    </div>
                    {(membersQuery.data ?? []).map((m) => (
                      <div
                        key={m.user_id}
                        className="flex items-center gap-2 rounded-xl border border-border/50 p-2"
                      >
                        <UserAvatar
                          src={m.profiles?.avatar_url}
                          name={m.profiles?.display_name}
                          size={32}
                          vipLevel={m.profiles?.vip_level ?? 0}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-bold">
                            {m.profiles?.display_name ?? "مستخدم"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {FAMILY_ROLE_LABEL[m.role] ?? m.role} · {formatCoins(m.points)}
                          </p>
                        </div>
                        <select
                          value={m.role}
                          onChange={(e) =>
                            setMember.mutate({
                              familyId: f.id,
                              userId: m.user_id,
                              role: e.target.value as typeof memberRole,
                            })
                          }
                          className="h-8 rounded-lg border border-border bg-surface px-1 text-[10px]"
                        >
                          <option value="member">عضو</option>
                          <option value="deputy">نائب</option>
                          <option value="leader">قائد</option>
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            setMember.mutate({ familyId: f.id, userId: m.user_id, remove: true })
                          }
                          className="rounded-lg border border-destructive/40 p-1.5 text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {membersQuery.data?.length === 0 && (
                      <p className="text-[10px] text-muted-foreground">لا يوجد أعضاء بعد.</p>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    className="h-9 w-full rounded-xl border-destructive/40 text-[11px] text-destructive"
                    onClick={() => remove.mutate(f.id)}
                  >
                    حذف العائلة نهائيًا
                  </Button>
                </div>
              )}
            </div>
          );
        })}
        {families.data?.length === 0 && (
          <div className="surface-card p-4 text-xs text-muted-foreground">لا توجد عائلات بعد.</div>
        )}
      </div>

      {cfg && (
        <div className="surface-card space-y-3 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">إعدادات نظام العائلات</p>
            <button
              type="button"
              onClick={() => setDraftSettings({ ...cfg, enabled: !cfg.enabled })}
              className="rounded-full border border-border px-3 py-1 text-[11px] font-bold"
            >
              {cfg.enabled ? "مفعّل" : "موقوف"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] text-muted-foreground">أقصى عدد نواب</span>
              <Input
                type="number"
                value={cfg.max_deputies}
                onChange={(e) =>
                  setDraftSettings({ ...cfg, max_deputies: Number(e.target.value) || 0 })
                }
                className="h-9 rounded-xl text-xs"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-muted-foreground">أعضاء العائلة الافتراضي</span>
              <Input
                type="number"
                value={cfg.default_max_members}
                onChange={(e) =>
                  setDraftSettings({ ...cfg, default_max_members: Number(e.target.value) || 5 })
                }
                className="h-9 rounded-xl text-xs"
              />
            </label>
          </div>
          {cfg.levels.map((l, i) => (
            <div
              key={l.level}
              className="grid grid-cols-4 gap-2 rounded-2xl border border-border/60 p-2"
            >
              <label className="space-y-1">
                <span className="text-[10px] text-muted-foreground">مستوى</span>
                <Input value={l.level} readOnly className="h-9 rounded-xl text-xs" />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-muted-foreground">الاسم</span>
                <Input
                  value={l.name}
                  onChange={(e) => {
                    const levels = [...cfg.levels];
                    levels[i] = { ...l, name: e.target.value };
                    setDraftSettings({ ...cfg, levels });
                  }}
                  className="h-9 rounded-xl text-xs"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-muted-foreground">النقاط</span>
                <Input
                  type="number"
                  value={l.points}
                  onChange={(e) => {
                    const levels = [...cfg.levels];
                    levels[i] = { ...l, points: Number(e.target.value) || 0 };
                    setDraftSettings({ ...cfg, levels });
                  }}
                  className="h-9 rounded-xl text-xs"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-muted-foreground">أقصى أعضاء</span>
                <Input
                  type="number"
                  value={l.max_members}
                  onChange={(e) => {
                    const levels = [...cfg.levels];
                    levels[i] = { ...l, max_members: Number(e.target.value) || 5 };
                    setDraftSettings({ ...cfg, levels });
                  }}
                  className="h-9 rounded-xl text-xs"
                />
              </label>
            </div>
          ))}
          <Button
            disabled={saveSettings.isPending}
            onClick={() => saveSettings.mutate()}
            className="h-11 w-full rounded-2xl gradient-gold text-xs font-bold text-primary-foreground"
          >
            حفظ إعدادات العائلات
          </Button>
        </div>
      )}

      {selectedFamily && (
        <p className="text-[10px] text-muted-foreground">العائلة المحددة: {selectedFamily.name}</p>
      )}
    </div>
  );
}

function FamilyEditor({
  family,
  onSave,
  pending,
}: {
  family: FamilyRow;
  onSave: (patch: Omit<FamilyPatch, "familyId">) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(family.name);
  const [code, setCode] = useState(family.family_code);
  const [logo, setLogo] = useState(family.logo_url ?? "");
  const [cover, setCover] = useState(family.cover_url ?? "");
  const [animation, setAnimation] = useState(family.animation_url ?? "");
  const [joinMode, setJoinMode] = useState(family.join_mode);
  const [permissions, setPermissions] = useState<Record<string, boolean>>(family.permissions ?? {});
  const [description, setDescription] = useState(family.description ?? "");
  const [maxMembers, setMaxMembers] = useState(family.max_members);

  return (
    <div className="space-y-2 rounded-2xl border border-border/60 p-2">
      <p className="text-[11px] font-bold">تعديل بيانات العائلة</p>
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="الاسم"
          className="h-9 rounded-xl text-xs"
        />
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ID"
          className="h-9 rounded-xl text-xs"
        />
      </div>
      <Input
        value={logo}
        onChange={(e) => setLogo(e.target.value)}
        placeholder="رابط الشعار"
        className="h-9 rounded-xl text-xs"
      />
      <Input
        value={cover}
        onChange={(e) => setCover(e.target.value)}
        placeholder="رابط صورة الغلاف"
        className="h-9 rounded-xl text-xs"
      />
      <Input
        value={animation}
        onChange={(e) => setAnimation(e.target.value)}
        placeholder="رابط GIF أو الحركة"
        className="h-9 rounded-xl text-xs"
      />
      <Input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="الوصف"
        className="h-9 rounded-xl text-xs"
      />
      <label className="block space-y-1">
        <span className="text-[10px] text-muted-foreground">طريقة الانضمام</span>
        <select
          value={joinMode}
          onChange={(e) => setJoinMode(e.target.value as typeof joinMode)}
          className="h-9 w-full rounded-xl border border-border bg-surface px-2 text-xs"
        >
          <option value="open">مفتوح مباشر</option>
          <option value="request">بطلب موافقة</option>
          <option value="closed">مغلق</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/60 p-2">
        {Object.entries(FAMILY_PERMISSION_LABEL).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-[10px]">
            <input
              type="checkbox"
              checked={permissions[key] ?? false}
              onChange={(e) => setPermissions({ ...permissions, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>
      <label className="block space-y-1">
        <span className="text-[10px] text-muted-foreground">أقصى عدد أعضاء</span>
        <Input
          type="number"
          value={maxMembers}
          onChange={(e) => setMaxMembers(Number(e.target.value) || 5)}
          className="h-9 rounded-xl text-xs"
        />
      </label>
      <Button
        disabled={pending}
        variant="outline"
        className="h-9 w-full rounded-xl text-[11px]"
        onClick={() =>
          onSave({
            name: name.trim(),
            familyCode: code.trim(),
            logoUrl: logo.trim() || null,
            coverUrl: cover.trim() || null,
            animationUrl: animation.trim() || null,
            joinMode,
            permissions,
            description: description.trim() || null,
            maxMembers,
          })
        }
      >
        حفظ التعديلات
      </Button>
    </div>
  );
}
