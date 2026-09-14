"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Video, Camera, MapPin, Edit2, Plus, Trash2, X } from "lucide-react";

type Camara = {
  id: string;
  nombre: string;
  activa: boolean;
};

type Curso = {
  id: string;
  camara_id: string | null;
};

export default function CamarasPage() {
  const [camaras, setCamaras] = useState<Camara[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State for Zonas (Cursos)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ id: "", camara_id: "" });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: camData } = await supabase.from("camaras").select("*").order("id");
    const { data: curData } = await supabase.from("cursos").select("*").order("id");
    
    if (camData) setCamaras(camData);
    if (curData) setCursos(curData);
    setLoading(false);
  };

  const handleSaveZona = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await supabase
        .from("cursos")
        .update({ camara_id: formData.camara_id || null })
        .eq("id", editingId);
    } else {
      await supabase.from("cursos").insert([{
        id: formData.id,
        camara_id: formData.camara_id || null
      }]);
    }
    setIsModalOpen(false);
    fetchData();
  };

  const handleDeleteZona = async (id: string) => {
    if (confirm("¿Seguro que deseas eliminar esta zona/curso?")) {
      await supabase.from("cursos").delete().eq("id", id);
      fetchData();
    }
  };

  const openModal = (curso: Curso | null) => {
    if (curso) {
      setEditingId(curso.id);
      setFormData({ id: curso.id, camara_id: curso.camara_id || "" });
    } else {
      setEditingId(null);
      setFormData({ id: "", camara_id: "" });
    }
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-12 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center">
          <Video className="w-6 h-6 mr-3 text-blue-400" />
          Zonas y Cámaras
        </h1>
        <p className="text-slate-400 mt-1">
          Gestiona las cámaras físicas y su vinculación con los espacios académicos.
        </p>
      </div>

      {/* Cámaras Activas */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center">
          <Camera className="w-5 h-5 mr-2 text-slate-400" />
          Cámaras Instaladas
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {loading ? (
            <div className="text-slate-500">Cargando cámaras...</div>
          ) : camaras.map(cam => (
            <div key={cam.id} className="bg-slate-800 border border-slate-700 rounded-xl p-8 shadow-sm rounded-2xl">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-slate-200">{cam.id}</h3>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  cam.activa ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-slate-700 text-slate-400"
                }`}>
                  {cam.activa ? "EN LÍNEA" : "OFFLINE"}
                </span>
              </div>
              <p className="text-sm text-slate-400">{cam.nombre}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Zonas (Cursos) */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center">
            <MapPin className="w-5 h-5 mr-2 text-slate-400" />
            Vinculación de Zonas (Cursos)
          </h2>
          <button
            onClick={() => openModal(null)}
            className="flex items-center bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4 mr-1" />
            Nueva Zona
          </button>
        </div>
        
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-xl">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/50 text-slate-400 uppercase font-semibold text-xs">
              <tr>
                <th className="px-6 py-5">ID Zona / Curso</th>
                <th className="px-6 py-5">Cámara Vinculada</th>
                <th className="px-6 py-5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {loading ? (
                <tr>
                  <td colSpan={3} className="text-center py-8 text-slate-500">Cargando zonas...</td>
                </tr>
              ) : cursos.map(curso => (
                <tr key={curso.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-6 py-5 font-bold text-white">{curso.id}</td>
                  <td className="px-6 py-5">
                    {curso.camara_id ? (
                      <span className="flex items-center text-blue-300">
                        <Video className="w-4 h-4 mr-2 opacity-70" /> {curso.camara_id}
                      </span>
                    ) : (
                      <span className="text-slate-500 italic">Sin cámara</span>
                    )}
                  </td>
                  <td className="px-6 py-5 text-right space-x-3">
                    <button onClick={() => openModal(curso)} className="text-slate-400 hover:text-blue-400">
                      <Edit2 className="w-4 h-4 inline" />
                    </button>
                    <button onClick={() => handleDeleteZona(curso.id)} className="text-slate-400 hover:text-red-400">
                      <Trash2 className="w-4 h-4 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[999]">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-white mb-6">
              {editingId ? "Editar Vinculación" : "Nueva Zona"}
            </h2>
            <form onSubmit={handleSaveZona} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">ID de Zona (Ej: 2_INFO_A)</label>
                <input
                  type="text"
                  required
                  disabled={!!editingId}
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value.replace(/\s+/g, '_') })}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50"
                  placeholder="ID sin espacios"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Vincular a Cámara</label>
                <select
                  value={formData.camara_id}
                  onChange={(e) => setFormData({ ...formData, camara_id: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">-- Sin vincular --</option>
                  {camaras.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id} ({c.nombre})
                    </option>
                  ))}
                </select>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors font-medium"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
