"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Grid, Camera, Users, AlertTriangle } from "lucide-react";

type Camara = {
  id: string;
  nombre: string;
  activa: boolean;
};

type CameraStats = {
  [camaraId: string]: {
    presentes: number;
    intrusos: number;
    fugados: number;
  }
};

export default function GridPage() {
  const [camaras, setCamaras] = useState<Camara[]>([]);
  const [stats, setStats] = useState<CameraStats>({});
  const [loading, setLoading] = useState(true);
  const [fecha, setFecha] = useState(() => {
    const d = new Date();
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split("T")[0];
  });

  useEffect(() => {
    fetchData();

    // Suscripción global a asistencias para actualizar el grid en vivo
    const channel = supabase
      .channel('grid-asistencia')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'asistencia' },
        (payload) => {
          console.log("Nuevo evento en grid:", payload.new);
          fetchData(); // Recargamos para simplificar, en prod sería mejor actualizar solo el estado local
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fecha]);

  const fetchData = async () => {
    setLoading(true);
    // 1. Obtener todas las cámaras
    const { data: camData } = await supabase.from("camaras").select("*").order("id");
    if (camData) setCamaras(camData);

    // 2. Obtener cursos vinculados
    const { data: curData } = await supabase.from("cursos").select("*");
    
    // 3. Obtener asistencias del día actual
    const { data: asisData } = await supabase
      .from("asistencia")
      .select("estado, curso_id")
      .eq("fecha", fecha);

    if (camData && curData && asisData) {
      const newStats: CameraStats = {};
      camData.forEach(cam => {
        newStats[cam.id] = { presentes: 0, intrusos: 0, fugados: 0 };
        const cursoVinculado = curData.find(c => c.camara_id === cam.id);
        if (cursoVinculado) {
          const eventosCamara = asisData.filter(a => a.curso_id === cursoVinculado.id);
          eventosCamara.forEach(ev => {
            let estado = ev.estado;
            if (estado === "Atrasado") estado = "Presente";
            if (estado === "Presente") newStats[cam.id].presentes++;
            if (estado === "Intruso") newStats[cam.id].intrusos++;
            if (estado === "Fugado") newStats[cam.id].fugados++;
          });
        }
      });
      setStats(newStats);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-10 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center">
            <Grid className="w-6 h-6 mr-3 text-blue-400" />
            Grid Multi-Cámara
          </h1>
          <p className="text-slate-400 mt-1">
            Visualización general de todas las zonas monitoreadas en tiempo real.
          </p>
        </div>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white rounded-xl p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        {loading ? (
          <div className="col-span-full text-center text-slate-500 py-12">Cargando monitoreo global...</div>
        ) : camaras.map(cam => {
          const camStats = stats[cam.id] || { presentes: 0, intrusos: 0, fugados: 0 };
          const hasAlerts = camStats.intrusos > 0 || camStats.fugados > 0;
          
          return (
            <div key={cam.id} className={`bg-slate-800 rounded-2xl border-2 overflow-hidden transition-all duration-300 ${hasAlerts ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'border-slate-700'}`}>
              <div className={`p-4 flex justify-between items-center ${hasAlerts ? 'bg-red-500/10' : 'bg-slate-900/50'}`}>
                <div className="flex items-center space-x-3">
                  <Camera className={`w-5 h-5 ${hasAlerts ? 'text-red-400' : 'text-slate-400'}`} />
                  <div>
                    <h3 className="font-bold text-white">{cam.id}</h3>
                    <p className="text-xs text-slate-400">{cam.nombre}</p>
                  </div>
                </div>
                <div className={`flex items-center space-x-2 px-2 py-1 rounded text-xs font-medium ${
                  cam.activa ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-slate-700 text-slate-400"
                }`}>
                  <div className={`w-2 h-2 rounded-full ${cam.activa ? "bg-green-400 animate-pulse" : "bg-slate-500"}`}></div>
                  <span>{cam.activa ? "LIVE" : "OFFLINE"}</span>
                </div>
              </div>
              
              <div className="p-8 grid grid-cols-3 gap-6">
                <div className="flex flex-col items-center justify-center bg-slate-900/50 rounded-xl p-5 border border-slate-700">
                  <span className="text-3xl font-bold text-blue-400">{camStats.presentes}</span>
                  <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold mt-1">Presentes</span>
                </div>
                <div className="flex flex-col items-center justify-center bg-slate-900/50 rounded-xl p-5 border border-slate-700">
                  <span className={`text-3xl font-bold ${camStats.intrusos > 0 ? 'text-red-500' : 'text-slate-300'}`}>{camStats.intrusos}</span>
                  <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold mt-1">Intrusos</span>
                </div>
                <div className="flex flex-col items-center justify-center bg-slate-900/50 rounded-xl p-5 border border-slate-700">
                  <span className={`text-3xl font-bold ${camStats.fugados > 0 ? 'text-orange-500' : 'text-slate-300'}`}>{camStats.fugados}</span>
                  <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold mt-1">Fugados</span>
                </div>
              </div>
              
              {hasAlerts && (
                <div className="bg-red-500/20 p-3 flex items-center justify-center text-red-400 text-sm font-medium border-t border-red-500/20">
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Alerta de seguridad activa
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
