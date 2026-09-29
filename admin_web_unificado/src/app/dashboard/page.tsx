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
          { event: "*", schema: "public", table: "historial_eventos" },
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

    // Obtener total de estudiantes matriculados en el curso para calcular Faltas y agregarlos a la tabla
    const { data: todosEstudiantes, count: totalEstudiantes } = await supabase
      .from("estudiantes")
      .select("cedula, nombre", { count: 'exact' })
      .eq("curso_id", curso.id);

    // Obtener Asistencia Diaria (Solo para el contador de Presentes reales)
    const { data: asistencia, error: errAsist } = await supabase
      .from("asistencia_diaria")
      .select("estudiante_cedula, estudiantes!inner(curso_id)")
      .eq("fecha", date)
      .eq("estudiantes.curso_id", curso.id);

    // Obtener Historial de Eventos (Timeline) para la grafica por horas y tabla de registros
    // Se trae camara_id para poder asociar los intrusos a la camara donde fueron detectados físicamente.
    const { data: eventosBrutos, error: errEventos } = await supabase
      .from("historial_eventos")
      .select("id, estado_consolidado, timestamp_evento, estudiante_cedula, camara_id, estudiantes!inner(nombre, curso_id)")
      .eq("fecha", date)
      .order("timestamp_evento", { ascending: true });

    if (errAsist) return;

    // Filtro condicional:
    // - Intruso -> Pertenece a la camara_id donde ocurrio la deteccion.
    // - Otros (Presente, Fugado, etc) -> Pertenecen al curso de origen del estudiante.
    const eventos = (eventosBrutos || []).filter((ev: any) => {
      if (ev.estado_consolidado === 'Intruso') {
        return ev.camara_id === camaraId;
      } else {
        return ev.estudiantes?.curso_id === curso.id;
      }
    });

    const counts = { Presente: 0, Falta: 0, Fugado: 0, Intruso: 0 };
    const tablaTemp: any[] = [];

    // 1. Contar los Presentes oficiales basados en asistencia_diaria (un registro por estudiante por dia)
    if (asistencia) {
      counts.Presente = asistencia.length;
    }

    // Calcular Faltas reales
    counts.Falta = Math.max(0, (totalEstudiantes || 0) - counts.Presente);

    // 2. Procesar Eventos Historicos (Grafico y Tabla)
    const horasData: Record<string, any> = {};
    
    // Determinar el Tipo de Horario y Bloques Oficiales basado estrictamente en horarios.json
    let tipo = null;
    let configHorario: any = null;
    let blocks: { key: string, inicioMin: number, finMin: number, name: string }[] = [];
    
    if (horariosConfig && horariosConfig.CURSOS_MAPPING) {
      tipo = horariosConfig.CURSOS_MAPPING[curso.id];
      if (tipo && horariosConfig.CONFIGURACIONES[tipo]) {
        configHorario = horariosConfig.CONFIGURACIONES[tipo];
        
        // Convertir cada bloque configurado a un objeto evaluable (minutos desde las 00:00)
        Object.keys(configHorario).forEach(k => {
           let inicioStr = configHorario[k].inicio.split(':');
           let finStr = configHorario[k].fin.split(':');
           blocks.push({
             key: k,
             name: k.replace("_", " "),
             inicioMin: parseInt(inicioStr[0]) * 60 + parseInt(inicioStr[1]),
             finMin: parseInt(finStr[0]) * 60 + parseInt(finStr[1])
           });
        });
      }
    }

    // Inicializar los buckets
    if (blocks.length > 0) {
      blocks.sort((a, b) => a.inicioMin - b.inicioMin);
      blocks.forEach(b => {
         horasData[b.key] = { name: b.name, Presente: 0, Falta: 0, Fugado: 0, Intruso: 0 };
      });
    } else {
      for (let i = 6; i <= 18; i++) {
        let hLabel = `${i.toString().padStart(2, '0')}:00`;
        horasData[hLabel] = { name: hLabel, Presente: 0, Falta: 0, Fugado: 0, Intruso: 0 };
      }
    }

    if (eventos && !errEventos) {
      eventos.forEach((ev: any) => {
        let estado = ev.estado_consolidado;
        let dt = new Date(ev.timestamp_evento);
        let timeInMins = dt.getHours() * 60 + dt.getMinutes();
        let matchedKey = null;

        // Registrar en la Tabla de Eventos Detallada
        let bloqueAsignado = "Detectado";
        if (blocks.length > 0) {
           let found = blocks.find(b => timeInMins >= b.inicioMin && timeInMins <= b.finMin);
           if (found) bloqueAsignado = found.name;
           else bloqueAsignado = "Fuera de hora";
        }
        
        tablaTemp.push({
          id: ev.id,
          hora: "Evento: " + bloqueAsignado,
          cedula: ev.estudiante_cedula,
          nombre: ev.estudiantes?.nombre || "Desconocido / Visitante",
          estado: estado,
          hora_registro: dt.toLocaleTimeString()
        });

        if (blocks.length > 0) {
          for (let b of blocks) {
             if (timeInMins >= b.inicioMin && timeInMins <= b.finMin) {
               matchedKey = b.key;
               break;
             }
          }
          if (!matchedKey) {
             let closest = blocks[0];
             let minDiff = 99999;
             for (let b of blocks) {
                let diff = Math.min(Math.abs(timeInMins - b.inicioMin), Math.abs(timeInMins - b.finMin));
                if (diff < minDiff) {
                   minDiff = diff;
                   closest = b;
                }
             }
             matchedKey = closest.key;
          }
        } else {
          matchedKey = `${dt.getHours().toString().padStart(2, '0')}:00`;
        }

        // Sumar contadores de eventos anómalos
        if (estado.includes('Fugado')) counts.Fugado++;
        if (estado.includes('Intruso')) counts.Intruso++;
        
        // Poblar grafica horaria
        if (horasData[matchedKey]) {
          if (estado.includes('Presente') || estado.includes('Atrasado') || estado.includes('clase')) {
            horasData[matchedKey].Presente++;
          } else if (estado.includes('Fugado')) {
            horasData[matchedKey].Fugado++;
          } else if (estado.includes('Intruso')) {
            horasData[matchedKey].Intruso++;
          }
        }
      });
    }

    // Anadir a los estudiantes con Falta a la Tabla de Registros y al CSV
    if (todosEstudiantes && asistencia) {
      const cedulasPresentes = new Set(asistencia.map((a: any) => a.estudiante_cedula));
      todosEstudiantes.forEach((est: any) => {
        if (!cedulasPresentes.has(est.cedula)) {
          tablaTemp.push({
            id: "falta-" + est.cedula,
            hora: "Ausente",
            cedula: est.cedula,
            nombre: est.nombre,
            estado: "Falta",
            hora_registro: "--:--"
          });
        }
      });
    }

    const arrHoras = Object.values(horasData);
    
    // Anadir el bloque "Total" al final del grafico
    arrHoras.push({
      name: "Total",
      Presente: counts.Presente,
      Falta: counts.Falta,
      Fugado: counts.Fugado,
      Intruso: counts.Intruso
    });

    setTotales(counts);
    setHistorialHoras(arrHoras);
    setTablaRegistros(tablaTemp.reverse());
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
