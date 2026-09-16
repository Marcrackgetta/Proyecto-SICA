import re

file_path = 'app_sica/app/(dashboard)/index.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_func = """  async function fetchEventosResumen(cedula: string) {
    const d = new Date();
    const today = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const { data } = await supabase
      .from('historial_eventos')
      .select('*')
      .eq('estudiante_cedula', cedula)
      .eq('fecha', today)
      .order('timestamp_evento', { ascending: true });

    if (data && data.length > 0) {
      let evLlegada = data.find((e: any) => e.estado_consolidado === 'Presente' || e.estado_consolidado === 'Atrasado');
      let evAnomalia = data.slice().reverse().find((e: any) => e.estado_consolidado === 'Fugado' || e.estado_consolidado === 'Intruso');
      let evSalida = data.slice().reverse().find((e: any) => e.estado_consolidado === 'Salida' || e.estado_consolidado === 'En transito (Despues de clases)');
      
      setResumenHoy({
         llegada: evLlegada || null,
         anomalia: evAnomalia || null,
         salida: evSalida || null
      });
    } else {
      setResumenHoy({ llegada: null, anomalia: null, salida: null });
    }
  }"""

new_func = """  async function fetchEventosResumen(cedula: string) {
    const d = new Date();
    const today = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('historial_eventos')
      .select('id, estado_consolidado, timestamp_evento')
      .eq('estudiante_cedula', cedula)
      .eq('fecha', today)
      .order('timestamp_evento', { ascending: true });

    if (error) {
      console.error('Error fetching resumen:', error);
      return;
    }

    if (data && data.length > 0) {
      // Usamos .toLowerCase() y .includes() para ser más tolerantes
      let evLlegada = data.find((e: any) => e.estado_consolidado?.toLowerCase().includes('presente') || e.estado_consolidado?.toLowerCase().includes('atrasado'));
      let evAnomalia = [...data].reverse().find((e: any) => e.estado_consolidado?.toLowerCase().includes('fugado') || e.estado_consolidado?.toLowerCase().includes('intruso'));
      let evSalida = [...data].reverse().find((e: any) => e.estado_consolidado?.toLowerCase().includes('salida') || e.estado_consolidado?.toLowerCase().includes('transito (despues'));
      
      // Fallback: si por alguna razon el primer evento no dice "Presente", tomamos el primero absoluto como llegada
      if (!evLlegada && data.length > 0) {
         evLlegada = data[0];
      }

      setResumenHoy({
         llegada: evLlegada || null,
         anomalia: evAnomalia || null,
         salida: evSalida || null
      });
    } else {
      setResumenHoy({ llegada: null, anomalia: null, salida: null });
    }
  }"""

content = content.replace(old_func, new_func)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
