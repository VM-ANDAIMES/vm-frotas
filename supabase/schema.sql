-- VM FROTAS - execute no SQL Editor do Supabase em um projeto NOVO.
create extension if not exists pgcrypto;
create type public.app_role as enum ('admin','driver','viewer');
create type public.vehicle_status as enum ('available','in_use','maintenance','inactive');

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null,
 role public.app_role not null default 'viewer',
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.vehicles (
 id uuid primary key default gen_random_uuid(), plate text not null unique,
 brand text not null, model text not null, year integer,
 current_km integer not null default 0 check(current_km >= 0),
 status public.vehicle_status not null default 'available',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.trips (
 id uuid primary key default gen_random_uuid(), vehicle_id uuid not null references public.vehicles(id),
 driver_id uuid not null references public.profiles(id), start_km integer not null check(start_km >= 0),
 end_km integer check(end_km is null or end_km >= start_km), started_at timestamptz not null default now(),
 ended_at timestamptz, start_notes text, end_notes text,
 check ((ended_at is null and end_km is null) or (ended_at is not null and end_km is not null))
);
create unique index one_open_trip_per_vehicle on public.trips(vehicle_id) where ended_at is null;
create table public.maintenance (
 id uuid primary key default gen_random_uuid(), vehicle_id uuid not null references public.vehicles(id),
 description text not null, cost numeric(12,2) not null default 0 check(cost >= 0),
 service_date date not null default current_date, created_by uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
create table public.fuel_logs (
 id uuid primary key default gen_random_uuid(), vehicle_id uuid not null references public.vehicles(id),
 driver_id uuid references public.profiles(id), liters numeric(10,2) not null check(liters > 0),
 total_cost numeric(12,2) not null check(total_cost >= 0), odometer_km integer not null check(odometer_km >= 0),
 station text, fueled_at timestamptz not null default now(), created_by uuid references public.profiles(id)
);
create index trips_vehicle_started_idx on public.trips(vehicle_id,started_at desc);
create index fuel_vehicle_date_idx on public.fuel_logs(vehicle_id,fueled_at desc);

create or replace function public.is_active_user() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active=true);
$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active=true and role='admin');
$$;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,full_name,role,active) values(new.id,coalesce(new.raw_user_meta_data->>'full_name','Usuário'),'viewer',true)
 on conflict(id) do nothing; return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.checkout_vehicle(p_vehicle_id uuid,p_start_km integer,p_notes text default '') returns uuid
language plpgsql security definer set search_path=public as $$
declare v public.vehicles; new_trip uuid;
begin
 if not public.is_active_user() then raise exception 'Usuário sem autorização.'; end if;
 if not exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','driver') and active) then raise exception 'Somente motorista autorizado pode retirar veículo.'; end if;
 select * into v from public.vehicles where id=p_vehicle_id for update;
 if not found then raise exception 'Veículo não encontrado.'; end if;
 if v.status <> 'available' then raise exception 'Veículo não está disponível.'; end if;
 if p_start_km < v.current_km then raise exception 'KM informado é menor que o KM atual do veículo.'; end if;
 insert into public.trips(vehicle_id,driver_id,start_km,start_notes) values(p_vehicle_id,auth.uid(),p_start_km,p_notes) returning id into new_trip;
 update public.vehicles set current_km=p_start_km,status='in_use',updated_at=now() where id=p_vehicle_id;
 return new_trip;
end; $$;
create or replace function public.checkin_vehicle(p_vehicle_id uuid,p_end_km integer,p_notes text default '') returns uuid
language plpgsql security definer set search_path=public as $$
declare t public.trips; v public.vehicles;
begin
 if not public.is_active_user() then raise exception 'Usuário sem autorização.'; end if;
 select * into v from public.vehicles where id=p_vehicle_id for update;
 if not found then raise exception 'Veículo não encontrado.'; end if;
 select * into t from public.trips where vehicle_id=p_vehicle_id and ended_at is null for update;
 if not found then raise exception 'Não existe retirada em aberto para este veículo.'; end if;
 if t.driver_id <> auth.uid() and not public.is_admin() then raise exception 'Somente o motorista responsável ou administrador pode devolver este veículo.'; end if;
 if p_end_km < t.start_km then raise exception 'KM de devolução não pode ser menor que o KM de retirada.'; end if;
 update public.trips set end_km=p_end_km,ended_at=now(),end_notes=p_notes where id=t.id;
 update public.vehicles set current_km=p_end_km,status='available',updated_at=now() where id=p_vehicle_id;
 return t.id;
end; $$;

grant execute on function public.checkout_vehicle(uuid,integer,text) to authenticated;
grant execute on function public.checkin_vehicle(uuid,integer,text) to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.trips enable row level security;
alter table public.maintenance enable row level security;
alter table public.fuel_logs enable row level security;
create policy "active users read profiles" on public.profiles for select to authenticated using (public.is_active_user());
create policy "admin updates profiles" on public.profiles for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "active users read vehicles" on public.vehicles for select to authenticated using(public.is_active_user());
create policy "admins insert vehicles" on public.vehicles for insert to authenticated with check(public.is_admin());
create policy "admins update vehicles" on public.vehicles for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "active users read trips" on public.trips for select to authenticated using(public.is_active_user());
create policy "admins read maintenance" on public.maintenance for select to authenticated using(public.is_admin());
create policy "admins add maintenance" on public.maintenance for insert to authenticated with check(public.is_admin());
create policy "active users read fuel" on public.fuel_logs for select to authenticated using(public.is_active_user());
create policy "active users add fuel" on public.fuel_logs for insert to authenticated with check(public.is_active_user() and (driver_id is null or driver_id=auth.uid() or public.is_admin()));
