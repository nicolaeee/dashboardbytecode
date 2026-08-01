-- ============================================================================
--  SISTEM AVANSAT DE NOTIFICARI RECUPERARE: countdown de 7 zile de la absenta +
--  cooldown de 48h intre notificari (max 3) - vezi cardul "🚨 Recuperare necesara"
--  din Task-uri Urgente (ProgressTracker.tsx).
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.)
-- ============================================================================

-- Ziua absentei care a declansat alerta curenta - baza pentru countdown-ul de 7 zile.
alter table public.tracker_students add column if not exists absence_date date;

-- Cate notificari s-au trimis deja catre parinte pentru absenta curenta (max 3).
alter table public.tracker_students add column if not exists makeup_notification_count int not null default 0;

-- Cand s-a trimis ultima notificare - baza pentru cooldown-ul de 48h intre trimiteri.
alter table public.tracker_students add column if not exists last_makeup_notification timestamptz;
