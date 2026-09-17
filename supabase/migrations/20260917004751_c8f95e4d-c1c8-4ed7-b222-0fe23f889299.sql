INSERT INTO public.badge_definitions (key, name, description, kind, threshold, sort_order, is_active, style_key, permissions)
VALUES (
  'room_operations_assistant',
  'مساعد مسؤول الغرف',
  'مساعد موثّق يستطيع سحب المشاركين وتغيير خلفية الغرفة وإغلاق جولة العجلة.',
  'administrative',
  1,
  109,
  true,
  'imperial',
  ARRAY['room_view','participant_remove','room_background','wheel_close']::TEXT[]
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  permissions = EXCLUDED.permissions,
  style_key = EXCLUDED.style_key,
  is_active = true;