UPDATE public.app_settings
SET value = jsonb_set(
  value,
  '{slots}',
  '[
    {"key":"tomato","label":"طماطم","emoji":"🍅","multiplier":4,"weight":19},
    {"key":"carrot","label":"جزر","emoji":"🥕","multiplier":4,"weight":19},
    {"key":"corn","label":"ذرة","emoji":"🌽","multiplier":4,"weight":19},
    {"key":"cabbage","label":"كرنب","emoji":"🥬","multiplier":8,"weight":9.5},
    {"key":"chicken","label":"دجاج","emoji":"🍗","multiplier":12,"weight":6.3},
    {"key":"fish","label":"سمك","emoji":"🐟","multiplier":16,"weight":4.7},
    {"key":"meat","label":"لحم","emoji":"🥩","multiplier":24,"weight":3.1},
    {"key":"lobster","label":"استاكوزا","emoji":"🦞","multiplier":36,"weight":2}
  ]'::jsonb
), updated_at = now()
WHERE key = 'wheel';

UPDATE public.app_settings
SET value = value || '{"seven77": true}'::jsonb, updated_at = now()
WHERE key = 'games';