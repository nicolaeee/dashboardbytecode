-- ============================================================================
--  TASK-URI URGENTE (ADMIN)
--  Sectiune noua in dashboard-ul administratorului. Fluxul complet al diplomei:
--  Profesor -> Genereaza diploma (Diplome.tsx, elev real din grupa) -> confirma daca a
--  castigat un premiu -> "Finalizeaza generarea diplomei" -> task-ul DIPLOMA_GENERATED
--  ajunge automat la admin, cu diploma, recompensa si un mesaj gata generat pentru parinte.
--  Modul "Manual" din Diplome.tsx (fara elev real in baza de date) ramane neschimbat - nu
--  exista student_id de care sa legam un task.
--
--  Al doilea tip de task, DIPLOMA_NOT_SENT, ramane exact sistemul deja existent de alerta la
--  16 prezente (pending_diploma_milestone, pending_diploma_milestone_at,
--  diploma_overdue_alert_sent_at, touch_pending_diploma_milestone, send_overdue_diploma_alerts)
--  - extins doar cu o inregistrare vizibila adminului, fara sa ii schimbe comportamentul de azi.
--
--  Izolat de restul schemei - nu modifica nicio coloana/politica existenta pe
--  tracker_students/tracker_groups.
--
--  NOTA: coloanele de snapshot ale diplomei (diploma_student_name etc.) si al 6-lea parametru
--  al RPC-ului (p_diploma_date) sunt adaugate separat, in add_diploma_snapshot_to_urgent_tasks.sql
--  (ruleaza acest fisier PRIMUL, apoi pe acela).
-- ============================================================================

create table public.urgent_tasks (
  id                   uuid primary key default gen_random_uuid(),
  type                 text not null check (type in ('DIPLOMA_GENERATED', 'DIPLOMA_NOT_SENT')),
  status               text not null default 'NEW' check (status in ('NEW', 'IN_PROGRESS', 'COMPLETED')),
  student_id           uuid not null references public.tracker_students(id) on delete cascade,
  -- Nu duplicam nume/clasa/curs aici (se citesc live prin join la tracker_students /
  -- tracker_groups / profiles, la care adminul are deja acces RLS complet) - doar
  -- identificatori si campurile care NU exista deja in alta parte (recompensa, mesajul
  -- generat pentru parinte).
  teacher_id           uuid references public.profiles(id) on delete set null,
  milestone            int not null,  -- multiplu de 16 (module 1-4 -> 16/32/48/64)
  -- Recompensa aleasa de profesor la "Finalizeaza generarea diplomei" (doar DIPLOMA_GENERATED) -
  -- concept nou, separat de REWARD_TYPES (iconita decorativa per grupa din ProgressTracker.tsx).
  -- "Robot" NU e o optiune - doar bani virtuali / superputere, cu detalii libere introduse de
  -- profesor (nu presupunem noi continutul).
  reward_received      boolean not null default false,
  reward_type          text check (reward_type is null or reward_type in ('virtual_money', 'super_power')),
  reward_details       text,
  check (
    (reward_received = false and reward_type is null and reward_details is null)
    or (reward_received = true and reward_type is not null and reward_details is not null)
  ),
  -- Mesajul pentru parinte, generat automat la creare (vezi random_diploma_parent_message
  -- mai jos) - NU contine recompensa. Salvat ca text (nu doar recalculat la citire) ca sa
  -- ramana identic cu ce a fost efectiv copiat/trimis, chiar daca elevul/grupa se schimba ulterior.
  parent_message       text,
  milestone_reached_at timestamptz not null,
  completed_at         timestamptz,
  completed_by         uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  -- Un singur task per (elev, prag, tip) - previne duplicatele la reincercari/dublu-click
  -- pe "Finalizeaza generarea diplomei" sau la rularea zilnica repetata a
  -- send_overdue_diploma_alerts.
  unique (student_id, milestone, type)
);

create index on public.urgent_tasks (status);
create index on public.urgent_tasks (student_id);
create index on public.urgent_tasks (teacher_id);

alter table public.urgent_tasks enable row level security;

-- Doar adminul vede/gestioneaza task-urile urgente (profesorul isi vede propriul echivalent
-- in "🚨 Task-uri Urgente" din Progress Tracker, pe baza pending_diploma_milestone). Randurile
-- se creeaza EXCLUSIV din functiile security definer de mai jos, nu direct din client, deci
-- nu exista nicio politica de insert pentru profesor.
create policy "adminul gestioneaza task-urile urgente" on public.urgent_tasks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Mesaj de felicitare pentru parinte, cald si personal (nu tehnic/sec) - 8 variante alese
-- aleator, ca acelasi text sa nu ajunga de fiecare data la fiecare parinte. NU mentioneaza
-- recompensa (aceea ramane vizibila DOAR adminului, in urgent_tasks) si NU inventeaza
-- informatii despre copil - foloseste doar prenumele si cursul, ambele reale din DB.
create or replace function public.random_diploma_parent_message(p_first_name text, p_course_label text)
returns text language sql volatile as $$
  select (array[
    format('🎉 Felicitări, %1$s! Suntem tare mândri de el pentru această reușită! A finalizat cu succes o nouă etapă din aventura lui la %2$s și ne bucurăm enorm să îl vedem cum evoluează, învață și prinde tot mai multă încredere. 🌟

Este o bucurie să îl avem alături de noi și abia așteptăm să vedem ce lucruri minunate va descoperi în continuare! 🚀', p_first_name, p_course_label),
    format('🌟 Vești minunate despre %1$s! A dus la capăt cu brio o nouă etapă din călătoria lui la %2$s. Suntem atât de mândri de progresul și determinarea lui! 🎉

Mulțumim că ne sunteți alături - abia așteptăm să vedem ce va cuceri în continuare! 💫', p_first_name, p_course_label),
    format('🚀 %1$s tocmai a bifat un nou pas important la %2$s! Ne umple de bucurie să îl vedem cum crește, învață lucruri noi și capătă din ce în ce mai multă încredere în el. 🎉

Suntem recunoscători că face parte din povestea noastră și abia așteptăm continuarea aventurii lui! 🌟', p_first_name, p_course_label),
    format('🎊 O reușită minunată pentru %1$s! A finalizat cu succes o nouă etapă la %2$s și e clar că progresul lui e uriaș. Suntem tare mândri de el! 🌈

Mulțumim că sunteți alături de noi în această călătorie - urmează lucruri și mai frumoase! ✨', p_first_name, p_course_label),
    format('🌈 Vești superbe despre %1$s! A trecut cu bine de o nouă etapă din aventura lui la %2$s, iar entuziasmul și implicarea lui ne bucură enorm. 🎉

Este o plăcere să îl vedem evoluând - abia așteptăm să vedem ce urmează! 🚀', p_first_name, p_course_label),
    format('✨ %1$s a mai făcut un pas mare înainte la %2$s! Suntem tare mândri de reușita lui și de tot progresul făcut până acum. 🎉

Vă mulțumim că sunteți alături de noi în această călătorie - urmează lucruri minunate! 🌟', p_first_name, p_course_label),
    format('🎉 Ce reușită frumoasă pentru %1$s! A încheiat cu succes o nouă etapă la %2$s și îl vedem din ce în ce mai încrezător și entuziasmat. 🌟

Ne bucurăm enorm să facem parte din parcursul lui - abia așteptăm continuarea! 🚀', p_first_name, p_course_label),
    format('🌟 Felicitări din suflet, %1$s! A dus la bun sfârșit o nouă etapă din aventura lui la %2$s, iar progresul lui ne umple de mândrie. 🎉

Mulțumim că sunteți alături de noi - urmează multe momente minunate! ✨', p_first_name, p_course_label)
  ])[1 + floor(random() * 8)::int];
$$;

-- "Finalizează generarea diplomei" din Diplome.tsx (pasul de dupa "Genereaza diploma", doar
-- pentru mod "Din grupa" - elev real). In aceeasi tranzactie:
--  1. daca elevul avea taskul de "16 prezente" deschis exact pe acest prag (pending_diploma_
--     milestone = p_module * 16), il inchide - dispare automat din Task-uri Urgente al
--     profesorului, la fel ca inainte (triggerul touch_pending_diploma_milestone existent
--     ramane neschimbat);
--  2. deschide task-ul de admin DIPLOMA_GENERATED, cu recompensa aleasa de profesor si
--     mesajul pentru parinte generat automat (fara recompensa in el);
--  3. daca exista deja un task DIPLOMA_NOT_SENT deschis pentru acelasi (elev, prag) - adica
--     elevul intarziase, dar profesorul tocmai a finalizat diploma - il inchide automat, ca
--     sa nu ramana un task "netrimis" langa unul "generat" pentru acelasi eveniment.
-- security definer: profesorul nu are (si nu are nevoie de) acces direct la urgent_tasks.
-- NOTA: aceasta versiune (5 parametri) e inlocuita de add_diploma_snapshot_to_urgent_tasks.sql
-- (6 parametri, adauga p_diploma_date + snapshot-ul diplomei) - ruleaza si acel fisier dupa asta.
create or replace function public.finalize_diploma_with_reward(
  p_student_id uuid, p_module int, p_reward_received boolean,
  p_reward_type text default null, p_reward_details text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_student record;
  v_group record;
  v_milestone int;
  v_first_name text;
  v_course_label text;
  v_reward_type text;
  v_reward_details text;
begin
  -- Adminul poate finaliza si diploma unui elev al altui profesor (vezi viewedTeacherId din
  -- ProgressTracker.tsx / dropdown-ul de profesor din Diplome.tsx - adminul poate opera pe
  -- dashboard-ul oricarui profesor, exact ca politica RLS "adminul gestioneaza toti elevii").
  select s.id, s.name, s.short_name, s.teacher_id, s.group_id, s.pending_diploma_milestone
    into v_student
    from public.tracker_students s
    where s.id = p_student_id and (s.teacher_id = auth.uid() or public.is_admin())
    for update;

  if v_student.id is null then
    raise exception 'Elevul nu a fost găsit.';
  end if;
  if p_module is null or p_module < 1 then
    raise exception 'Modul invalid.';
  end if;

  if p_reward_received then
    if p_reward_type is null or p_reward_type not in ('virtual_money', 'super_power') then
      raise exception 'Tip de premiu invalid.';
    end if;
    if nullif(trim(coalesce(p_reward_details, '')), '') is null then
      raise exception 'Detaliile premiului sunt obligatorii.';
    end if;
    v_reward_type := p_reward_type;
    v_reward_details := trim(p_reward_details);
  else
    v_reward_type := null;
    v_reward_details := null;
  end if;

  v_milestone := p_module * 16;
  v_first_name := coalesce(nullif(trim(v_student.short_name), ''), split_part(v_student.name, ' ', 1));

  select group_name, course into v_group from public.tracker_groups where id = v_student.group_id;
  -- Aceeasi corespondenta curs -> eticheta ca in COURSES din src/lib/diplomas.ts (duplicata
  -- aici pentru ca aceasta functie ruleaza server-side, fara acces la codul TS) - de actualizat
  -- in ambele locuri daca se adauga un curs nou cu sablon de diploma.
  v_course_label := coalesce(
    case v_group.course
      when 'coblocks' then 'Blocuri de cod'
      when 'python' then 'Python'
      when 'roblox' then 'Roblox'
      when 'alfabetizare' then 'Alfabetizare'
      when 'unity' then 'Unity'
      else v_group.course
    end,
    'IT'
  );

  if v_student.pending_diploma_milestone = v_milestone then
    update public.tracker_students
      set last_diploma_issued_milestone = v_milestone, pending_diploma_milestone = null
      where id = p_student_id;
  end if;

  insert into public.urgent_tasks
    (type, student_id, teacher_id, milestone, reward_received, reward_type, reward_details, parent_message, milestone_reached_at)
  values (
    'DIPLOMA_GENERATED', p_student_id, v_student.teacher_id, v_milestone,
    p_reward_received, v_reward_type, v_reward_details,
    public.random_diploma_parent_message(v_first_name, v_course_label),
    now()
  )
  on conflict (student_id, milestone, type) do nothing;

  update public.urgent_tasks
    set status = 'COMPLETED', completed_at = now(), completed_by = auth.uid()
    where student_id = p_student_id and milestone = v_milestone and type = 'DIPLOMA_NOT_SENT' and status <> 'COMPLETED';
end;
$$;

grant execute on function public.finalize_diploma_with_reward(uuid, int, boolean, text, text) to authenticated;

-- Extinde send_overdue_diploma_alerts() (functia existenta, ruleaza deja zilnic prin pg_cron)
-- ca, pe langa webhook-ul Pabbly de azi (neschimbat), sa deschida si task-ul de admin
-- DIPLOMA_NOT_SENT - dedublicat automat de constrangerea unique (student_id, milestone, type)
-- de mai sus, la fel cum diploma_overdue_alert_sent_at dedubleaza deja webhook-ul.
create or replace function public.send_overdue_diploma_alerts()
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    select s.id, s.name as student_name, s.teacher_id, s.pending_diploma_milestone,
           s.pending_diploma_milestone_at,
           coalesce(nullif(p.full_name, ''), p.email) as teacher_name
    from public.tracker_students s
    join public.profiles p on p.id = s.teacher_id
    where s.deleted_at is null
      and s.pending_diploma_milestone is not null
      and current_date >= public.add_business_days(s.pending_diploma_milestone_at::date, 3)
      and s.diploma_overdue_alert_sent_at is null
  loop
    perform net.http_post(
      url := 'https://connect.pabbly.com/webhook-listener/webhook/IjU3NjIwNTY5MDYzMzA0MzM1MjZiNTUzMyI_3D_pc/IjU3NjcwNTY4MDYzNjA0M2Q1MjZjNTUzMjUxMzMi_pc',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'nume_copil', r.student_name,
        'nume_profesor', r.teacher_name,
        'data_cererii', r.pending_diploma_milestone_at,
        'mesaj_alerta', 'Profesorul nu a trimis diploma de 3 zile lucrătoare. Te rugăm să ceri diploma.'
      )
    );

    insert into public.urgent_tasks (type, student_id, teacher_id, milestone, milestone_reached_at)
    values ('DIPLOMA_NOT_SENT', r.id, r.teacher_id, r.pending_diploma_milestone, r.pending_diploma_milestone_at)
    on conflict (student_id, milestone, type) do nothing;

    update public.tracker_students set diploma_overdue_alert_sent_at = now() where id = r.id;
  end loop;
end;
$$;

-- Fortam PostgREST sa reincarce schema imediat dupa CREATE TABLE - vezi acelasi NOTIFY (si
-- comentariul complet) in add_diploma_snapshot_to_urgent_tasks.sql.
notify pgrst, 'reload schema';
