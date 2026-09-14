"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Users, Search, Plus, Edit2, Trash2, X } from "lucide-react";
import SolicitudesVinculacion from "@/components/SolicitudesVinculacion";

type Estudiante = {
  cedula: string;
  nombre: string;
  curso_id: string | null;
};

type Curso = {
  id: string;
  descripcion: string;
};

export default function EstudiantesPage() {
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Estudiante>({
    cedula: "",
    nombre: "",
    curso_id: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    // Fetch cursos
    const { data: cData } = await supabase.from("cursos").select("id, descripcion");
    if (cData) setCursos(cData);

    // Fetch estudiantes
    const { data: eData } = await supabase.from("estudiantes").select("*").order("nombre");
    if (eData) setEstudiantes(eData);
    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      // Update
      await supabase
        .from("estudiantes")
        .update({ nombre: formData.nombre, curso_id: formData.curso_id || null })
        .eq("cedula", editingId);
    } else {
      // Insert
      await supabase.from("estudiantes").insert([
        {
          cedula: formData.cedula,
          nombre: formData.nombre,
          curso_id: formData.curso_id || null,
        },
      ]);
    }
    setIsModalOpen(false);
    fetchData();
  };

  const handleDelete = async (cedula: string) => {
    if (confirm("¿Seguro que deseas eliminar este estudiante? Esta acción puede afectar su historial de asistencia.")) {
      await supabase.from("estudiantes").delete().eq("cedula", cedula);
      fetchData();
    }
  };

  const openModal = (est: Estudiante | null) => {
    if (est) {
      setEditingId(est.cedula);
      setFormData(est);
    } else {
      setEditingId(null);
      setFormData({ cedula: "", nombre: "", curso_id: "" });
    }
    setIsModalOpen(true);
  };

  const filtered = estudiantes.filter(
    (e) =>
      e.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.cedula.includes(searchTerm)
  );

  return (
    <div className="space-y-10 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center">
            <Users className="w-6 h-6 mr-3 text-blue-400" />
            Gestión de Estudiantes
          </h1>
          <p className="text-slate-400 mt-1">
            Administra el directorio de estudiantes y sus zonas asignadas.
          </p>
        </div>
        <button
          onClick={() => openModal(null)}
          className="flex items-center bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg transition-colors font-medium"
        >
          <Plus className="w-4 h-4 mr-2" />
          Añadir Estudiante
        </button>
      </div>

      <SolicitudesVinculacion />

      {/* Search */}
      <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 flex items-center shadow-sm">
        <Search className="w-5 h-5 text-slate-400 mr-3" />
        <input
          type="text"
          placeholder="Buscar por cédula o nombre..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-transparent border-none text-white w-full focus:outline-none placeholder-slate-500"
        />
      </div>

      {/* Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/50 text-slate-400 uppercase font-semibold text-xs">
              <tr>
                <th className="px-6 py-5">Cédula</th>
                <th className="px-6 py-5">Nombre</th>
                <th className="px-6 py-5">Curso / Zona</th>
                <th className="px-6 py-5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {loading ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-slate-500">
                    Cargando estudiantes...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-slate-500">
                    No se encontraron resultados.
                  </td>
                </tr>
              ) : (
                filtered.map((est) => (
                  <tr key={est.cedula} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-6 py-5 font-mono text-slate-400">{est.cedula}</td>
                    <td className="px-6 py-5 font-medium text-white">{est.nombre}</td>
                    <td className="px-6 py-5">
                      {est.curso_id ? (
                        <span className="bg-blue-900/40 text-blue-300 border border-blue-700/50 px-2 py-1 rounded text-xs">
                          {est.curso_id}
                        </span>
                      ) : (
                        <span className="text-slate-500 italic">Sin asignar</span>
                      )}
                    </td>
                    <td className="px-6 py-5 text-right space-x-3">
                      <button
                        onClick={() => openModal(est)}
                        className="text-slate-400 hover:text-blue-400 transition-colors"
                      >
                        <Edit2 className="w-4 h-4 inline" />
                      </button>
                      <button
                        onClick={() => handleDelete(est.cedula)}
                        className="text-slate-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
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
              {editingId ? "Editar Estudiante" : "Nuevo Estudiante"}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Cédula</label>
                <input
                  type="text"
                  required
                  disabled={!!editingId} // No permitir cambiar cédula si se edita (PK)
                  value={formData.cedula}
                  onChange={(e) => setFormData({ ...formData, cedula: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50"
                  placeholder="Ej: 0912345678"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Nombre Completo</label>
                <input
                  type="text"
                  required
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="Ej: Juan Pérez"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Curso / Zona (Opcional)</label>
                <select
                  value={formData.curso_id || ""}
                  onChange={(e) => setFormData({ ...formData, curso_id: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">-- Sin asignar --</option>
                  {cursos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id} {c.descripcion ? `(${c.descripcion})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-slate-300 hover:text-white transition-colors"
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
