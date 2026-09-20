UPDATE public.app_settings
SET value = value || jsonb_build_object(
  'bet_levels', jsonb_build_array(100, 1000, 10000, 100000, 1000000),
  'slots', jsonb_build_array(
    jsonb_build_object('key','arrow','label','سهم الفضة','multiplier',2,'weight',4750),
    jsonb_build_object('key','wing','label','الجناح الأزرق','multiplier',5,'weight',1900),
    jsonb_build_object('key','suv','label','الدفع الرباعي','multiplier',8,'weight',1188),
    jsonb_build_object('key','flags','label','علم السباق','multiplier',18,'weight',528),
    jsonb_build_object('key','crown','label','التاج الذهبي','multiplier',66,'weight',144),
    jsonb_build_object('key','horse','label','الجواد','multiplier',50,'weight',190),
    jsonb_build_object('key','diamond','label','الألماس','multiplier',100,'weight',95),
    jsonb_build_object('key','shield','label','الدرع الملكي','multiplier',88,'weight',108),
    jsonb_build_object('key','lion','label','الأسد','multiplier',30,'weight',317),
    jsonb_build_object('key','bolt','label','البرق','multiplier',20,'weight',475),
    jsonb_build_object('key','none','label','لا فائز','multiplier',0,'weight',305,'bettable',false)
  )
), updated_at = now()
WHERE key = 'supercar';