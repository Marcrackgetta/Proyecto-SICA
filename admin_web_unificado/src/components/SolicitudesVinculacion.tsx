import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Users, CheckCircle, Clock } from "lucide-react";

export default function SolicitudesVinculacion() {
  const [solicitudes, setSolicitudes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSolicitudes();

    const channel = supabase
      .channel("solicitudes-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "solicitudes_vinculacion" },
        () => fetchSolicitudes()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchSolicitudes = async () => {
    const { data } = await supabase
      .from("solicitudes_vinculacion")
      .select("*")
      .eq("estado", "pendiente");
    
    if (data) setSolicitudes(data);
    setLoading(false);
  };

  const aprobarVinculacion = async (sol: any) => {
    if (
      !confirm(
        `¿Estás seguro de vincular al estudiante ${sol.nombre_estudiante} (CI: ${sol.cedula_estudiante}) con este representante?`
      )
    )
      return;

    await supabase
      .from("solicitudes_vinculacion")
      .update({ estado: "aprobada" })
      .eq("id", sol.id);

    await supabase
      .from("estudiantes")
      .update({
        nombre: sol.nombre_estudiante,
        representante_uid: sol.rep_uid,
      })
      .eq("cedula", sol.cedula_estudiante);
  };

  const rechazarVinculacion = async (sol: any) => {
    if (
      !confirm(
        `¿Estás seguro de RECHAZAR la solicitud de ${sol.nombre_rep} para el estudiante ${sol.cedula_estudiante}?`
      )
    )
      return;

    await supabase
      .from("solicitudes_vinculacion")
      .update({ estado: "rechazada" })
      .eq("id", sol.id);
  };

  return (
    <div className="bg-slate-800 rounded-2xl shadow-xl border border-slate-700 overflow-hidden mb-10">
      <div className="p-6 bg-slate-800/50 border-b border-slate-700 flex items-center">
        <Users className="w-5 h-5 mr-2 text-blue-400" />
        <h3 className="font-bold text-white">Solicitudes de Vinculación Pendientes</h3>
      </div>
      <div className="p-6">
        {loading ? (
          <div className="text-slate-500 text-sm">Cargando solicitudes...</div>
        ) : solicitudes.length === 0 ? (
          <div className="text-slate-500 text-sm">No hay solicitudes pendientes en el sistema.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {solicitudes.map((sol) => (
              <div
                key={sol.id}
                className="border border-slate-600 rounded-xl p-6 bg-slate-900/50 flex flex-col justify-between"
              >
                <div>
                  <div className="text-sm font-bold text-white mb-2 flex items-center">
                    <Clock className="w-4 h-4 mr-2 text-yellow-400" /> Representante
                  </div>
                  <div className="text-xs text-slate-400 mb-1">
                    <b className="text-slate-300">Nombre:</b> {sol.nombre_rep || "Sin Nombre"}
                  </div>
                  <div className="text-xs text-slate-400 mb-3">
                    <b className="text-slate-300">Correo:</b> {sol.correo_rep || "Sin Correo"}
                  </div>
                  
                  <div className="h-px bg-slate-700 w-full mb-3"></div>

                  <div className="text-sm font-bold text-white mb-2 flex items-center">
                    <CheckCircle className="w-4 h-4 mr-2 text-blue-400" /> Estudiante
                  </div>
                  <div className="text-xs text-slate-400 mb-1">
                    <b className="text-slate-300">Nombre:</b> {sol.nombre_estudiante || "Sin Nombre"}
                  </div>
                  <div className="text-xs text-slate-400 mb-4">
                    <b className="text-slate-300">Cédula:</b> {sol.cedula_estudiante || "Sin Cédula"}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 mt-4">
                  <button
                    onClick={() => rechazarVinculacion(sol)}
                    className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-medium py-3 px-5 rounded-lg transition-colors text-sm"
                  >
                    ✖ Rechazar
                  </button>
                  <button
                    onClick={() => aprobarVinculacion(sol)}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 px-5 rounded-lg transition-colors text-sm"
                  >
                    ✓ Aprobar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}