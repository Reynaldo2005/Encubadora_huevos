/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./lib/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        panel: {
          bg: "#1A1512",      // fondo principal, carbón cálido
          card: "#241D18",    // paneles / tarjetas
          border: "#3A2F27",  // bordes sutiles
        },
        amber: {
          glow: "#E8A33D",    // acento principal, luz de calor
          soft: "#F2C879",
        },
        status: {
          ok: "#6B9B5E",      // verde: parámetros correctos
          warn: "#D9A441",    // ámbar: precaución
          danger: "#C4453D",  // rojo: alerta
        },
        cream: "#F2E9DC",     // texto principal
        muted: "#8A7F72",     // texto secundario
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
