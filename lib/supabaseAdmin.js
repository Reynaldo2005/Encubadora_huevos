import { createClient } from "@supabase/supabase-js";

// ⚠️ Este cliente usa la Secret key y salta las políticas RLS.
// SOLO se debe usar en código que corre en el servidor
// (API routes como app/api/sensor/route.js), nunca en componentes
// con "use client".
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.warn(
    "⚠️ Falta SUPABASE_SERVICE_ROLE_KEY en .env.local (necesaria para /api/sensor)"
  );
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
