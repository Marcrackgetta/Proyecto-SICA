"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Shield, Mail, Lock, UserPlus, Info } from "lucide-react";

export default function AccesosPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg({ text: "Procesando solicitud...", type: "info" });

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          rol: "admin",
        },
      },
    });

    if (error) {
      setMsg({ text: error.message, type: "error" });
    } else {
      setMsg({ 
        text: "¡Administrador creado con éxito! Se ha registrado en el sistema correctamente.", 
        type: "success" 
      });
      setEmail("");
      setPassword("");
    }
    setLoading(false);
  };

  return (
    <div className="animate-fade-in w-full max-w-4xl mx-auto flex flex-col space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center">
          <Shield className="w-6 h-6 mr-3 text-blue-400" />
          Gestión de Accesos
        </h1>
        <p className="text-slate-400 mt-1">
          Administra las credenciales y crea nuevos usuarios con privilegios administrativos para este panel.
        </p>
      </div>

      <div className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl">
        <div className="flex items-start mb-6">
          <div className="bg-blue-600/20 p-3 rounded-2xl mr-4">
            <UserPlus className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Nuevo Administrador</h2>
            <p className="text-sm text-slate-400 mt-1">
              Las credenciales creadas aquí tendrán acceso total al sistema de Monitoría y edición de bases de datos.
            </p>
          </div>
        </div>

        <form onSubmit={handleCreateAdmin} className="space-y-6 max-w-xl">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Correo Electrónico</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="email"
                placeholder="ejemplo@colegio.edu.ec"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-xl pl-12 pr-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Contraseña Temporal</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="password"
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-xl pl-12 pr-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-500/20"
          >
            {loading ? "Creando Credenciales..." : "Crear Administrador"}
          </button>
        </form>

        {msg && (
          <div className={`mt-8 p-4 rounded-xl flex items-start border ${
            msg.type === "success" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
            msg.type === "error" ? "bg-red-500/10 border-red-500/30 text-red-400" :
            "bg-blue-500/10 border-blue-500/30 text-blue-400"
          }`}>
            <Info className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{msg.text}</p>
          </div>
        )}
      </div>
    </div>
  );
}
