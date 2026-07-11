"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [modo, setModo] = useState("login"); // "login" | "registro"
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    setMensaje(null);

    if (modo === "registro") {
      const { error: errSignUp } = await supabase.auth.signUp({
        email: correo,
        password,
        options: {
          data: {
            nombre,
            nombre_usuario: correo.split("@")[0],
          },
        },
      });

      setCargando(false);

      if (errSignUp) {
        setError(errSignUp.message);
        return;
      }

      setMensaje(
        "Cuenta creada. Si tu proyecto pide confirmación por correo, revisa tu bandeja de entrada antes de iniciar sesión."
      );
      setModo("login");
      return;
    }

    const { error: errSignIn } = await supabase.auth.signInWithPassword({
      email: correo,
      password,
    });

    setCargando(false);

    if (errSignIn) {
      setError(errSignIn.message);
      return;
    }

    router.push("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <p className="text-muted text-xs tracking-widest uppercase font-mono-data mb-1 text-center">
          Incubadora IoT
        </p>
        <h1 className="font-display text-2xl text-cream font-bold mb-8 text-center">
          {modo === "login" ? "Iniciar sesión" : "Crear cuenta"}
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {modo === "registro" && (
            <Campo label="Nombre">
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="input"
                required
              />
            </Campo>
          )}

          <Campo label="Correo">
            <input
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              className="input"
              required
            />
          </Campo>

          <Campo label="Contraseña">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              minLength={6}
              required
            />
          </Campo>

          {error && <p className="text-status-danger text-sm">{error}</p>}
          {mensaje && <p className="text-status-ok text-sm">{mensaje}</p>}

          <button
            type="submit"
            disabled={cargando}
            className="mt-2 px-5 py-3 rounded-full bg-amber-glow text-panel-bg font-display font-bold hover:bg-amber-soft transition-colors disabled:opacity-50"
          >
            {cargando
              ? "Un momento..."
              : modo === "login"
              ? "Entrar"
              : "Registrarme"}
          </button>
        </form>

        <button
          onClick={() => {
            setModo(modo === "login" ? "registro" : "login");
            setError(null);
            setMensaje(null);
          }}
          className="mt-5 text-sm text-muted hover:text-cream transition-colors w-full text-center"
        >
          {modo === "login"
            ? "¿No tienes cuenta? Regístrate"
            : "¿Ya tienes cuenta? Inicia sesión"}
        </button>
      </div>

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
      <span className="text-muted text-xs uppercase tracking-widest font-mono-data">
        {label}
      </span>
      {children}
    </label>
  );
}
