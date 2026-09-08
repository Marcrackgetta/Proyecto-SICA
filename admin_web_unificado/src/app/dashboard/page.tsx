"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  LogOut,
  Activity,
  Users,
  MapPin,
  CheckCircle,
  XCircle,
  AlertTriangle,
  UserX,
  Clock,
  Camera,
} from "lucide-react";

const MapComponent = dynamic(() => import("@/components/MapComponent"), {
  ssr: false,
});

import SolicitudesVinculacion from "@/components/SolicitudesVinculacion";
import AdminManager from "@/components/AdminManager";

// Definición dinámica de horas


export default function DashboardPage() {
  const [camaras, setCamaras] = useState<any[]>([]);
  const [camaraSel, setCamaraSel] = useState<string | null>(null);
  const [fecha, setFecha] = useState(() => {
    const d = new Date();
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split("T")[0];
  });
  const [horariosConfig, setHorariosConfig] = useState<any>(null);

  useEffect(() => {
    fetch("/horarios.json")
      .then((res) => res.json())
      .then((data) => setHorariosConfig(data))
      .catch((err) => console.error("Error cargando horarios:", err));
  }, []);

  // Estados para la analítica
  const [totales, setTotales] = useState({
    Presente: 0,
    Falta: 0,
    Fugado: 0,
    Intruso: 0,
  });
  const [historialHoras, setHistorialHoras] = useState<any[]>([]);
  const [tablaRegistros, setTablaRegistros] = useState<any[]>([]);

  const router = useRouter();

  useEffect(() => {
    checkUser();
    fetchCamaras();

    // --- NUEVO: Supabase Realtime para estado de Cámaras ---
    const camarasChannel = supabase
      .channel("camaras-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "camaras" },
        () => {
          fetchCamaras();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(camarasChannel);
    };
  }, []);

  // Se ejecuta cuando cambias manualmente de cámara o de fecha
  useEffect(() => {
    if (camaraSel) {
      fetchEstadisticas(camaraSel, fecha);

      // --- NUEVO: Supabase Realtime para la Asistencia ---
      const channel = supabase
        .channel("asistencia-channel")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "asistencia" },
          () => {
            // Refrescar estadísticas cuando hay una nueva detección o actualización
            fetchEstadisticas(camaraSel, fecha);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [camaraSel, fecha, horariosConfig]);

  const checkUser = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) router.push("/");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const fetchCamaras = async () => {
    const { data } = await supabase.from("camaras").select("*");
    if (data) setCamaras(data);
  };

  const fetchEstadisticas = async (camaraId: string, date: string) => {
    // --- NUEVO: RESETEAR EL DASHBOARD A CERO ---
    setTotales({ Presente: 0, Falta: 0, Fugado: 0, Intruso: 0 });
    setHistorialHoras([]);
    setTablaRegistros([]);
    // -------------------------------------------
    // 1. Obtener el curso vinculado a la cámara
    const { data: curso } = await supabase
      .from("cursos")
      .select("id")
      .eq("camara_id", camaraId)
      .single();
    if (!curso) return;

    let HORAS_CLASE: string[] = [];
    if (horariosConfig) {
      const tipo = horariosConfig.CURSOS_MAPPING?.[curso.id] || "BACH_MAT";
      const configHorario = horariosConfig.CONFIGURACIONES?.[tipo] || {};
      HORAS_CLASE = Object.keys(configHorario);
    } else {
      HORAS_CLASE = ["Hora_1", "Hora_2", "Hora_3", "Hora_4", "Recreo", "Hora_5", "Hora_6", "Hora_7", "Hora_8"];
    }

    // 2. Obtener toda la asistencia de ese curso en esa fecha (incluyendo el nombre del estudiante si existe)
      const { data: asistencia } = await supabase
        .from("asistencia")
        .select(
          "estado, hora_clase, estudiante_cedula, timestamp_deteccion, estudiantes(nombre)",
        )
        .eq("curso_id", curso.id)
        .eq("fecha", date)
        .order("hora_clase", { ascending: true });

      if (asistencia) {
        // A. Calcular Totales Diarios
        const counts = { Presente: 0, Falta: 0, Fugado: 0, Intruso: 0 };

        // B. Preparar estructura de las 8 horas
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

        // C. Recorrer datos y llenar estructuras
        const tablaTemp: any[] = [];

        asistencia.forEach((reg: any) => {
          const estado = reg.estado as keyof typeof counts;

          // Sumar al total
          if (counts[estado] !== undefined) counts[estado]++;

          // Sumar al historial por hora (si es una hora extraída, la inicializamos)
          if (!horasData[reg.hora_clase]) {
            horasData[reg.hora_clase] = {
              name: reg.hora_clase.replace("_", " "),
              Presente: 0,
              Falta: 0,
              Fugado: 0,
              Intruso: 0,
            };
          }
          horasData[reg.hora_clase][estado]++;

          // Formatear para la tabla
          tablaTemp.push({
            id: reg.timestamp_deteccion || Math.random().toString(),
            hora: reg.hora_clase.replace("_", " "),
            cedula: reg.estudiante_cedula,
            nombre: reg.estudiantes?.nombre || "Desconocido / Visitante",
            estado: reg.estado,
            hora_registro: reg.timestamp_deteccion 
                ? new Date(reg.timestamp_deteccion).toLocaleTimeString() 
                : "Sin Hora",
          });
        });

      setTotales(counts);
      setHistorialHoras(Object.values(horasData));

      // Ordenar tabla: Más recientes primero (asumiendo que Hora_8 es mayor que Hora_1 en string)
      setTablaRegistros(tablaTemp.reverse());
    }
  };

  const camaraActiva = camaras.find((c) => c.id === camaraSel);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans">
      {/* Navbar Superior */}
      <nav className="bg-slate-800 border-b border-slate-700 p-4 sticky top-0 z-[500] shadow-md">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Activity className="text-white w-5 h-5" />
            </div>
            <span className="text-xl font-bold text-white tracking-wide">
              EdgeVision <span className="text-blue-400">Dashboard</span>
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center text-slate-400 hover:text-red-400 transition-colors bg-slate-700/50 px-4 py-2 rounded-lg hover:bg-slate-700"
          >
            <LogOut className="w-4 h-4 mr-2" /> Cerrar Sesión
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-4 lg:p-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* COLUMNA IZQUIERDA: Mapa y Controles */}
        <div className="xl:col-span-1 space-y-6">
          {/* 1. Selector de Fecha */}
          {/* Selector de Fecha */}
          <div className="bg-slate-800 p-5 rounded-2xl shadow-xl border border-slate-700">
            <label className="text-sm font-bold text-slate-300 mb-3 flex items-center">
              <Clock className="w-4 h-4 mr-2 text-blue-400" /> Fecha de Análisis
            </label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-xl p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-inner mb-3"
            />
            {/* Botón de Sincronización Manual */}
            <button
              onClick={() => camaraSel && fetchEstadisticas(camaraSel, fecha)}
              disabled={!camaraSel}
              className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              <Activity className="w-4 h-4 mr-2" /> Sincronizar Datos
            </button>
          </div>

          {/* 2. Selector de Cámaras (Botones Interactivos) */}
          <div className="bg-slate-800 p-5 rounded-2xl shadow-xl border border-slate-700">
            <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center">
              <Camera className="w-4 h-4 mr-2 text-blue-400" /> Seleccionar Nodo
            </h3>
            <div className="space-y-3">
              {camaras.map((cam) => (
                <button
                  key={cam.id}
                  onClick={() => setCamaraSel(cam.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 flex items-center justify-between group ${
                    camaraSel === cam.id
                      ? "bg-blue-600/20 border-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                      : "bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center">
                    <Camera
                      className={`w-4 h-4 mr-3 ${camaraSel === cam.id ? "text-blue-400" : "text-slate-500 group-hover:text-slate-400"}`}
                    />
                    <span className="font-medium">{cam.nombre}</span>
                  </div>
                  {/* Indicador de estado */}
                  <div className="flex items-center">
                    <span className="text-xs mr-2 opacity-50">
                      {cam.activa ? "En línea" : "Off"}
                    </span>
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${cam.activa ? "bg-green-500" : "bg-red-500"} shadow-[0_0_5px_currentColor]`}
                    ></span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 3. Mapa de apoyo (Más compacto) */}
          {/* 3. Mapa de apoyo (Más amplio y limpio) */}
          <div className="bg-slate-800 p-2 rounded-2xl shadow-xl border border-slate-700 h-[450px] relative overflow-hidden">
            <MapComponent camaras={camaras} selectedCamaraId={camaraSel} onSelectCamara={setCamaraSel} />
          </div>
        </div>

        {/* COLUMNA DERECHA: Analítica y Datos */}
        <div className="xl:col-span-2 space-y-6">
          {camaraActiva ? (
            <>
              {/* Encabezado del Curso */}
              <div className="bg-gradient-to-r from-blue-900/40 to-slate-800 p-6 rounded-2xl border border-blue-500/20 shadow-lg">
                <h2 className="text-2xl font-bold text-white mb-1">
                  {camaraActiva.nombre}
                </h2>
                <p className="text-blue-300 text-sm">
                  Mostrando telemetría en tiempo real
                </p>
              </div>

              {/* Tarjetas de Resumen KPI */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-800 p-4 rounded-2xl border border-green-500/20 shadow-md">
                  <div className="flex items-center text-green-400 mb-2">
                    <CheckCircle className="w-5 h-5 mr-2" /> Presentes
                  </div>
                  <div className="text-3xl font-bold text-white">
                    {totales.Presente}
                  </div>
                </div>
                <div className="bg-slate-800 p-4 rounded-2xl border border-red-500/20 shadow-md">
                  <div className="flex items-center text-red-400 mb-2">
                    <XCircle className="w-5 h-5 mr-2" /> Faltas
                  </div>
                  <div className="text-3xl font-bold text-white">
                    {totales.Falta}
                  </div>
                </div>
                <div className="bg-slate-800 p-4 rounded-2xl border border-yellow-500/20 shadow-md">
                  <div className="flex items-center text-yellow-400 mb-2">
                    <AlertTriangle className="w-5 h-5 mr-2" /> Fugados
                  </div>
                  <div className="text-3xl font-bold text-white">
                    {totales.Fugado}
                  </div>
                </div>
                <div className="bg-slate-800 p-4 rounded-2xl border border-purple-500/20 shadow-md">
                  <div className="flex items-center text-purple-400 mb-2">
                    <UserX className="w-5 h-5 mr-2" /> Intrusos
                  </div>
                  <div className="text-3xl font-bold text-white">
                    {totales.Intruso}
                  </div>
                </div>
              </div>

              {/* Gráfico Histórico: Barras Apiladas */}
              <div className="bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-6">
                  Historial de las 8 Horas
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={historialHoras}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#334155"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        stroke="#94a3b8"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1e293b",
                          border: "1px solid #334155",
                          borderRadius: "8px",
                          color: "#f8fafc",
                        }}
                        itemStyle={{ fontSize: "14px" }}
                      />
                      <Legend wrapperStyle={{ paddingTop: "20px" }} />
                      <Bar
                        dataKey="Presente"
                        stackId="a"
                        fill="#22c55e"
                        radius={[0, 0, 4, 4]}
                      />
                      <Bar dataKey="Fugado" stackId="a" fill="#eab308" />
                      <Bar dataKey="Falta" stackId="a" fill="#ef4444" />
                      <Bar
                        dataKey="Intruso"
                        stackId="a"
                        fill="#8b5cf6"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Tabla de Registros */}
              <div className="bg-slate-800 rounded-2xl shadow-xl border border-slate-700 overflow-hidden">
                <div className="p-4 bg-slate-800/50 border-b border-slate-700">
                  <h3 className="font-bold text-white">
                    Log de Movimientos (En Vivo)
                  </h3>
                </div>
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-400 bg-slate-900/50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3">Hora Clase</th>
                        <th className="px-4 py-3">Estudiante</th>
                        <th className="px-4 py-3">Estado</th>
                        <th className="px-4 py-3">Hora de Captura</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tablaRegistros.map((row, idx) => (
                        <tr
                          key={idx}
                          className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                        >
                          <td className="px-4 py-3 font-medium text-slate-300">
                            {row.hora}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-white">
                              {row.nombre}
                            </div>
                            <div className="text-xs text-slate-500">
                              {row.cedula}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-bold ${
                                row.estado === "Presente"
                                  ? "bg-green-500/20 text-green-400"
                                  : row.estado === "Falta"
                                    ? "bg-red-500/20 text-red-400"
                                    : row.estado === "Fugado"
                                      ? "bg-yellow-500/20 text-yellow-400"
                                      : "bg-purple-500/20 text-purple-400"
                              }`}
                            >
                              {row.estado}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            {row.hora_registro}
                          </td>
                        </tr>
                      ))}
                      {tablaRegistros.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-8 text-center text-slate-500"
                          >
                            No hay registros para esta fecha.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="h-full min-h-[500px] flex flex-col items-center justify-center bg-slate-800/50 border-2 border-dashed border-slate-700 rounded-3xl text-slate-500">
              <Users className="w-16 h-16 mb-4 opacity-50 text-blue-500" />
              <h3 className="text-xl font-bold text-slate-400 mb-2">
                Selecciona una Cámara
              </h3>
              <p className="text-center max-w-sm">
                Haz clic en un marcador del mapa para cargar la telemetría y el
                historial de las 8 horas de clases.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* SECCIÓN DE ADMINISTRACIÓN Y VINCULACIONES (Full Width) */}
      <div className="max-w-7xl mx-auto p-4 lg:p-6">
        <SolicitudesVinculacion />
        <AdminManager />
      </div>
    </div>
  );
}
