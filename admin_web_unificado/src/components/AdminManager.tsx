import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Shield, Mail, Lock } from "lucide-react";

export default function AdminManager() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg("⏳ Creando administrador...");

    // Nota: en Supabase cliente, signUp inicia sesión automáticamente al usuario nuevo
    // a menos que se use supabase.auth.admin (requiere Service Role Key en el servidor).
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setMsg(`❌ Error: ${error.message}`);
    } else {
      setMsg("✅ Administrador creado exitosamente (Por favor verifica el correo si es necesario).");
      setEmail("");
      setPassword("");
    }
    setLoading(false);
  };

  return (
    <div className="bg-slate-800 rounded-2xl shadow-xl border border-slate-700 overflow-hidden mt-6 mb-6">
      <div className="p-4 bg-slate-800/50 border-b border-slate-700 flex items-center">
        <Shield className="w-5 h-5 mr-2 text-purple-400" />
        <h3 className="font-bold text-white">Gestión de Accesos Administrativos</h3>
      </div>
      <div className="p-4">
        <p className="text-sm text-slate-400 mb-4">
          Registra nuevos usuarios con permisos para acceder a esta consola a través de Supabase Auth.
        </p>
        <form onSubmit={handleCreate} className="flex flex-col md:flex-row gap-4 items-start">
          <div className="relative flex-1 w-full">
            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="email"
              placeholder="Correo electrónico"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
            />
          </div>
          <div className="relative flex-1 w-full">
            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="password"
              placeholder="Contraseña"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full md:w-auto bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Creando..." : "Crear Acceso"}
          </button>
        </form>
        {msg && (
          <div className={`mt-4 text-sm font-medium ${msg.includes("✅") ? "text-emerald-400" : msg.includes("❌") ? "text-red-400" : "text-blue-400"}`}>
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}