-- ==========================================================
-- LIMPIAR DATOS DE PRUEBA
-- Corre esto SOLO si insertaste filas a mano en perfiles /
-- incubadoras / incubaciones antes de tener login real.
-- Esos datos probablemente no tienen un usuario válido en
-- auth.users, así que es mejor empezar limpio.
-- (Los tipos_huevo NO se tocan, esos se quedan igual)
-- ==========================================================

delete from alertas;
delete from lecturas_sensor;
delete from incubaciones;
delete from incubadoras;
delete from perfiles;
