CREATE INDEX IF NOT EXISTS idx_wheel_bets_round_created ON public.wheel_bets (round_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wheel_bets_user_created ON public.wheel_bets (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wheel_rounds_status_created ON public.wheel_rounds (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_supercar_bets_user_created ON public.supercar_bets (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_supercar_rounds_status_created ON public.supercar_rounds (status, created_at DESC);