"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { calcularFechaEclosion } from "@/lib/incubacionLogic";

export default function NuevaIncubacionPage() {
  const router = useRouter();
  const { usuario, cargandoSesion } = useAuth();

  const [tiposHuevo, setTiposHuevo] = useState([]);
  const [tipoHuevoId, setTipoHuevoId] = useState(null);
  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().slice(0, 10));
  const [cantidadHuevos, setCantidadHuevos] = useState(6);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!cargandoSesion && !usuario) {
      router.push("/login");
    }
  }, [cargandoSesion, usuario, router]);

  useEffect(() => {
    async function cargarTipos() {
      const { data } = await supabase.from("tipos_huevo").select("*").order("dias_incubacion");
      setTiposHuevo(data || []);
      if (data && data.length > 0) setTipoHuevoId(data[0].id);
      setCargando(false);
    }
    cargarTipos();
  }, []);

  const tipoSeleccionado = tiposHuevo.find((t) => t.id === tipoHuevoId);
  const diasIncubacion = tipoSeleccionado?.dias_incubacion ?? 21;
  const fechaEclosionPreview = calcularFechaEclosion(fechaInicio, diasIncubacion);

  async function obtenerOCrearIncubadora() {
    const { data: existente } = await supabase
      .from("incubadoras")
      .select("*")
      .eq("usuario_id", usuario.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existente) return existente;

    const { data: nueva, error: errCrear } = await supabase
      .from("incubadoras")
      .insert({ usuario_id: usuario.id, nombre: "Incubadora principal", estado: true })
      .select()
      .single();

    if (errCrear) throw errCrear;
    return nueva;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setGuardando(true);
    setError(null);

    try {
      const incubadora = await obtenerOCrearIncubadora();

      // Marcar como finalizadas las incubaciones activas anteriores de esta incubadora
      await supabase
        .from("incubaciones")
        .update({ estado: "Finalizada" })
        .eq("incubadora_id", incubadora.id)
        .eq("estado", "Activa");

      const { error: errInsert } = await supabase.from("incubaciones").insert({
        incubadora_id: incubadora.id,
        tipo_huevo_id: tipoHuevoId,
        cantidad_huevos: Number(cantidadHuevos),
        fecha_inicio: new Date(fechaInicio).toISOString(),
        fecha_probable_eclosion: fechaEclosionPreview.toISOString(),
        estado: "Activa",
      });

      if (errInsert) throw errInsert;

      router.push("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  if (cargandoSesion || cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted font-mono-data">
        Cargando...
      </div>
    );
  }

  if (!usuario) return null;

  return (
    <div className="min-h-screen px-4 py-10 md:py-16 max-w-lg mx-auto">
      <p className="text-muted text-xs tracking-widest uppercase font-mono-data mb-1">Nuevo lote</p>
      <h1 className="font-display text-2xl text-cream font-bold mb-8">Registrar ingreso de huevos</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Campo label="Tipo de huevo">
          <select
            value={tipoHuevoId ?? ""}
            onChange={(e) => setTipoHuevoId(Number(e.target.value))}
            className="input"
          >
            {tiposHuevo.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre} ({t.dias_incubacion} días)
              </option>
            ))}
          </select>
        </Campo>

        <Campo label="Fecha de ingreso de los huevos">
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className="input"
            required
          />
        </Campo>

        <Campo label="Cantidad de huevos">
          <input
            type="number"
            min={1}
            value={cantidadHuevos}
            onChange={(e) => setCantidadHuevos(e.target.value)}
            className="input"
          />
        </Campo>

        <div className="bg-panel-card border border-panel-border rounded-2xl p-5 mt-2">
          <p className="text-muted text-xs uppercase tracking-widest font-mono-data mb-1">
            Fecha probable de eclosión
          </p>
          <p className="font-display text-xl text-amber-glow">
            {fechaEclosionPreview.toLocaleDateString("es-PE", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>

        {error && <p className="text-status-danger text-sm">{error}</p>}

        <button
          type="submit"
          disabled={guardando || !tipoHuevoId}
          className="mt-2 px-5 py-3 rounded-full bg-amber-glow text-panel-bg font-display font-bold hover:bg-amber-soft transition-colors disabled:opacity-50"
        >
          {guardando ? "Guardando..." : "Iniciar incubación"}
        </button>
      </form>

      <style jsx global>{`
        .input {
          background-color: #241d18;
          border: 1px solid #3a2f27;
          border-radius: 0.75rem;
          padding: 0.75rem 1rem;
          color: #f2e9dc;
          font-family: "Inter", sans-serif;
          width: 100%;
        }
        .input:focus {
          outline: none;
          border-color: #e8a33d;
        }
      `}</style>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-muted text-xs uppercase tracking-widest font-mono-data">{label}</span>
      {children}
    </label>
  );
}
