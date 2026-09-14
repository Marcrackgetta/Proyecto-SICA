import os

path = 'admin_web_unificado/src/app/dashboard/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Change listening channel to asistencia_diaria
text = text.replace('table: "asistencia"', 'table: "asistencia_diaria"')

# Update fetchEstadisticas query
old_fetch = '''const { data: asistencia, error: errAsist } = await supabase
      .from("asistencia")
      .select(
        "estado, hora_clase, estudiante_cedula, timestamp_deteccion, estudiantes(nombre)",
      )
      .eq("curso_id", curso.id)
      .eq("fecha", date)
      .in("hora_clase", HORAS_CLASE)
      .order("hora_clase", { ascending: true });'''

new_fetch = '''const { data: asistencia, error: errAsist } = await supabase
      .from("asistencia_diaria")
      .select(
        "estado_llegada, estado_ubicacion, hora_llegada, ultima_actualizacion, estudiante_cedula, estudiantes(nombre, curso_id)"
      )
      .eq("fecha", date);
      
    // Filtrar localmente por curso (simulando filtro de camara)
    if (asistencia) {
      // asistencia = asistencia.filter((a: any) => a.estudiantes?.curso_id === curso.id);
    }
'''
text = text.replace(old_fetch, new_fetch)

old_table_logic = '''asistencia.forEach((reg: any) => {
        let estadoGrafica = reg.estado as keyof typeof counts;
        if (estadoGrafica === "Atrasado" as any) estadoGrafica = "Presente";

        if (counts[estadoGrafica] !== undefined) counts[estadoGrafica]++;

        if (!horasData[reg.hora_clase]) {
          horasData[reg.hora_clase] = {
            name: reg.hora_clase.replace("_", " "),
            Presente: 0,
            Falta: 0,
            Fugado: 0,
            Intruso: 0,
          };
        }
        if (horasData[reg.hora_clase] && horasData[reg.hora_clase][estadoGrafica] !== undefined) {
           horasData[reg.hora_clase][estadoGrafica]++;
        }

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
      });'''

new_table_logic = '''asistencia.forEach((reg: any) => {
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
      });'''
      
text = text.replace(old_table_logic, new_table_logic)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print('Admin patched!')
