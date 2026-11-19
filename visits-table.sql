-- Our own campaign visit tracking.
--
-- Why: Vercel only breaks visits down by utm_campaign on the paid Web
-- Analytics Plus add-on. This records one row per page view so the admin
-- Stats tab can answer "how many people did that Note send us?" for free.
--
-- Written only by /api/track (service key). RLS is on with NO policies, so
-- the anon/publishable key can neither read nor write this table.
--
-- Privacy: no IP, no email, no user id. `visitor_id` is a random id the
-- browser generates and keeps in a first-party cookie/localStorage.

create table if not exists public.visits (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  host          text,
  path          text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,
  referrer_host text,
  visitor_id    text,
  is_admin      boolean not null default false
);

alter table public.visits enable row level security;

create index if not exists visits_created_idx  on public.visits (created_at desc);
create index if not exists visits_campaign_idx on public.visits (utm_campaign, created_at desc);
create index if not exists visits_visitor_idx  on public.visits (visitor_id, created_at desc);

-- Aggregates for the admin Stats tab, computed in the database so the API
-- never has to page through raw rows. Admin visits are excluded.
-- Only the service role may call it.
create or replace function public.visit_stats(days integer default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with v as (
    select *
    from public.visits
    where not is_admin
      and (days is null or created_at >= now() - make_interval(days => days))
  )
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'pageviews', count(*),
        'visitors', count(distinct visitor_id),
        'tagged_pageviews', count(*) filter (where utm_campaign is not null),
        'tagged_visitors', count(distinct visitor_id) filter (where utm_campaign is not null)
      ) from v
    ),
    'campaigns', coalesce((
      select jsonb_agg(row_to_json(c) order by c.visitors desc, c.pageviews desc)
      from (
        select utm_campaign as campaign,
               string_agg(distinct utm_source, ', ') as sources,
               count(distinct visitor_id) as visitors,
               count(*) as pageviews,
               max(created_at) as last_seen
        from v where utm_campaign is not null
        group by utm_campaign
      ) c
    ), '[]'::jsonb),
    'referrers', coalesce((
      select jsonb_agg(row_to_json(r) order by r.visitors desc, r.pageviews desc)
      from (
        select coalesce(referrer_host, '(direct / none)') as referrer,
               count(distinct visitor_id) as visitors,
               count(*) as pageviews
        from v
        group by 1
        order by 2 desc, 3 desc
        limit 50
      ) r
    ), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(row_to_json(d) order by d.day desc)
      from (
        select to_char((created_at at time zone 'America/Los_Angeles')::date, 'YYYY-MM-DD') as day,
               count(distinct visitor_id) as visitors,
               count(*) as pageviews,
               count(*) filter (where utm_campaign is not null) as tagged_pageviews
        from v
        group by 1
        order by 1 desc
        limit 90
      ) d
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.visit_stats(integer) from public, anon, authenticated;
grant execute on function public.visit_stats(integer) to service_role;
