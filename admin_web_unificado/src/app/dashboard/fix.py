import re
with open("page.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# 1. Remove const HORAS_CLASE = [ ... ]
code = re.sub(r"// Definición de las 8 horas de clase\nconst HORAS_CLASE = \[\n(?:    \"Hora_\d\",\n)+  \];\n", "", code)
code = re.sub(r"// Definición de las 8 horas de clase\r?\nconst HORAS_CLASE = \[\r?\n(.*?)\r?\n  \];\r?\n", "", code, flags=re.DOTALL)

# 2. Add state for horariosConfig
code = code.replace("const [fecha, setFecha] = useState(new Date().toISOString().split(\"T\")[0]);",
\"\"\"const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const [horariosConfig, setHorariosConfig] = useState<any>(null);

  useEffect(() => {
    fetch("/horarios.json")
      .then((res) => res.json())
      .then((data) => setHorariosConfig(data))
      .catch((err) => console.error("Error cargando horarios:", err));
  }, []);
\"\"\")

# 3. Update fetchEstadisticas to use dynamic HORAS_CLASE
replacement = \"\"\"
      if (!curso) return;
      
      let HORAS_CLASE: string[] = [];
      if (horariosConfig) {
        const tipo = horariosConfig.CURSOS_MAPPING?.[curso.id] || "BACH_MAT";
        const configHorario = horariosConfig.CONFIGURACIONES?.[tipo] || {};
        HORAS_CLASE = Object.keys(configHorario);
      } else {
        HORAS_CLASE = ["Hora_1", "Hora_2", "Hora_3", "Hora_4", "Recreo", "Hora_5", "Hora_6", "Hora_7", "Hora_8"];
      }

      // 2. Obtener toda la asistencia de ese curso en esa fecha\"\"\"
code = code.replace(\"\"\"      if (!curso) return;

      // 2. Obtener toda la asistencia de ese curso en esa fecha\"\"\", replacement.strip())

code = code.replace(\"\"\"      if (!curso) return;
  
      // 2. Obtener toda la asistencia de ese curso en esa fecha\"\"\", replacement.strip())


with open("page.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("Done rewrite page.tsx")
