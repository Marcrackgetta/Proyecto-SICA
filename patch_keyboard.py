import os

files = [
    'app_sica/app/(auth)/login.tsx',
    'app_sica/app/(auth)/register.tsx'
]

for path in files:
    with open(path, 'r', encoding='utf-8') as f:
        text = f.read()

    # Find the return statement
    if '<KeyboardAvoidingView' in text:
        # Instead of parsing JSX, let's just create a wrapper function or replace the tags.
        # Actually, we can just replace the <KeyboardAvoidingView tag and its closing tag conditionally.
        
        # We can just change it to a Fragment if Platform.OS === 'android', but JSX doesn't allow dynamic root tags easily without a wrapper.
        # Let's change the wrapper:
        
        replacement = '''  const content = (
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">'''

        text = text.replace('''  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">''', replacement)
      
        text = text.replace('''  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">''', replacement)

        text = text.replace('''      </ScrollView>
    </KeyboardAvoidingView>
  );''', '''      </ScrollView>
  );

  if (Platform.OS === 'android') {
    return <View style={styles.container}>{content}</View>;
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding" keyboardVerticalOffset={40}>
      {content}
    </KeyboardAvoidingView>
  );''')

        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)
            
print('Patched successfully')
