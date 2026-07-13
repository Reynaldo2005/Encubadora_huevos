import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import {
  diasTranscurridos,
  calcularFaseIncubacion,
  calcularAlertaVolteo,
} from "@/lib/incubacionLogic";

/**
 * POST /api/sensor
 * Body esperado (JSON), lo que manda el ESP32 cada X minutos:
 * {
 *   "incubacion_id": "uuid-del-lote-activo",
 *   "temperatura": 37.6,
 *   "humedad": 55.2,
 *   "movimiento": true,      // PIR detectó volteo/movimiento
 *   "fecha_hora": "2026-07-06T10:00:00Z"   // opcional, si no se manda usa "ahora"
 * }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { incubacion_id, temperatura, humedad, movimiento, puerta_abierta } = body;
    const fecha_hora = body.fecha_hora ? new Date(body.fecha_hora) : new Date();

    if (!incubacion_id || temperatura === undefined || humedad === undefined) {
      return NextResponse.json(
        { error: "Faltan campos: incubacion_id, temperatura, humedad son obligatorios" },
        { status: 400 }
      );
    }

    // 1. Traer la incubación + su tipo de huevo (para días totales y fecha_inicio)
    const { data: incubacion, error: errorIncubacion } = await supabase
      .from("incubaciones")
      .select("*, tipos_huevo(*)")
      .eq("id", incubacion_id)
      .single();

    if (errorIncubacion || !incubacion) {
      return NextResponse.json(
        { error: "No se encontró la incubación indicada" },
        { status: 404 }
      );
    }

    const diasIncubacionTotal = incubacion.tipos_huevo?.dias_incubacion ?? 21;
    const diasActuales = diasTranscurridos(incubacion.fecha_inicio, fecha_hora);
    const fase = calcularFaseIncubacion(diasActuales, diasIncubacionTotal);

    // 2. Buscar la última vez que hubo movimiento=true, para saber hace cuánto no se voltea
    const { data: ultimoMovimiento } = await supabase
      .from("lecturas_sensor")
      .select("fecha_hora")
      .eq("incubacion_id", incubacion_id)
      .eq("movimiento", true)
      .order("fecha_hora", { ascending: false })
      .limit(1)
      .maybeSingle();

    const necesitaVolteo = calcularAlertaVolteo(
      diasActuales,
      diasIncubacionTotal,
      ultimoMovimiento?.fecha_hora ?? null,
      fecha_hora
    );

    // 3. Guardar la lectura del sensor
    const { data: nuevaLectura, error: errorInsert } = await supabase
      .from("lecturas_sensor")
      .insert({
        incubacion_id,
        fecha_hora: fecha_hora.toISOString(),
        temperatura,
        humedad,
        movimiento: !!movimiento,
        puerta_abierta: !!puerta_abierta,
      })
      .select()
      .single();

    if (errorInsert) {
      return NextResponse.json({ error: errorInsert.message }, { status: 500 });
    }

    // 4. Si hace falta volteo, registrar una alerta (evitando duplicar si ya hay una pendiente)
    let alertaCreada = null;
    if (necesitaVolteo) {
      const { data: alertaPendiente } = await supabase
        .from("alertas")
        .select("id")
        .eq("incubacion_id", incubacion_id)
        .eq("tipo", "volteo")
        .eq("estado", "Pendiente")
        .maybeSingle();

      if (!alertaPendiente) {
        const { data: nuevaAlerta } = await supabase
          .from("alertas")
          .insert({
            incubacion_id,
            tipo: "volteo",
            mensaje: "Los huevos llevan varias horas sin voltearse.",
            estado: "Pendiente",
          })
          .select()
          .single();
        alertaCreada = nuevaAlerta;
      }
    }

    return NextResponse.json({
      ok: true,
      lectura: nuevaLectura,
      fase_incubacion: fase,
      alerta_volteo: necesitaVolteo,
      alerta_creada: alertaCreada,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/sensor?incubacion_id=xxx
 * Devuelve las últimas 50 lecturas de un lote, útil para pruebas rápidas.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const incubacion_id = searchParams.get("incubacion_id");

  if (!incubacion_id) {
    return NextResponse.json({ error: "Falta incubacion_id" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("lecturas_sensor")
    .select("*")
    .eq("incubacion_id", incubacion_id)
    .order("fecha_hora", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ lecturas: data });
}
