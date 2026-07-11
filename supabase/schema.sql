-- ==========================================================
-- BASE DE DATOS
-- INCUBADORA IoT - SUPABASE
-- PostgreSQL
-- ==========================================================
-- NOTA: después de correr este archivo, corre también:
--   1. trigger_perfiles.sql  (crea el perfil al registrarse)
--   2. politicas_auth.sql    (exige login para leer/escribir)
--   3. limpiar_datos_prueba.sql (solo si insertaste datos a mano)
-- ==========================================================

------------------------------------------------------------
-- TABLA DE PERFILES DE USUARIO
------------------------------------------------------------

create table perfiles (
    id uuid primary key references auth.users(id) on delete cascade,
    nombre varchar(100) not null,
    nombre_usuario varchar(50) unique not null,
    correo varchar(150) unique not null,
    fecha_registro timestamptz default now()
);

------------------------------------------------------------
-- TABLA DE INCUBADORAS
------------------------------------------------------------

create table incubadoras (

    id uuid primary key default gen_random_uuid(),

    usuario_id uuid not null references perfiles(id)
    on delete cascade,

    nombre varchar(100) not null,

    ubicacion varchar(150),

    estado boolean default true,

    created_at timestamptz default now()

);

------------------------------------------------------------
-- TIPOS DE HUEVO
------------------------------------------------------------

create table tipos_huevo (

    id serial primary key,

    nombre varchar(50) unique not null,

    dias_incubacion integer not null,

    temperatura_ideal numeric(4,1),

    humedad_inicial numeric(4,1),

    humedad_final numeric(4,1)

);

------------------------------------------------------------
-- DATOS INICIALES
------------------------------------------------------------

insert into tipos_huevo
(nombre,dias_incubacion,temperatura_ideal,humedad_inicial,humedad_final)
values

('Gallina',21,37.5,55,70),

('Codorniz',17,37.5,55,70),

('Pato',28,37.5,60,75),

('Pavo',28,37.5,55,70);

------------------------------------------------------------
-- INCUBACIONES
------------------------------------------------------------

create table incubaciones (

    id uuid primary key default gen_random_uuid(),

    incubadora_id uuid not null
    references incubadoras(id)
    on delete cascade,

    tipo_huevo_id integer not null
    references tipos_huevo(id),

    cantidad_huevos integer not null,

    fecha_inicio timestamptz default now(),

    fecha_probable_eclosion timestamptz not null,

    estado varchar(20) default 'Activa',

    created_at timestamptz default now()

);

------------------------------------------------------------
-- LECTURAS DEL ESP32
------------------------------------------------------------

create table lecturas_sensor (

    id bigint generated always as identity primary key,

    incubacion_id uuid not null
    references incubaciones(id)
    on delete cascade,

    fecha_hora timestamptz default now(),

    temperatura numeric(4,1) not null,

    humedad numeric(4,1) not null,

    movimiento boolean default false

);

------------------------------------------------------------
-- ALERTAS
------------------------------------------------------------

create table alertas (

    id bigint generated always as identity primary key,

    incubacion_id uuid not null
    references incubaciones(id)
    on delete cascade,

    fecha_hora timestamptz default now(),

    tipo varchar(50) not null,

    mensaje text not null,

    estado varchar(20) default 'Pendiente'

);

------------------------------------------------------------
-- ÍNDICES
------------------------------------------------------------

create index idx_incubadora_usuario
on incubadoras(usuario_id);

create index idx_incubacion
on lecturas_sensor(incubacion_id);

create index idx_fecha
on lecturas_sensor(fecha_hora desc);

create index idx_alertas
on alertas(incubacion_id);

------------------------------------------------------------
-- ROW LEVEL SECURITY
------------------------------------------------------------

alter table perfiles enable row level security;
alter table incubadoras enable row level security;
alter table incubaciones enable row level security;
alter table lecturas_sensor enable row level security;
alter table alertas enable row level security;

------------------------------------------------------------
-- POLÍTICAS (modo desarrollo)
------------------------------------------------------------

create policy "Acceso total perfiles"
on perfiles
for all
using (true)
with check (true);

create policy "Acceso total incubadoras"
on incubadoras
for all
using (true)
with check (true);

create policy "Acceso total incubaciones"
on incubaciones
for all
using (true)
with check (true);

create policy "Acceso total lecturas"
on lecturas_sensor
for all
using (true)
with check (true);

create policy "Acceso total alertas"
on alertas
for all
using (true)
with check (true);
