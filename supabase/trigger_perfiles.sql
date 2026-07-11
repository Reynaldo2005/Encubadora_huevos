-- ==========================================================
-- TRIGGER: crear perfil automáticamente al registrarse
-- Ejecutar en Supabase > SQL Editor (después de schema.sql)
-- ==========================================================

create or replace function public.crear_perfil_nuevo_usuario()
returns trigger as $$
begin
  insert into public.perfiles (id, nombre, nombre_usuario, correo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'nombre_usuario', split_part(new.email, '@', 1) || '_' || substr(new.id::text, 1, 4)),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

-- Se dispara cada vez que se crea un usuario nuevo en auth.users
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();
