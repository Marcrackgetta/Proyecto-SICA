import os
import re

files_to_clean = [
    'app_sica/app/(auth)/login.tsx',
    'app_sica/app/(auth)/register.tsx',
    'app_sica/app/_layout.tsx',
    'app_sica/app/(auth)/_layout.tsx',
    'app_sica/src/components/ui/Input.tsx'
]

for filepath in files_to_clean:
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Remove the injected useEffect block
        content = re.sub(r'  useEffect\(\(\) => \{\n    console\.log\(\'>>> \[DEBUG\].*?UNMOUNTED\'\);\n  \}, \[\]\);\n', '', content, flags=re.DOTALL)
        
        # Remove specific Input.tsx debug logs
        content = re.sub(r'\s*console\.log\("--- \[DEBUG\] Input Rendered:".*?\);\n', '\n', content)
        content = re.sub(r' setIsFocused\(true\); console\.log\("\+\+\+ \[DEBUG\] FOCUS:".*?\);', ' setIsFocused(true);', content)
        content = re.sub(r' setIsFocused\(false\); console\.log\("--- \[DEBUG\] BLUR:".*?\);', ' setIsFocused(false);', content)

        # Remove the empty useEffect if it got left behind somehow
        content = re.sub(r'  useEffect\(\(\) => \{\s*return \(\) => console\.log.*?;\s*\}, \[\]\);\n', '', content, flags=re.DOTALL)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

print("Debug logs cleaned")
