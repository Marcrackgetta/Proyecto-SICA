import os

files = [
    'app_sica/app/(auth)/login.tsx',
    'app_sica/app/(auth)/register.tsx',
    'app_sica/app/(dashboard)/index.tsx'
]

for path in files:
    with open(path, 'r', encoding='utf-8') as f:
        text = f.read()

    text = text.replace(
        '<ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: \\'center\\' }} keyboardShouldPersistTaps="handled">',
        '<ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: \\'center\\' }} keyboardShouldPersistTaps="handled" removeClippedSubviews={false} keyboardDismissMode="none">'
    ).replace(
        '<ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }} keyboardShouldPersistTaps="handled">',
        '<ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }} keyboardShouldPersistTaps="handled" removeClippedSubviews={false} keyboardDismissMode="none">'
    ).replace(
        "<ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps=\"handled\">",
        "<ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps=\"handled\" removeClippedSubviews={false} keyboardDismissMode=\"none\">"
    )
    
    text = text.replace(
        '<ScrollView style={styles.container}>',
        '<ScrollView style={styles.container} keyboardShouldPersistTaps="handled" removeClippedSubviews={false} keyboardDismissMode="none">'
    )

    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)

print('Patched removeClippedSubviews')
