/**
 * Lógica central de la incubadora.
 * Funciones puras (sin base de datos), reutilizables en frontend y backend.
 * Ajustado al esquema con tablas: perfiles, incubadoras, tipos_huevo,
 * incubaciones, lecturas_sensor, alertas.
 */

// A partir de qué día (contando hacia atrás desde la eclosión) ya NO se
// deben voltear los huevos y se sube la humedad (fase de nacimiento).
const DIAS_SIN_VOLTEO_ANTES_DE_ECLOSION = 3;

// Cada cuántas horas como máximo debería haber un volteo detectado (PIR).
const HORAS_MAX_SIN_VOLTEO = 8;

// Tolerancias para considerar una lectura "dentro de rango"
const TOLERANCIA_TEMP = 0.4; // °C
const TOLERANCIA_HUM = 5; // %

/**
 * Calcula la fecha probable de eclosión a partir de la fecha de inicio.
 */
export function calcularFechaEclosion(fechaInicio, diasIncubacion) {
  const inicio = new Date(fechaInicio);
  const eclosion = new Date(inicio);
  eclosion.setDate(eclosion.getDate() + diasIncubacion);
  return eclosion;
}

/**
 * Días completos transcurridos desde el inicio hasta "ahora".
 */
export function diasTranscurridos(fechaInicio, ahora = new Date()) {
  const inicio = new Date(fechaInicio);
  const diffMs = ahora.getTime() - inicio.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Determina la fase de incubación según el día actual, escalado sobre
 * el total de días de ese tipo de huevo (tipos_huevo.dias_incubacion).
 */
export function calcularFaseIncubacion(diasActuales, diasIncubacionTotal) {
  if (diasActuales < 0) return "Sin iniciar";
  if (diasActuales >= diasIncubacionTotal) return "Eclosión / nacida";

  const proporcion = diasActuales / diasIncubacionTotal;

  if (proporcion < 1 / 3) {
    return `Fase 1 - Desarrollo inicial (día ${diasActuales + 1})`;
  } else if (proporcion < 2 / 3) {
    return `Fase 2 - Desarrollo medio (día ${diasActuales + 1})`;
  } else if (diasIncubacionTotal - diasActuales > DIAS_SIN_VOLTEO_ANTES_DE_ECLOSION) {
    return `Fase 3 - Desarrollo final (día ${diasActuales + 1})`;
  } else {
    return `Fase 4 - Nacimiento próximo, NO voltear (día ${diasActuales + 1})`;
  }
}

/** ¿Estamos en la fase final donde ya no se voltea? */
export function enFaseDeNacimiento(diasActuales, diasIncubacionTotal) {
  return diasIncubacionTotal - diasActuales <= DIAS_SIN_VOLTEO_ANTES_DE_ECLOSION;
}

/**
 * Decide si se debe generar una alerta de volteo.
 */
export function calcularAlertaVolteo(
  diasActuales,
  diasIncubacionTotal,
  ultimoMovimientoDetectado = null,
  ahora = new Date()
) {
  if (enFaseDeNacimiento(diasActuales, diasIncubacionTotal)) return false;

  if (!ultimoMovimientoDetectado) return true;

  const horasSinVolteo =
    (ahora.getTime() - new Date(ultimoMovimientoDetectado).getTime()) / (1000 * 60 * 60);

  return horasSinVolteo >= HORAS_MAX_SIN_VOLTEO;
}

/**
 * Evalúa si una lectura de temperatura/humedad está dentro del rango ideal,
 * usando los valores de la fila de tipos_huevo correspondiente.
 * humedad_inicial se usa durante el desarrollo, humedad_final durante
 * la fase de nacimiento (los últimos días, más humedad).
 */
export function evaluarLectura(temperatura, humedad, tipoHuevo, enNacimiento = false) {
  const humedadObjetivo = enNacimiento
    ? Number(tipoHuevo.humedad_final)
    : Number(tipoHuevo.humedad_inicial);
  const tempIdeal = Number(tipoHuevo.temperatura_ideal);

  const tempMin = tempIdeal - TOLERANCIA_TEMP;
  const tempMax = tempIdeal + TOLERANCIA_TEMP;
  const humMin = humedadObjetivo - TOLERANCIA_HUM;
  const humMax = humedadObjetivo + TOLERANCIA_HUM;

  return {
    temperaturaOk: temperatura >= tempMin && temperatura <= tempMax,
    humedadOk: humedad >= humMin && humedad <= humMax,
    rango: {
      tempMin: tempMin.toFixed(1),
      tempMax: tempMax.toFixed(1),
      humMin,
      humMax,
    },
  };
}
