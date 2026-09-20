UPDATE public.app_settings
SET value = value || jsonb_build_object('levels', jsonb_build_array(
  jsonb_build_object('level',1,'name','بذرة الود','points',0,'style','spark'),
  jsonb_build_object('level',2,'name','صداقة دافئة','points',1000000,'style','sky'),
  jsonb_build_object('level',3,'name','رابط متين','points',10000000,'style','emerald'),
  jsonb_build_object('level',4,'name','ثقة عالية','points',100000000,'style','violet'),
  jsonb_build_object('level',5,'name','قلبان متحدان','points',1000000000,'style','rose'),
  jsonb_build_object('level',6,'name','رابط أسطوري','points',10000000000,'style','crimson'),
  jsonb_build_object('level',7,'name','تاج الأرواح','points',100000000000,'style','royal')
))
WHERE key = 'relationships' AND NOT (value ? 'levels');