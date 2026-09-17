ALTER TABLE public.badge_definitions
  DROP CONSTRAINT IF EXISTS badge_definitions_kind_check;

ALTER TABLE public.badge_definitions
  ADD CONSTRAINT badge_definitions_kind_check
  CHECK (kind IN ('gift', 'administrative'));

ALTER TABLE public.badge_definitions
  ADD COLUMN style_key TEXT NOT NULL DEFAULT 'gold';

INSERT INTO public.badge_definitions (key, name, description, kind, threshold, sort_order, style_key)
VALUES
  ('admin_assistant_01', 'مساعد الإدارة العام', 'شارة إدارية موثقة', 'administrative', 1, 101, 'royal'),
  ('admin_assistant_02', 'مساعد سوبر أدمن', 'شارة إدارية موثقة', 'administrative', 1, 102, 'crimson'),
  ('admin_assistant_03', 'مساعد مدير التطبيق', 'شارة إدارية موثقة', 'administrative', 1, 103, 'sapphire'),
  ('admin_assistant_04', 'مساعد إدارة الغرف', 'شارة إدارية موثقة', 'administrative', 1, 104, 'emerald'),
  ('admin_assistant_05', 'مساعد مراقبة الغرف', 'شارة إدارية موثقة', 'administrative', 1, 105, 'violet'),
  ('admin_assistant_06', 'مساعد حماية المجتمع', 'شارة إدارية موثقة', 'administrative', 1, 106, 'ruby'),
  ('admin_assistant_07', 'مساعد شؤون المستخدمين', 'شارة إدارية موثقة', 'administrative', 1, 107, 'azure'),
  ('admin_assistant_08', 'مساعد خدمة الأعضاء', 'شارة إدارية موثقة', 'administrative', 1, 108, 'amber'),
  ('admin_assistant_09', 'مساعد الدعم الفني', 'شارة إدارية موثقة', 'administrative', 1, 109, 'cyan'),
  ('admin_assistant_10', 'مساعد مراجعة البلاغات', 'شارة إدارية موثقة', 'administrative', 1, 110, 'rose'),
  ('admin_assistant_11', 'مساعد تنظيم الفعاليات', 'شارة إدارية موثقة', 'administrative', 1, 111, 'sunset'),
  ('admin_assistant_12', 'مساعد إدارة المسابقات', 'شارة إدارية موثقة', 'administrative', 1, 112, 'lime'),
  ('admin_assistant_13', 'مساعد إدارة الألعاب', 'شارة إدارية موثقة', 'administrative', 1, 113, 'indigo'),
  ('admin_assistant_14', 'مساعد إدارة الهدايا', 'شارة إدارية موثقة', 'administrative', 1, 114, 'pink'),
  ('admin_assistant_15', 'مساعد إدارة المتجر', 'شارة إدارية موثقة', 'administrative', 1, 115, 'bronze'),
  ('admin_assistant_16', 'مساعد إدارة VIP', 'شارة إدارية موثقة', 'administrative', 1, 116, 'platinum'),
  ('admin_assistant_17', 'مساعد إدارة CVIP', 'شارة إدارية موثقة', 'administrative', 1, 117, 'diamond'),
  ('admin_assistant_18', 'مساعد إدارة المحتوى', 'شارة إدارية موثقة', 'administrative', 1, 118, 'teal'),
  ('admin_assistant_19', 'مساعد العلاقات العامة', 'شارة إدارية موثقة', 'administrative', 1, 119, 'coral'),
  ('admin_assistant_20', 'مساعد التواصل', 'شارة إدارية موثقة', 'administrative', 1, 120, 'sky'),
  ('admin_assistant_21', 'مساعد الترحيب', 'شارة إدارية موثقة', 'administrative', 1, 121, 'honey'),
  ('admin_assistant_22', 'مساعد التدريب', 'شارة إدارية موثقة', 'administrative', 1, 122, 'mint'),
  ('admin_assistant_23', 'مساعد الجودة', 'شارة إدارية موثقة', 'administrative', 1, 123, 'pearl'),
  ('admin_assistant_24', 'مساعد الأمان', 'شارة إدارية موثقة', 'administrative', 1, 124, 'steel'),
  ('admin_assistant_25', 'مساعد الفعاليات الصوتية', 'شارة إدارية موثقة', 'administrative', 1, 125, 'magenta'),
  ('admin_assistant_26', 'مساعد كبار المضيفين', 'شارة إدارية موثقة', 'administrative', 1, 126, 'flame'),
  ('admin_assistant_27', 'مساعد مشرفي الدردشة', 'شارة إدارية موثقة', 'administrative', 1, 127, 'ocean'),
  ('admin_assistant_28', 'مساعد متابعة الحسابات', 'شارة إدارية موثقة', 'administrative', 1, 128, 'jade'),
  ('admin_assistant_29', 'مساعد العمليات', 'شارة إدارية موثقة', 'administrative', 1, 129, 'obsidian'),
  ('admin_assistant_30', 'مساعد الإدارة الملكي', 'شارة إدارية موثقة', 'administrative', 1, 130, 'imperial')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  kind = EXCLUDED.kind,
  sort_order = EXCLUDED.sort_order,
  style_key = EXCLUDED.style_key,
  is_active = true;