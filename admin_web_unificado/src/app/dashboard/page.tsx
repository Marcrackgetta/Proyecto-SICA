"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";
import {
  Activity,
  Users,
  MapPin,
  CheckCircle,
  XCircle,
  AlertTriangle,
  UserX,
  Clock,
  Camera,
  Download,
} from "lucide-react";

const MapComponent = dynamic(() => import("@/components/MapComponent"), { ssr: false });

export default function DashboardPage() {
  const [camaras, setCamaras] = useState<any[]>([]);
  const [camaraSel, setCamaraSel] = useState<string | null>(null);
  const [fecha, setFecha] = useState(() => {
    const d = new Date();
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split("T")[0];
  });
  const [jornada, setJornada] = useState("Matutina");
  const [horariosConfig, setHorariosConfig] = useState<any>(null);

  // Estados para la analítica
  const [totales, setTotales] = useState({
    Presente: 0,
    Falta: 0,
    Fugado: 0,
    Intruso: 0,
  });
  const [historialHoras, setHistorialHoras] = useState<any[]>([]);
  const [tablaRegistros, setTablaRegistros] = useState<any[]>([]);

  useEffect(() => {
    fetch("/horarios.json")
      .then((res) => res.json())
      .then((data) => setHorariosConfig(data))
      .catch((err) => console.error("Error cargando horarios:", err));
  }, []);

  useEffect(() => {
    fetchCamaras();

    const camarasChannel = supabase
      .channel("camaras-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "camaras" },
        (payload) => {
          fetchCamaras();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(camarasChannel);
    };
  }, []);

  useEffect(() => {
    if (camaraSel) {
      fetchEstadisticas(camaraSel, fecha, jornada);

      const channel = supabase
        .channel(`asistencia-channel-${camaraSel}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "asistencia" },
          () => {
            fetchEstadisticas(camaraSel, fecha, jornada);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [camaraSel, fecha, jornada, horariosConfig]);

  const fetchCamaras = async () => {
    const { data, error } = await supabase.from("camaras").select("*").order("id");
    if (error) {
      console.error("Error consultando camaras:", error);
      return;
    }
    if (data) {
      setCamaras(data);
    }
  };

  const fetchEstadisticas = async (camaraId: string, date: string, jornadaSel: string) => {
    setTotales({ Presente: 0, Falta: 0, Fugado: 0, Intruso: 0 });
    setHistorialHoras([]);
    setTablaRegistros([]);

    const { data: curso, error: errCurso } = await supabase
      .from("cursos")
      .select("id")
      .eq("camara_id", camaraId)
      .single();
    
    if (errCurso || !curso) return;

    let HORAS_CLASE: string[] = [];
    if (horariosConfig) {
      let tipo = horariosConfig.CURSOS_MAPPING?.[curso.id];
      if (curso.id === "Patio_Central") {
        tipo = jornadaSel === "Matutina" ? "BACH_MAT" : "VESP_BACH";
      } else {
        tipo = jornadaSel === "Matutina" ? "BACH_MAT" : "VESP_BACH";
      }
      
      const configHorario = horariosConfig.CONFIGURACIONES?.[tipo] || {};
      HORAS_CLASE = Object.keys(configHorario);
    } else {
      HORAS_CLASE = ["Hora_1", "Hora_2", "Hora_3", "Hora_4", "Recreo", "Hora_5", "Hora_6", "Hora_7", "Hora_8"];
    }

    const { data: asistencia, error: errAsist } = await supabase
      .from("asistencia_diaria")
      .select(
        "estado_llegada, estado_ubicacion, hora_llegada, ultima_actualizacion, estudiante_cedula, estudiantes(nombre, curso_id)"
      )
      .eq("fecha", date);

    if (errAsist) return;

    if (asistencia) {
      const counts = { Presente: 0, Falta: 0, Fugado: 0, Intruso: 0 };
      const horasData: Record<string, any> = {};
      
      HORAS_CLASE.forEach((h) => {
        horasData[h] = {
          name: h.replace("_", " "),
          Presente: 0,
          Falta: 0,
          Fugado: 0,
          Intruso: 0,
        };
      });

      const tablaTemp: any[] = [];

      asistencia.forEach((reg: any) => {
        // Filtro local simulando curso (en un multi-tenant real esto se filtra arriba)
        if (reg.estudiantes && reg.estudiantes.curso_id !== curso.id) return;

        let estadoLogico = reg.estado_ubicacion || reg.estado_llegada || 'Ausente';
        let estadoGrafica = estadoLogico as keyof typeof counts;
        
        if (estadoLogico.includes('Presente') || estadoLogico.includes('Atrasado') || estadoLogico.includes('clase')) {
            estadoGrafica = 'Presente';
        } else if (estadoLogico.includes('Fugado')) {
            estadoGrafica = 'Fugado';
        } else if (estadoLogico.includes('Intruso')) {
            estadoGrafica = 'Intruso';
        } else {
            estadoGrafica = 'Falta';
        }

        if (counts[estadoGrafica] !== undefined) counts[estadoGrafica]++;

        let mockHora = "Total del Día";
        if (!horasData[mockHora]) {
          horasData[mockHora] = { name: mockHora, Presente: 0, Falta: 0, Fugado: 0, Intruso: 0 };
        }
        if (horasData[mockHora][estadoGrafica] !== undefined) {
           horasData[mockHora][estadoGrafica]++;
        }

        tablaTemp.push({
          id: reg.ultima_actualizacion || Math.random().toString(),
          hora: "Llegada: " + (reg.hora_llegada ? new Date(reg.hora_llegada).toLocaleTimeString() : "--:--"),
          cedula: reg.estudiante_cedula,
          nombre: reg.estudiantes?.nombre || "Desconocido / Visitante",
          estado: estadoLogico,
          hora_registro: reg.ultima_actualizacion 
              ? new Date(reg.ultima_actualizacion).toLocaleTimeString() 
              : "Sin Hora",
        });
      });

      setTotales(counts);
      setHistorialHoras(Object.values(horasData));
      setTablaRegistros(tablaTemp.reverse());
    }
  };

  const camaraActiva = camaras.find((c) => c.id === camaraSel);

  const exportarCSV = () => {
    if (tablaRegistros.length === 0) {
      alert("No hay registros para exportar.");
      return;
    }
    const headers = ["Cédula", "Nombre", "Estado", "Hora de Registro", "Hora Escolar"];
    const rows = tablaRegistros.map(r => [
      r.cedula || "N/A",
      r.nombre || "Desconocido",
      r.estado,
      r.hora_registro,
      r.hora
    ]);
    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.map(cell => `"${cell}"`).join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `asistencia_${camaraSel}_${fecha}_${jornada}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="animate-fade-in w-full max-w-screen-2xl mx-auto h-full flex flex-col">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center">
            <Activity className="w-6 h-6 mr-3 text-blue-400" />
            Monitoría en Vivo
          </h1>
          <p className="text-slate-400 mt-1">Selecciona una cámara para analizar la telemetría en tiempo real.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 flex-1 items-start">
        {/* COLUMNA IZQUIERDA: Controles (Toma 3 de 12 columnas) */}
        <div className="xl:col-span-3 space-y-8 sticky top-4">
          
          {/* Card: Parámetros de Análisis */}
          <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-sm flex flex-col">
            <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center uppercase tracking-wide">
              <Clock className="w-4 h-4 mr-2 text-blue-400" /> Parámetros
            </h3>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Fecha</label>
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Jornada</label>
                <select
                  value={jornada}
                  onChange={(e) => setJornada(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="Matutina">Matutina (Mat)</option>
                  <option value="Vespertina">Vespertina (Vesp)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-3 mt-auto">
              <button
                onClick={() => camaraSel && fetchEstadisticas(camaraSel, fecha, jornada)}
                disabled={!camaraSel}
                className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium py-3 px-4 rounded-lg transition-colors"
              >
                <Activity className="w-4 h-4 mr-2" /> Sincronizar
              </button>
              <button
                onClick={exportarCSV}
                disabled={tablaRegistros.length === 0}
                className="w-full flex items-center justify-center bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-medium py-3 px-4 rounded-lg transition-colors border border-slate-600"
              >
                <Download className="w-4 h-4 mr-2" /> Exportar CSV
              </button>
            </div>
          </div>

          {/* Card: Selección de Cámara */}
          <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-sm">
            <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center uppercase tracking-wide">
              <Camera className="w-4 h-4 mr-2 text-blue-400" /> Selección de Nodo
            </h3>
            <div className="space-y-3">
              {camaras.map((cam) => (
                <button
                  key={cam.id}
                  onClick={() => setCamaraSel(cam.id)}
                  className={`w-full text-left px-5 py-4 rounded-xl border transition-all duration-200 flex flex-col gap-2 group ${
                    camaraSel === cam.id
                      ? "bg-blue-600/10 border-blue-500 text-white"
                      : "bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center">
                      <Camera className={`w-4 h-4 mr-3 ${camaraSel === cam.id ? "text-blue-400" : "text-slate-500"}`} />
                      <span className="font-bold text-sm truncate">{cam.id}</span>
                    </div>
                    {cam.activa ? (
                      <span className="flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                      </span>
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-slate-600"></span>
                    )}
                  </div>
                  <span className={`text-xs ml-7 truncate ${camaraSel === cam.id ? "text-blue-200" : "text-slate-500"}`}>
                    {cam.nombre}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Mapa de Ubicación (Solo si hay cámara) */}
          {camaraSel && (
            <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-sm overflow-hidden h-64 relative z-10">
               <MapComponent camaras={camaras} selectedCamaraId={camaraSel} onSelectCamara={setCamaraSel} />
               <div className="absolute top-3 right-3 z-[400] bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700 shadow-lg pointer-events-none">
                  <span className="text-xs font-bold text-slate-200 flex items-center">
                     <MapPin className="w-3 h-3 mr-1.5 text-blue-400" /> Ubicación
                  </span>
               </div>
            </div>
          )}
        </div>


        {/* COLUMNA DERECHA: Telemetría (Toma 9 de 12 columnas) */}
        <div className="xl:col-span-9 space-y-8">
          
          

          {camaraSel ? (
            <>
              {/* Tarjetas Estadísticas */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-sm flex flex-col justify-between h-32">
                  <div className="flex items-center text-green-400">
                    <CheckCircle className="w-5 h-5 mr-2" /> <span className="font-semibold text-sm uppercase tracking-wide">Presentes</span>
                  </div>
                  <div className="text-4xl font-black text-white">{totales.Presente}</div>
                </div>
                <div className="bg-slate-800 p-6 rounded-2xl border border-red-500/20 shadow-sm flex flex-col justify-between h-32">
                  <div className="flex items-center text-red-400">
                    <XCircle className="w-5 h-5 mr-2" /> <span className="font-semibold text-sm uppercase tracking-wide">Faltas</span>
                  </div>
                  <div className="text-4xl font-black text-white">{totales.Falta}</div>
                </div>
                <div className="bg-slate-800 p-6 rounded-2xl border border-yellow-500/20 shadow-sm flex flex-col justify-between h-32">
                  <div className="flex items-center text-yellow-400">
                    <AlertTriangle className="w-5 h-5 mr-2" /> <span className="font-semibold text-sm uppercase tracking-wide">Fugados</span>
                  </div>
                  <div className="text-4xl font-black text-white">{totales.Fugado}</div>
                </div>
                <div className="bg-slate-800 p-6 rounded-2xl border border-purple-500/20 shadow-sm flex flex-col justify-between h-32">
                  <div className="flex items-center text-purple-400">
                    <UserX className="w-5 h-5 mr-2" /> <span className="font-semibold text-sm uppercase tracking-wide">Intrusos</span>
                  </div>
                  <div className="text-4xl font-black text-white">{totales.Intruso}</div>
                </div>
              </div>

              {/* Gráfico Histórico */}
              <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-sm">
                <div className="mb-8">
                  <h3 className="text-lg font-bold text-white flex items-center">
                    <Activity className="w-5 h-5 mr-2 text-blue-400" />
                    Flujo de Detección a lo largo del Día
                  </h3>
                  <p className="text-slate-400 text-sm mt-1">Registros de los últimos movimientos confirmados.</p>
                </div>
                
                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={historialHoras}
                      margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis
                        dataKey="name"
                        stroke="#94a3b8"
                        fontSize={13}
                        tickLine={false}
                        axisLine={false}
                        dy={15}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={13}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                        dx={-10}
                      />
                      <Tooltip
                        cursor={{ fill: '#334155', opacity: 0.4 }}
                        contentStyle={{
                          backgroundColor: "#1e293b",
                          border: "1px solid #334155",
                          borderRadius: "12px",
                          color: "#f8fafc",
                          padding: "12px",
                          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)"
                        }}
                        itemStyle={{ fontSize: "14px", fontWeight: "500", paddingBottom: "4px" }}
                      />
                      <Legend wrapperStyle={{ paddingTop: "30px" }} iconType="circle" />
                      <Bar dataKey="Presente" stackId="a" fill="#22c55e" radius={[0, 0, 6, 6]} barSize={40} />
                      <Bar dataKey="Fugado" stackId="a" fill="#eab308" />
                      <Bar dataKey="Falta" stackId="a" fill="#ef4444" />
                      <Bar dataKey="Intruso" stackId="a" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Tabla de Registros */}
              <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
                  <div>
                    <h3 className="font-bold text-white text-lg">Registro Detallado</h3>
                    <p className="text-slate-400 text-sm mt-1">Bitácora completa de movimientos en la zona.</p>
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-400 uppercase tracking-wider bg-slate-900/50">
                      <tr>
                        <th className="px-6 py-4 font-semibold">Hora Escolar</th>
                        <th className="px-6 py-4 font-semibold">Estudiante</th>
                        <th className="px-6 py-4 font-semibold">Estado</th>
                        <th className="px-6 py-4 font-semibold">Hora Real de Captura</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {tablaRegistros.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-700/30 transition-colors">
                          <td className="px-6 py-5 font-medium text-slate-300">
                            {row.hora}
                          </td>
                          <td className="px-6 py-5">
                            <div className="font-bold text-white">{row.nombre}</div>
                            <div className="text-xs text-slate-500 mt-1 font-mono">{row.cedula}</div>
                          </td>
                          <td className="px-6 py-5">
                            <span
                              className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide ${
                                row.estado === "Presente"
                                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                                  : row.estado === "Falta"
                                    ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                    : row.estado === "Fugado"
                                      ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                                      : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                              }`}
                            >
                              {row.estado}
                            </span>
                          </td>
                          <td className="px-6 py-5 text-slate-400 font-medium">
                            {row.hora_registro}
                          </td>
                        </tr>
                      ))}
                      {tablaRegistros.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                            No hay registros almacenados para esta fecha y cámara.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="h-[600px] flex flex-col items-center justify-center bg-slate-800/30 border-2 border-dashed border-slate-700 rounded-3xl text-slate-500 p-8">
              <Camera className="w-20 h-20 mb-6 opacity-30 text-blue-500" />
              <h3 className="text-2xl font-bold text-slate-400 mb-3">Ningún Nodo Seleccionado</h3>
              <p className="text-center max-w-md text-slate-500 leading-relaxed">
                Selecciona una cámara en el panel izquierdo para cargar la telemetría en vivo, estadísticas y flujo de movimiento.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
