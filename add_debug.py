import os
import re

def add_logs(filepath, component_name):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Add useEffect import if not there
    if 'useEffect' not in content:
        content = content.replace('import React', 'import React, { useEffect }')
        if 'import React' not in content:
            content = "import React, { useEffect } from 'react';\n" + content

    # Add mount/unmount logs
    hook = f'''
  useEffect(() => {{
    console.log('>>> [DEBUG] {component_name} MOUNTED');
    return () => console.log('<<< [DEBUG] {component_name} UNMOUNTED');
  }}, []);
'''
    
    # Insert inside the component
    if 'export default function' in content:
        content = re.sub(r'(export default function [^\(]+\([^\)]*\)\s*{)', r'\1' + hook, content)
    elif 'export const' in content and 'React.FC' in content:
        content = re.sub(r'(export const [^\:]+\:\s*React\.FC[^\=]+\=\s*\([^\)]*\)\s*=>\s*{)', r'\1' + hook, content)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

add_logs('app_sica/app/(auth)/login.tsx', 'LoginScreen')
add_logs('app_sica/app/(auth)/register.tsx', 'RegisterScreen')
add_logs('app_sica/app/_layout.tsx', 'RootLayout')
add_logs('app_sica/app/(auth)/_layout.tsx', 'AuthLayout')

# Now patch Input.tsx manually to log focus and blur
with open('app_sica/src/components/ui/Input.tsx', 'r', encoding='utf-8') as f:
    input_code = f.read()

if 'useEffect' not in input_code:
    input_code = input_code.replace('import React', 'import React, { useEffect }')

input_code = re.sub(r'(export const Input\: React\.FC[^\=]+\=\s*\([^\)]*\)\s*=>\s*{)', r'\1\n  console.log("--- [DEBUG] Input Rendered:", label || placeholder);\n', input_code)

input_code = input_code.replace('setIsFocused(true);', 'setIsFocused(true); console.log("+++ [DEBUG] FOCUS:", props.placeholder);')
input_code = input_code.replace('setIsFocused(false);', 'setIsFocused(false); console.log("--- [DEBUG] BLUR:", props.placeholder);')

with open('app_sica/src/components/ui/Input.tsx', 'w', encoding='utf-8') as f:
    f.write(input_code)

print("Debug logs injected")
