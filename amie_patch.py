import os

path = 'app_sica/app/(dashboard)/index.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Make amie specific states
text = text.replace('const [isSubmitting, setIsSubmitting] = useState(false);', 
'''const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Nuevo estado para paso AMIE
  const [paso, setPaso] = useState(1);
  const [amieCode, setAmieCode] = useState('');
  const [institucionInfo, setInstitucionInfo] = useState<any>(null);
  const [verificandoAmie, setVerificandoAmie] = useState(false);''')

verificar_func = '''
  const handleVerificarAmie = async () => {
    if (!amieCode.trim()) return Alert.alert('Error', 'Ingrese un código AMIE');
    
    setVerificandoAmie(true);
    const { data, error } = await supabase
      .from('instituciones')
      .select('id, nombre')
      .eq('codigo_amie', amieCode.trim())
      .single();
      
    setVerificandoAmie(false);
    
    if (data) {
      setInstitucionInfo(data);
      setPaso(2);
    } else {
      Alert.alert('No encontrada', 'El código AMIE ingresado no corresponde a una institución registrada.');
    }
  };
  
  const handleSolicitar = async () => {
'''

text = text.replace('const handleSolicitar = async () => {', verificar_func)

solicitar_body_old = '''await solicitarVinculacion(
      user!.id, 
      user!.email || '', 
      user!.user_metadata?.nombre_completo || 'Representante', 
      cedula, 
      nombreEst
    );'''

solicitar_body_new = '''await solicitarVinculacion(
      user!.id, 
      user!.email || '', 
      user!.user_metadata?.nombre_completo || 'Representante', 
      cedula, 
      nombreEst,
      institucionInfo?.id
    );'''
text = text.replace(solicitar_body_old, solicitar_body_new)


old_ui = '''<View style={{ width: '100%', marginTop: 8 }}>
              <Input 
                placeholder="Cédula del estudiante" 
                value={cedula} 
                onChangeText={setCedula} 
                keyboardType="numeric" 
                leftIcon={<Search color={Colors.text.muted} size={20} />}
              />
              <Input 
                placeholder="Nombre completo" 
                value={nombreEst} 
                onChangeText={setNombreEst} 
                autoCapitalize="words" 
              />
              
              <Button 
                title="Enviar Solicitud" 
                onPress={handleSolicitar} 
                isLoading={isSubmitting} 
                style={{ marginTop: 12 }}
              />
            </View>'''

new_ui = '''<View style={{ width: '100%', marginTop: 8 }}>
              {paso === 1 ? (
                <>
                  <Input 
                    placeholder="Código AMIE de la institución" 
                    value={amieCode} 
                    onChangeText={setAmieCode} 
                    autoCapitalize="characters"
                    leftIcon={<Search color={Colors.text.muted} size={20} />}
                  />
                  <Button 
                    title="Verificar Institución" 
                    onPress={handleVerificarAmie} 
                    isLoading={verificandoAmie} 
                    style={{ marginTop: 12 }}
                  />
                </>
              ) : (
                <>
                  <View style={{backgroundColor: Colors.status.successBg, padding: 12, borderRadius: 8, marginBottom: 16}}>
                    <Text style={{color: Colors.status.success, fontWeight: 'bold', textAlign: 'center'}}>
                      Institución: {institucionInfo?.nombre}
                    </Text>
                  </View>
                  
                  <Input 
                    placeholder="Cédula del estudiante" 
                    value={cedula} 
                    onChangeText={setCedula} 
                    keyboardType="numeric" 
                  />
                  <Input 
                    placeholder="Nombre completo" 
                    value={nombreEst} 
                    onChangeText={setNombreEst} 
                    autoCapitalize="words" 
                  />
                  
                  <Button 
                    title="Enviar Solicitud" 
                    onPress={handleSolicitar} 
                    isLoading={isSubmitting} 
                    style={{ marginTop: 12 }}
                  />
                  
                  <TouchableOpacity onPress={() => setPaso(1)} style={{marginTop: 16, padding: 12}}>
                    <Text style={{color: Colors.text.secondary, textAlign: 'center', fontWeight: 'bold'}}>
                      Cambiar institución
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>'''

text = text.replace(old_ui, new_ui)

text = text.replace("'public:asistencia'", "'public:asistencia_diaria'")
text = text.replace("table: 'asistencia'", "table: 'asistencia_diaria'")
text = text.replace(".from('asistencia')", ".from('asistencia_diaria')")

text = text.replace("setUltimoEstado(data.estado);", "setUltimoEstado(data.estado_ubicacion || data.estado_llegada || 'Desconocido');")
text = text.replace("setUltimoEstado(row.estado);", "setUltimoEstado(row.estado_ubicacion || row.estado_llegada || 'Desconocido');")

text = text.replace("timestamp_deteccion", "ultima_actualizacion")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print('AMIE step added')
