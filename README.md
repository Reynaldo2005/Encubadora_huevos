# Incubadora IoT — Panel de control

Aplicación web (Next.js + Supabase) para tu incubadora casera. Registras la
fecha en que metiste los huevos, la app calcula la fecha probable de
eclosión, y tu ESP32 le manda lecturas de temperatura, humedad y movimiento
(PIR) que se guardan en la base de datos junto con la fase de incubación y
la alerta de volteo, calculadas automáticamente.

## 1. Configurar Supabase

1. Entra a tu proyecto en [supabase.com](https://supabase.com).
2. Ve a **SQL Editor** → pega y ejecuta el contenido de `supabase/schema.sql`.
   Esto crea las tablas `perfiles`, `incubadoras`, `tipos_huevo`,
   `incubaciones`, `lecturas_sensor` y `alertas`.
3. En el mismo SQL Editor, ejecuta también `supabase/trigger_perfiles.sql`.
   Esto crea un trigger que, cada vez que alguien se registra en la app,
   automáticamente le crea su fila en `perfiles` (necesario porque
   `perfiles.id` está enlazado a `auth.users`).
4. Si ya habías insertado datos de prueba a mano en `perfiles` /
   `incubadoras` / `incubaciones` **antes** de tener login, corre
   `supabase/limpiar_datos_prueba.sql` para borrarlos (probablemente no
   tienen un usuario válido y van a chocar con las llaves foráneas).
5. Ejecuta también `supabase/politicas_auth.sql`. Esto reemplaza las
   políticas "modo desarrollo" (acceso abierto) por políticas que exigen
   estar logueado — necesario ahora que hay login real.
6. (Opcional pero recomendado para pruebas) En **Authentication → Providers
   → Email**, si quieres poder registrarte y entrar de inmediato sin
   confirmar correo, desactiva "Confirm email". Si lo dejas activado, tras
   registrarte te llegará un correo antes de poder entrar.
7. Ve a **Settings → API Keys** y copia:
   - `Project URL`
   - `Publishable key` (antes se llamaba `anon public key`)
   - `Secret key` (antes `service_role`) — la necesita el endpoint del ESP32

## 2. Configurar el proyecto localmente

```bash
cd incubadora-app
npm install
cp .env.local.example .env.local
```

Edita `.env.local` y pega tu URL y anon key de Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=https://tuproyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxxxx
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxxxx
```

⚠️ `SUPABASE_SERVICE_ROLE_KEY` nunca debe llevar el prefijo `NEXT_PUBLIC_`
— si lo lleva, quedaría expuesta en el navegador. Solo se usa dentro de
`app/api/sensor/route.js`, que corre en el servidor.

Corre el proyecto:

```bash
npm run dev
```

Abre http://localhost:3000

## 3. Uso

1. Al entrar por primera vez te pide **registrarte** (nombre, correo,
   contraseña). Eso crea tu usuario en Supabase Auth y, gracias al trigger,
   tu fila en `perfiles`.
2. Entra a **"+ Nuevo lote"**, elige tipo de huevo (gallina = 21 días), pon
   la fecha en que metiste los huevos, la cantidad, y guarda. La primera vez
   que haces esto, la app crea automáticamente tu `incubadora` en la base de
   datos (no hace falta que la crees a mano).
3. El dashboard principal (`/`) muestra:
   - Anillo de cuenta regresiva con días restantes y fecha de eclosión.
   - Fase actual de incubación (1 a 4, según el día).
   - Última temperatura y humedad, con color verde/rojo según si están en
     el rango ideal para gallina.
   - Alerta visual si los huevos llevan mucho tiempo sin voltearse.
   - Tabla con las últimas 10 lecturas del sensor.

## 4. Cómo debe mandar datos tu ESP32

Tu ESP32 (con DHT11 y PIR) debe hacer un `POST` cada cierto tiempo (por
ejemplo cada 15-30 minutos) a:

```
POST https://tu-app.vercel.app/api/sensor
Content-Type: application/json

{
  "incubacion_id": "UUID-del-lote-activo",
  "temperatura": 37.6,
  "humedad": 55.2,
  "movimiento": true
}
```

El `incubacion_id` lo copias directamente del dashboard (aparece al pie de
la pantalla principal una vez que tengas un lote activo), o de la tabla
`incubaciones` en Supabase.

El servidor se encarga de:
- Calcular en qué día de incubación estás (usando `fecha_inicio` y los
  `dias_incubacion` del tipo de huevo elegido).
- Calcular la fase (`Fase 1` a `Fase 4 - Nacimiento próximo`).
- Ver cuándo fue la última vez que `movimiento = true` y, si hace falta
  volteo, crear una fila en la tabla `alertas` (evitando duplicar alertas
  si ya hay una pendiente).
- Guardar la lectura en `lecturas_sensor`.

### Ejemplo de código Arduino (ESP32 + DHT11 + PIR)

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>

#define DHTPIN 4
#define DHTTYPE DHT11
#define PIRPIN 13

DHT dht(DHTPIN, DHTTYPE);

const char* ssid = "TU_WIFI";
const char* password = "TU_PASSWORD";
const char* serverUrl = "https://tu-app.vercel.app/api/sensor";
const char* incubacionId = "PEGA-AQUI-EL-UUID-DEL-LOTE";

void setup() {
  Serial.begin(115200);
  dht.begin();
  pinMode(PIRPIN, INPUT);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("Conectado a WiFi");
}

void loop() {
  float temperatura = dht.readTemperature();
  float humedad = dht.readHumidity();
  bool movimiento = digitalRead(PIRPIN) == HIGH;

  if (!isnan(temperatura) && !isnan(humedad)) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    String body = "{";
    body += "\"incubacion_id\":\"" + String(incubacionId) + "\",";
    body += "\"temperatura\":" + String(temperatura, 1) + ",";
    body += "\"humedad\":" + String(humedad, 1) + ",";
    body += "\"movimiento\":" + String(movimiento ? "true" : "false");
    body += "}";

    int httpCode = http.POST(body);
    Serial.println("Respuesta servidor: " + String(httpCode));
    http.end();
  }

  delay(15UL * 60UL * 1000UL); // esperar 15 minutos
}
```

## 5. Lógica de fases y volteo (gallina, 21 días)

| Días          | Fase                                  | ¿Se voltea? |
|---------------|----------------------------------------|-------------|
| 1–7           | Fase 1 — Desarrollo inicial            | Sí, cada pocas horas |
| 8–14          | Fase 2 — Desarrollo medio              | Sí |
| 15–18         | Fase 3 — Desarrollo final              | Sí |
| 19–21         | Fase 4 — Nacimiento próximo            | **No** (se sube humedad y se deja quieto) |

La alerta de volteo se activa si pasan **8 horas o más** sin que el PIR
detecte movimiento, y se desactiva automáticamente en la Fase 4 (donde no se
debe voltear). Puedes ajustar ese umbral en `lib/incubacionLogic.js`
(constante `HORAS_MAX_SIN_VOLTEO`).

## 6. Desplegar en Vercel

```bash
npm i -g vercel
vercel
```

En el panel de Vercel, agrega las mismas 3 variables de entorno
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`) en **Settings → Environment Variables**, igual
que hiciste con EcoTienda.

## Estructura del proyecto

```
incubadora-app/
├── app/
│   ├── page.js                     → Dashboard principal (requiere login)
│   ├── login/page.js               → Registro / inicio de sesión
│   ├── nueva-incubacion/           → Formulario de registro de lote
│   ├── api/sensor/route.js         → Endpoint que recibe datos del ESP32
│   ├── layout.js
│   └── globals.css
├── lib/
│   ├── supabaseClient.js           → Cliente de Supabase
│   ├── AuthContext.js              → Sesión de usuario (React Context)
│   └── incubacionLogic.js          → Cálculo de fase, fecha eclosión, alertas
│   └── supabaseAdmin.js             → Cliente con Secret key (solo servidor)
├── supabase/
│   ├── schema.sql                  → Esquema de la base de datos
│   ├── trigger_perfiles.sql        → Trigger: crea perfil al registrarse
│   ├── politicas_auth.sql          → Políticas RLS que exigen login
│   └── limpiar_datos_prueba.sql    → Borra datos de prueba insertados a mano
└── .env.local.example
```
