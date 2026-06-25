import zipfile
import os

SUPPORTED_EXTENSIONS = {
    # Code
    '.py', '.js', '.jsx', '.ts', '.tsx', '.java', '.cpp', '.c', '.go', '.rs', '.cs', '.php', '.rb', '.scala', '.kt',
    # Web & Configs
    '.html', '.css', '.json', '.xml', '.yaml', '.yml', '.toml', '.ini',
    # Docs
    '.md', '.txt', '.rst', '.sh', '.bat', '.ps1'
}

def extract_zip(zip_path: str, extract_to: str) -> dict:
    """Unzip and read all supported source files. Returns {rel_path: content}."""
    files = {}
    with zipfile.ZipFile(zip_path, 'r') as z:
        z.extractall(extract_to)

    for root, _, filenames in os.walk(extract_to):
        # Skip node_modules, .git, venv, pycache directories
        rel_root = os.path.relpath(root, extract_to)
        parts = [] if rel_root == '.' else rel_root.split(os.sep)
        if any(part.startswith('.') or part in ('node_modules', 'venv', '__pycache__', 'dist', 'build') for part in parts):
            continue

        for fname in filenames:
            ext = os.path.splitext(fname)[1].lower()
            if ext in SUPPORTED_EXTENSIONS or fname in ('Dockerfile', 'Makefile', 'Jenkinsfile'):
                full_path = os.path.join(root, fname)
                rel_path = os.path.relpath(full_path, extract_to).replace('\\', '/')
                try:
                    with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                        files[rel_path] = f.read()
                except Exception:
                    pass
    return files

def build_tree_json(paths: list) -> list:
    """Convert a flat list of file paths into a nested tree structure for UI rendering."""
    tree = {}
    for path in sorted(paths):
        parts = path.strip('/').split('/')
        current = tree
        for i, part in enumerate(parts):
            is_file = (i == len(parts) - 1)
            if part not in current:
                current[part] = {
                    "name": part,
                    "type": "file" if is_file else "directory",
                    "path": "/".join(parts[:i+1]),
                    "children": {} if not is_file else None
                }
            if not is_file:
                current = current[part]["children"]

    def dict_to_list(d):
        if d is None:
            return None
        res = []
        for key, val in d.items():
            node = {
                "name": val["name"],
                "type": val["type"],
                "path": val["path"]
            }
            if val["children"] is not None:
                node["children"] = dict_to_list(val["children"])
            res.append(node)
        # Sort directories first, then files alphabetically
        res.sort(key=lambda x: (0 if x["type"] == "directory" else 1, x["name"].lower()))
        return res

    return dict_to_list(tree)
