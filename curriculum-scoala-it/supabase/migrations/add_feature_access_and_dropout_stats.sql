-- ============================================================================
--  ACCES LA MODULE NOI (Super Admin) + RATA DE ABANDON PER PROFESOR
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--
--  Nu exista un rol "Super Admin" separat - rolul 'admin' existent JOACA acest
--  rol (are automat acces la toate modulele noi, plus dreptul de a le activa
--  pentru profesori individuali). feature_access e un comutator per profesor,
--  per modul - acelasi tipar ca module_permissions (schema.sql sectiunea 3),
--  dar la nivel de sectiune intreaga a aplicatiei, nu de continut curriculum.
-- ============================================================================

create table public.feature_access (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  module_key text not null check (module_key in ('subscriptions', 'dropout_analytics')),
  enabled    boolean not null default false,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, module_key)
);

alter table public.feature_access enable row level security;

create policy "vad propriul acces la module" on public.feature_access
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "adminul gestioneaza accesul la module" on public.feature_access
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.has_feature_access(p_module_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.feature_access fa
                 where fa.module_key = p_module_key and fa.user_id = auth.uid() and fa.enabled = true);
$$;

grant execute on function public.has_feature_access(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Rata de abandon per profesor, pe o fereastra de p_months luni (implicit 4).
--
-- Definitie: "total_students" = elevii aflati pe lista profesorului la un
-- moment dat in interiorul ferestrei [now() - p_months, now()] - creati cel
-- tarziu la finalul ferestrei SI (inca activi/pauza, SAU marcati abandon chiar
-- in interiorul ferestrei). Un elev abandonat INAINTE de fereastra nu mai
-- conteaza (a iesit deja din raport in lunile urmatoare); un elev TRANSFERAT
-- la alt profesor iese complet din numaratoarea profesorului vechi (teacher_id
-- se schimba la transfer_student_teacher) - transferul nu afecteaza deloc rata
-- de abandon, exact cum cere cerinta de business.
-- "dropped_students" = subsetul cu status = 'dropped_out' si status_changed_at
-- in fereastra.
--
-- Vizibilitate: adminul vede toti profesorii; un profesor (cu acces la modulul
-- 'dropout_analytics', verificat in pagina, nu aici) vede STRICT randul lui -
-- impusa direct in functie (nu doar in UI), ca aparare in adancime.
-- ----------------------------------------------------------------------------
create or replace function public.teacher_dropout_stats(p_months int default 4)
returns table (
  teacher_id uuid,
  teacher_name text,
  total_students bigint,
  dropped_students bigint,
  dropout_rate numeric
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_start timestamptz := now() - (p_months || ' months')::interval;
  v_end   timestamptz := now();
begin
  return query
    select
      p.id,
      coalesce(nullif(p.full_name, ''), p.email),
      count(s.id) filter (
        where s.created_at <= v_end
          and (s.status <> 'dropped_out' or s.status_changed_at >= v_start)
      ),
      count(s.id) filter (
        where s.status = 'dropped_out' and s.status_changed_at between v_start and v_end
      ),
      case when count(s.id) filter (
        where s.created_at <= v_end
          and (s.status <> 'dropped_out' or s.status_changed_at >= v_start)
      ) = 0 then 0
      else round(
        count(s.id) filter (where s.status = 'dropped_out' and s.status_changed_at between v_start and v_end)::numeric
        / count(s.id) filter (
            where s.created_at <= v_end
              and (s.status <> 'dropped_out' or s.status_changed_at >= v_start)
          ) * 100, 1)
      end
    from public.profiles p
    left join public.tracker_students s on s.teacher_id = p.id
    where p.role = 'teacher'
      and (public.is_admin() or p.id = auth.uid())
    group by p.id, p.full_name, p.email
    order by p.full_name;
end;
$$;

grant execute on function public.teacher_dropout_stats(int) to authenticated;
