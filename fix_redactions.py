import os
import sys

replacements = {
    "REDACTED_DOCUSEAL_API_KEY": "DOCUSEAL_API_KEY",
    "REDACTED_SUPABASE_SERVICE_ROLE_KEY": "SUPABASE_SERVICE_ROLE_KEY",
    "REDACTED_NEXT_PUBLIC_SUPABASE_ANON_KEY": "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "REDACTED_OPENROUTER_API_KEY": "OPENROUTER_API_KEY",
    "REDACTED_GEMINI_API_KEY": "GEMINI_API_KEY",
    "REDACTED_PRIVATE_KEY_BEGIN": "-----BEGIN PRIVATE KEY-----"
}

count = 0
for root, dirs, files in os.walk(r"c:\Software Engineering\kayod"):
    if any(x in root for x in ["node_modules", ".next", ".git", ".remediation"]):
        continue
    for file in files:
        if file.endswith((".ts", ".tsx", ".js", ".jsx")):
            filepath = os.path.join(root, file)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    content = f.read()
                
                new_content = content
                for k, v in replacements.items():
                    new_content = new_content.replace(k, v)
                    
                if new_content != content:
                    with open(filepath, "w", encoding="utf-8", newline='') as f:
                        f.write(new_content)
                    print(f"Fixed {filepath}")
                    count += 1
            except Exception as e:
                print(f"Error processing {filepath}: {e}")
print(f"Fixed {count} files")
