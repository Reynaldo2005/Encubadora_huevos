"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import {
  diasTranscurridos,
  calcularFaseIncubacion,
  calcularFechaEclosion,
  calcularAlertaVolteo,
  evaluarLectura,
  necesitaAlertaTemperaturaAlta,
  necesitaAlertaHumedadBaja,
} from "@/lib/incubacionLogic";

export default function DashboardPage() {
  const router = useRouter();
  const { usuario, cargandoSesion, signOut } = useAuth();

  const [lotes, setLotes] = useState([]); // TODOS los lotes (activos y finalizados)
  const [loteSeleccionadoId, setLoteSeleccionadoId] = useState(null);
  const [ultimaLectura, setUltimaLectura] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [alertasPendientes, setAlertasPendientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!cargandoSesion && !usuario) {
      router.push("/login");
    }
  }, [cargandoSesion, usuario, router]);

  // 1. Cargar TODOS los lotes de la incubadora (para el selector)
  const cargarLotes = useCallback(async () => {
    if (!usuario) return;

    const { data: incubadora, error: errIncubadora } = await supabase
      .from("incubadoras")
      .select("*")
      .eq("usuario_id", usuario.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (errIncubadora) {
      setError(errIncubadora.message);
      setCargando(false);
      return;
    }

    if (!incubadora) {
      setLotes([]);
      setCargando(false);
      return;
    }

    const { data: todosLosLotes, error: errLotes } = await supabase
      .from("incubaciones")
      .select("*, tipos_huevo(*)")
      .eq("incubadora_id", incubadora.id)
      .order("fecha_inicio", { ascending: false });

    if (errLotes) {
      setError(errLotes.message);
      setCargando(false);
      return;
    }

    setLotes(todosLosLotes || []);

    // Por defecto selecciona el lote activo; si no hay, el más reciente
    setLoteSeleccionadoId((actual) => {
      if (actual && todosLosLotes?.some((l) => l.id === actual)) return actual;
      const activo = todosLosLotes?.find((l) => l.estado === "Activa");
      return activo?.id ?? todosLosLotes?.[0]?.id ?? null;
    });

    setCargando(false);
  }, [usuario]);

  useEffect(() => {
    if (usuario) {
      cargarLotes();
      const intervalo = setInterval(cargarLotes, 30000);
      return () => clearInterval(intervalo);
    }
  }, [usuario, cargarLotes]);

  const loteSeleccionado = useMemo(
    () => lotes.find((l) => l.id === loteSeleccionadoId) ?? null,
    [lotes, loteSeleccionadoId]
  );

  // 2. Cargar lecturas + alertas del lote seleccionado
  const cargarDetalleLote = useCallback(async () => {
    if (!loteSeleccionadoId) {
      setHistorial([]);
      setUltimaLectura(null);
      setAlertasPendientes([]);
      return;
    }

    const { data: lecturas } = await supabase
      .from("lecturas_sensor")
      .select("*")
      .eq("incubacion_id", loteSeleccionadoId)
      .order("fecha_hora", { ascending: false })
      .limit(50);

    setHistorial(lecturas || []);
    const lecturaActual = lecturas && lecturas.length > 0 ? lecturas[0] : null;
    setUltimaLectura(lecturaActual);

    const { data: ultimoMovimientoData } = await supabase
    .from("lecturas_sensor")
    .select("fecha_hora")
    .eq("incubacion_id", loteSeleccionadoId)
    .eq("movimiento", true)
    .order("fecha_hora", { ascending: false })
    .limit(1)
    .maybeSingle();

    const loteActual = lotes.find((l) => l.id === loteSeleccionadoId);

    if (loteActual && loteActual.estado === "Activa" && lecturaActual && loteActual.tipos_huevo) {
      const dias = diasTranscurridos(loteActual.fecha_inicio);
      const diasTotal = loteActual.tipos_huevo.dias_incubacion ?? 21;
      const ultimoMovimiento = lecturas.find((l) => l.movimiento)?.fecha_hora ?? null;

      await verificarYRegistrarAlertas(loteActual, lecturaActual, dias, diasTotal, ultimoMovimiento);
    }

    const { data: alertas } = await supabase
      .from("alertas")
      .select("*")
      .eq("incubacion_id", loteSeleccionadoId)
      .eq("estado", "Pendiente")
      .order("fecha_hora", { ascending: false });

    setAlertasPendientes(alertas || []);
  }, [loteSeleccionadoId, lotes]);

  useEffect(() => {
    cargarDetalleLote();
    const intervalo = setInterval(cargarDetalleLote, 30000);
    return () => clearInterval(intervalo);
  }, [cargarDetalleLote]);

  async function resolverAlerta(id) {
    await supabase.from("alertas").update({ estado: "Resuelta" }).eq("id", id);
    setAlertasPendientes((prev) => prev.filter((a) => a.id !== id));
  }

  async function reactivarLote(){
    if (!loteSeleccionado || loteSeleccionado.estado === "Activa") return;
    const confirmar = window.confirm(
      "Esto va a marcar cualquier otro lote activo como Finalizado. ¿Quieres reactivar este lote?"
    );
    if (!confirmar) return;

    await supabase
    .from("incubaciones"
    .update({estado: "Finalizada"})
    .eq("incubadora_id", loteSeleccionado.incubadora_id)
    .eq("estado", "Activa")
    );

    await supabase
    -from("incubaciones")
    .update({ estado: "Activa" })
    .eq("id", loteSeleccionado.id);

    await cargarLotes();
  }

  if (cargandoSesion || cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted font-mono-data">
        Cargando panel...
      </div>
    );
  }

  if (!usuario) return null; // redirigiendo a /login

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-status-danger">
        Error: {error}
      </div>
    );
  }

  if (lotes.length === 0 || !loteSeleccionado) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-display text-2xl text-cream">No hay ningún lote registrado</p>
        <p className="text-muted max-w-sm">
          Registra un nuevo lote de huevos para empezar a monitorear la incubación.
        </p>
        <Link
          href="/nueva-incubacion"
          className="mt-2 px-5 py-3 rounded-full bg-amber-glow text-panel-bg font-display font-bold hover:bg-amber-soft transition-colors"
        >
          + Registrar nuevo lote
        </Link>
      </div>
    );
  }

  const tipoHuevo = loteSeleccionado.tipos_huevo;
  const diasIncubacionTotal = tipoHuevo?.dias_incubacion ?? 21;
  const dias = diasTranscurridos(loteSeleccionado.fecha_inicio);
  const diasClamped = Math.max(0, Math.min(dias, diasIncubacionTotal));
  const fase = calcularFaseIncubacion(dias, diasIncubacionTotal);
  const fechaEclosion = calcularFechaEclosion(loteSeleccionado.fecha_inicio, diasIncubacionTotal);
  const diasRestantes = Math.max(0, diasIncubacionTotal - dias);
  const progreso = Math.min(1, diasClamped / diasIncubacionTotal);
  const esLoteActivo = loteSeleccionado.estado === "Activa";


  const evaluacion = ultimaLectura
    ? evaluarLectura(ultimaLectura.temperatura, ultimaLectura.humedad, tipoHuevo)
    : null;

  const radio = 90;
  const circunferencia = 2 * Math.PI * radio;
  const offset = circunferencia * (1 - progreso);

  return (
    <div className="min-h-screen px-4 py-8 md:px-10 md:py-12 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <p className="text-muted text-xs tracking-widest uppercase font-mono-data">
            Panel de incubadora
          </p>
          <h1 className="font-display text-2xl md:text-3xl text-cream font-bold">
            {tipoHuevo?.nombre ?? "Lote"} · {loteSeleccionado.cantidad_huevos} huevos
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/nueva-incubacion"
            className="text-sm px-4 py-2 rounded-full border border-panel-border text-muted hover:text-cream hover:border-amber-glow transition-colors"
          >
            + Nuevo lote
          </Link>
          <button
            onClick={() => signOut()}
            className="text-sm px-4 py-2 rounded-full border border-panel-border text-muted hover:text-status-danger hover:border-status-danger transition-colors"
          >
            Salir
          </button>
        </div>
      </header>

      {/* Selector de lote: activo + historial */}
      <div className="mb-8 flex items-center gap-3 flex-wrap">
        <span className="text-muted text-xs uppercase tracking-widest font-mono-data">
          Lote:
        </span>
        <select
          value={loteSeleccionadoId ?? ""}
          onChange={(e) => setLoteSeleccionadoId(e.target.value)}
          className="input !w-auto text-sm py-2"
        >
          {lotes.map((l) => (
            <option key={l.id} value={l.id}>
              {l.tipos_huevo?.nombre ?? "Lote"} · {new Date(l.fecha_inicio).toLocaleDateString("es-PE")}
              {l.estado === "Activa" ? " · Activo" : " · Finalizada"}
            </option>
          ))}
        </select>
        {!esLoteActivo && (
          <>
          <span className="text-xs px-2.5 py-1 rounded-full border border-panel-border text-muted">
            Viendo un lote finalizado (solo lectura)
          </span>
          <button
            onClick={reactivarLote}
            className="text-xs px-3 py-1.5 rounded-full border border-amber-glow text-amber-glow hover:bg-amber-glow hover:text-panel-bg transition-colors" 
          >
            Reactivar este lote
          </button>
        </>
        )}
      </div>

      {esLoteActivo && alertasPendientes.length > 0 && (
        <div className="mb-8 flex flex-col gap-3">
          {alertasPendientes.map((alerta) => (
            <div
              key={alerta.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-status-danger/40 bg-status-danger/10 px-5 py-4"
            >
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full bg-status-danger animate-pulse shrink-0" />
                <p className="text-status-danger font-medium text-sm">{alerta.mensaje}</p>
              </div>
              <button
                onClick={() => resolverAlerta(alerta.id)}
                className="text-xs px-3 py-1.5 rounded-full border border-status-danger/50 text-status-danger hover:bg-status-danger/20 transition-colors shrink-0"
              >
                Marcar resuelta
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-panel-card border border-panel-border rounded-2xl p-8 flex flex-col items-center justify-center">
          <div className="relative w-[220px] h-[220px]">
            <svg width="220" height="220" viewBox="0 0 220 220" className="-rotate-90">
              <circle cx="110" cy="110" r={radio} fill="none" stroke="#3A2F27" strokeWidth="14" />
              <circle
                cx="110"
                cy="110"
                r={radio}
                fill="none"
                stroke="#E8A33D"
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={circunferencia}
                strokeDashoffset={offset}
                style={{ transition: "stroke-dashoffset 0.6s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
              <span className="font-mono-data text-5xl font-bold text-amber-glow">
                {diasRestantes}
              </span>
              <span className="text-muted text-[10px] uppercase tracking-widest mt-2 leading-tight">
                {esLoteActivo
                  ? diasRestantes === 1
                    ? "día para eclosionar"
                    : "días para eclosionar"
                  : "días duró la incubación"}
              </span>
            </div>
          </div>
          <div className="mt-10 text-center">
            <p className="text-muted text-xs uppercase tracking-widest font-mono-data">
              Fecha probable de eclosión
            </p>
            <p className="font-display text-xl text-cream mt-1">
              {fechaEclosion.toLocaleDateString("es-PE", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-panel-card border border-panel-border rounded-2xl p-6">
            <p className="text-muted text-xs uppercase tracking-widest font-mono-data mb-1">
              Fase actual (día {diasClamped + (dias < diasIncubacionTotal ? 1 : 0)} de {diasIncubacionTotal})
            </p>
            <p className="font-display text-lg text-cream">{fase}</p>
            <div className="mt-3 h-1.5 w-full rounded-full bg-panel-border overflow-hidden">
              <div className="h-full bg-amber-glow rounded-full" style={{ width: `${progreso * 100}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <MetricCard
              label="Temperatura"
              valor={ultimaLectura ? `${ultimaLectura.temperatura}°C` : "—"}
              ok={evaluacion?.temperaturaOk}
              rango={evaluacion ? `${evaluacion.rango.tempMin}–${evaluacion.rango.tempMax}°C` : null}
            />
            <MetricCard
              label="Humedad"
              valor={ultimaLectura ? `${ultimaLectura.humedad}%` : "—"}
              ok={evaluacion?.humedadOk}
              rango={evaluacion ? `${evaluacion.rango.humMin}–${evaluacion.rango.humMax}%` : null}
            />
          </div>

          <div className="bg-panel-card border border-panel-border rounded-2xl p-6 flex items-center justify-between">
            <div>
              <p className="text-muted text-xs uppercase tracking-widest font-mono-data mb-1">
                Último movimiento (PIR)
              </p>
              <p className="font-display text-cream">
                {ultimaLectura?.movimiento ? "Detectado" : "Sin detectar"}
              </p>
            </div>
            <span className={`h-3 w-3 rounded-full ${ultimaLectura?.movimiento ? "bg-status-ok" : "bg-muted"}`} />
          </div>
        </div>
      </div>

      <div className="bg-panel-card border border-panel-border rounded-2xl p-6 flex items-center justify-between">
          <div>
            <p className="text-muted text-xs uppercase tracking-widest front-mono-data mb-1">
              Estado de la puerta
            </p>
            <p className={`font-display ${ultimaLectura?.puerta_abierta ? "text-status-warn" : "text-cream"}`}>
              {ultimaLectura?.puerta_abierta ? "Abierta" : "Cerrada"}
            </p>
          </div>
          <span
            className={`h-3 w-3 rounded-full ${
              ultimaLectura?.puerta_abierta ? "bg-status-warn" : "bg-status-ok"
            }`}
          />
      </div>

      <div className="mt-10">
        <h2 className="font-display text-lg text-cream mb-4">Lecturas recientes</h2>
        <div className="bg-panel-card border border-panel-border rounded-2xl overflow-hidden">
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm font-mono-data">
              <thead className="sticky top-0 bg-panel-card">
                <tr className="text-muted text-xs uppercase tracking-wider border-b border-panel-border">
                  <th className="text-left px-5 py-3">Hora</th>
                  <th className="text-left px-5 py-3">Temp.</th>
                  <th className="text-left px-5 py-3">Humedad</th>
                  <th className="text-left px-5 py-3">Movimiento</th>
                  <th className="text-left px-5 py-3">Puerta</th>
                </tr>
              </thead>
              <tbody>
              {historial.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-muted text-center">
                    Aún no llegan datos del sensor.
                  </td>
                </tr>
              )}
              {historial.map((l) => (
                <tr key={l.id} className="border-b border-panel-border/50 text-cream">
                  <td className="px-5 py-3">
                    {new Date(l.fecha_hora).toLocaleString("es-PE", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-5 py-3">{l.temperatura}°C</td>
                  <td className="px-5 py-3">{l.humedad}%</td>
                  <td className="px-5 py-3">{l.movimiento ? "Sí" : "No"}</td>
                  <td className="px-5 py-3">{l.puerta_abierta ? "Abierta" : "Cerrada"}</td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-6 text-center">
        <p className="text-muted text-xs font-mono-data">
          ID de este lote (para el ESP32):{" "}
          <span className="text-cream select-all">{loteSeleccionado.id}</span>
        </p>
      </div>
    </div>
  );
}

function MetricCard({ label, valor, ok, rango }) {
  const color = ok === undefined || ok === null ? "text-muted" : ok ? "text-status-ok" : "text-status-danger";
  return (
    <div className="bg-panel-card border border-panel-border rounded-2xl p-6">
      <p className="text-muted text-xs uppercase tracking-widest font-mono-data mb-1">{label}</p>
      <p className={`font-mono-data text-3xl font-bold ${color}`}>{valor}</p>
      {rango && <p className="text-muted text-xs mt-1">Ideal: {rango}</p>}
    </div>
  );
}

async function verificarYRegistrarAlertas(lote, lectura, dias, diasIncubacionTotal, ultimoMovimiento) {
  const candidatos = [];

  if (calcularAlertaVolteo(dias, diasIncubacionTotal, ultimoMovimiento)) {
    candidatos.push({
      tipo: "volteo",
      mensaje: "Los huevos llevan varias horas sin voltearse.",
    });
  }

  if (necesitaAlertaTemperaturaAlta(lectura.temperatura)) {
    candidatos.push({
      tipo: "temperatura_alta",
      mensaje: `Temperatura máxima alcanzada: ${lectura.temperatura}°C (límite: 39°C)`,
    });
  }

  if (necesitaAlertaHumedadBaja(lectura.humedad)) {
    candidatos.push({
      tipo: "humedad_baja",
      mensaje: `Humedad por debajo del mínimo: ${lectura.humedad}% (límite: 55%)`,
    });
  }

  for (const candidato of candidatos) {
    const { data: existente } = await supabase
      .from("alertas")
      .select("id")
      .eq("incubacion_id", lote.id)
      .eq("tipo", candidato.tipo)
      .eq("estado", "Pendiente")
      .limit(1)
      .maybeSingle();

    if (!existente) {
      await supabase.from("alertas").insert({
        incubacion_id: lote.id,
        tipo: candidato.tipo,
        mensaje: candidato.mensaje,
        estado: "Pendiente",
      });
    }
  }
}
