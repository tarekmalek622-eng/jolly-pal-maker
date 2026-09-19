ALTER TABLE public.cup_events
  ADD COLUMN IF NOT EXISTS rules text,
  ADD COLUMN IF NOT EXISTS points_note text;

UPDATE public.cup_events SET image_url = 'throne' WHERE image_url IS NULL OR image_url NOT LIKE 'http%';
UPDATE public.cup_events SET
  rules = COALESCE(rules, 'المشاركة متاحة لكل الحسابات غير الموقوفة. يُحتسب الدعم من الهدايا المؤكدة فقط. أي تلاعب أو تحويل وهمي يُلغي المشاركة ويُسترد الجائزة.'),
  points_note = COALESCE(points_note, 'كل كوين يُرسل أو يُستلم داخل فترة الحدث = نقطة واحدة، ويُحدَّث الترتيب لحظيًا من عمليات قاعدة البيانات.');

-- تصنيفات الهدايا الموحّدة
UPDATE public.gifts SET category = CASE
  WHEN rarity IN ('legendary') OR price >= 1000000000 THEN 'legendary'
  WHEN category IN ('flowers','romantic','love','رومانسي') THEN 'flowers'
  WHEN category IN ('vip','cvip','gold') THEN 'kings'
  WHEN category IN ('diamond') THEN 'diamond'
  WHEN category IN ('cars') THEN 'cars'
  WHEN category IN ('فخم','rare') THEN 'luxury'
  WHEN category IN ('celebration','احتفال','occasions','games','animated','general') THEN 'boxes'
  ELSE 'boxes'
END;

-- خمسة أحداث جديدة
WITH new_events AS (
  INSERT INTO public.cup_events (title, subtitle, description, image_url, ranking_kind, starts_at, ends_at, status, rules, points_note)
  VALUES
    ('سباق الألماس', 'من يجمع أكبر دعم يحصد الألماس', 'سباق دعم مفتوح لكل مستخدمي صوتك لمدة خمسة أيام.', 'diamond-race', 'supporters', now(), now() + interval '5 days', 'active',
      'الدعم المحسوب هو الهدايا المؤكدة خلال أيام الحدث فقط. الحسابات الموقوفة تُستبعد، والهدايا المستردة تُخصم من النقاط.',
      'كل كوين في الهدايا المُرسلة = نقطة. الترتيب يُحدَّث مباشرة من معاملات الهدايا.'),
    ('ليل الملوك', 'ترتيب أفخم مستلمي الهدايا', 'من يستلم أعلى قيمة هدايا يتوّج ملكًا لليل.', 'royal-night', 'receivers', now(), now() + interval '6 days', 'active',
      'تُحسب الهدايا المستلمة من حسابات مختلفة فقط. تبادل الهدايا بين حسابين لرفع الترتيب يُلغي المشاركة.',
      'كل كوين في الهدايا المستلمة = نقطة، ويُحتسب الترتيب من معاملات الهدايا المؤكدة.'),
    ('عاصفة الهدايا', 'أقوى الغرف دعمًا', 'تنافس الغرف على أعلى مجموع دعم داخل الغرفة.', 'gift-storm', 'rooms', now(), now() + interval '4 days', 'active',
      'تُحسب الهدايا المُرسَلة داخل الغرفة فقط. الغرف المعطّلة تُستبعد تلقائيًا من الترتيب.',
      'مجموع قيمة الهدايا داخل الغرفة = نقاط الغرفة، وتُوزّع الجائزة على مالك الغرفة.'),
    ('قمة الشاحنين', 'أعلى عمليات الشحن المعتمدة', 'ترتيب أكبر الشاحنين خلال أسبوع كامل.', 'coin-vault', 'topups', now(), now() + interval '7 days', 'active',
      'تُحتسب طلبات الشحن المعتمدة من الإدارة فقط، والطلبات الملغاة لا تُحتسب.',
      'كل كوين مشحون ومعتمد = نقطة واحدة.'),
    ('أسطورة الغرف', 'أكبر مكاسب الألعاب', 'من يحقق أعلى صافي مكاسب في ألعاب صوتك.', 'room-legend', 'game_wins', now(), now() + interval '5 days', 'active',
      'تُحسب الجولات المكتملة على السيرفر فقط. أي محاولة تلاعب تُلغي النقاط بالكامل.',
      'صافي الربح من الجولات (الجوائز ناقص الرهانات) = النقاط.')
  RETURNING id, image_url
)
INSERT INTO public.cup_event_prizes (event_id, rank_from, rank_to, coins, label)
SELECT e.id, p.rank_from, p.rank_to, p.coins, p.label
FROM new_events e
CROSS JOIN (VALUES
  (1, 1, 10000000000::bigint, 'المركز الأول'),
  (2, 2, 7000000000::bigint, 'المركز الثاني'),
  (3, 3, 5000000000::bigint, 'المركز الثالث'),
  (4, 5, 3000000000::bigint, 'المراكز 4 - 5'),
  (6, 10, 2000000000::bigint, 'المراكز 6 - 10'),
  (11, 20, 1000000000::bigint, 'المراكز 11 - 20'),
  (21, 50, 500000000::bigint, 'المراكز 21 - 50')
) AS p(rank_from, rank_to, coins, label);