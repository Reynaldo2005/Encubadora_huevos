-- ==========================================================
-- POLÍTICAS RLS PARA LOGIN REAL
-- Correr DESPUÉS de: schema.sql, trigger_perfiles.sql,
-- y (si aplica) limpiar_datos_prueba.sql
-- ==========================================================

------------------------------------------------------------
-- Reemplazar las políticas abiertas ("modo desarrollo") por
-- políticas que exigen estar autenticado.
-- Como es un proyecto compartido (tú + tu compañero), cualquier
-- usuario logueado puede ver/editar todo: no hay aislamiento
-- por dueño, solo exige login real.
------------------------------------------------------------

drop policy if exists "Acceso total perfiles" on perfiles;
drop policy if exists "Acceso total incubadoras" on incubadoras;
drop policy if exists "Acceso total incubaciones" on incubaciones;
drop policy if exists "Acceso total lecturas" on lecturas_sensor;
drop policy if exists "Acceso total alertas" on alertas;

-- perfiles: cualquier autenticado puede ver todos los perfiles,
-- pero solo puede editar el suyo. El insert lo hace el trigger.
create policy "Ver perfiles (autenticados)"
on perfiles for select
using (auth.role() = 'authenticated');

create policy "Editar mi propio perfil"
on perfiles for update
using (auth.uid() = id);

create policy "Insertar mi propio perfil"
on perfiles for insert
with check (auth.uid() = id);

-- incubadoras, incubaciones, lecturas_sensor, alertas:
-- acceso total para cualquier usuario autenticado (workspace compartido)
create policy "Autenticados: acceso total incubadoras"
on incubadoras for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "Autenticados: acceso total incubaciones"
on incubaciones for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "Autenticados: acceso total lecturas"
on lecturas_sensor for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "Autenticados: acceso total alertas"
on alertas for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');
