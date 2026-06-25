import ast
import json
import re

def parse_dependencies(files: dict) -> dict:
    """Parse dependencies from requirements.txt, package.json, and python imports."""
    external_deps = set()
    internal_imports = []

    # 1. Parse requirements.txt
    if 'requirements.txt' in files:
        for line in files['requirements.txt'].splitlines():
            line = line.strip()
            if line and not line.startswith('#'):
                # Extract package name before specifiers (==, >=, <=, etc.)
                pkg = re.split(r'==|>=|<=|>|<|~=', line)[0].strip()
                if pkg:
                    external_deps.add(pkg)

    # 2. Parse package.json
    if 'package.json' in files:
        try:
            pkg_data = json.loads(files['package.json'])
            deps = pkg_data.get('dependencies', {})
            dev_deps = pkg_data.get('devDependencies', {})
            external_deps.update(deps.keys())
            external_deps.update(dev_deps.keys())
        except Exception:
            pass

    # 3. Parse Python imports
    python_std_libs = {
        'os', 'sys', 'time', 'datetime', 'math', 'random', 'json', 're', 'urllib',
        'collections', 'itertools', 'functools', 'hashlib', 'hmac', 'socket', 'threading',
        'multiprocessing', 'subprocess', 'shutil', 'glob', 'tempfile', 'typing', 'ast', 'zipfile'
    }

    project_py_modules = {path[:-3].replace('/', '.') for path in files.keys() if path.endswith('.py')}

    for path, content in files.items():
        if path.endswith('.py'):
            try:
                tree = ast.parse(content)
                file_imports = set()
                for node in ast.walk(tree):
                    if isinstance(node, ast.Import):
                        for alias in node.names:
                            base_name = alias.name.split('.')[0]
                            file_imports.add(base_name)
                    elif isinstance(node, ast.ImportFrom):
                        if node.module:
                            base_name = node.module.split('.')[0]
                            file_imports.add(base_name)

                # Separate stdlib, project internal modules, and actual third-party packages
                for imp in file_imports:
                    if imp in python_std_libs:
                        continue
                    # Check if it looks like an internal project import
                    is_internal = any(
                        imp == p or p.startswith(imp + '.') or imp.startswith(p + '.') 
                        for p in project_py_modules
                    )
                    if is_internal:
                        internal_imports.append({
                            "file": path,
                            "imported_module": imp
                        })
                    else:
                        external_deps.add(imp)
            except Exception:
                pass

    return {
        "external": sorted(list(external_deps)),
        "internal": internal_imports
    }
