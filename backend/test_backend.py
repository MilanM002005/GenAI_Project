import unittest
import os
import sys

# Add core to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'core'))
from extractor import build_tree_json
from dependency import parse_dependencies

class TestBackendComponents(unittest.TestCase):
    def test_build_tree_json(self):
        paths = ["src/index.js", "src/App.css", "package.json", "README.md"]
        tree = build_tree_json(paths)
        
        # Verify structure
        self.assertEqual(len(tree), 3) # package.json, README.md, src (directory)
        
        # Find directory node
        src_node = next(n for n in tree if n["name"] == "src")
        self.assertEqual(src_node["type"], "directory")
        self.assertEqual(len(src_node["children"]), 2) # index.js, App.css
        
        # Verify ordering (directories first, then files)
        self.assertEqual(tree[0]["name"], "src")
        
    def test_parse_dependencies(self):
        files_mock = {
            "requirements.txt": "fastapi==0.95.0\n# comment\nuvicorn>=0.20.0\n",
            "package.json": '{"dependencies": {"react": "^18.2.0"}, "devDependencies": {"vite": "^4.0.0"}}',
            "src/main.py": "import os\nimport sys\nimport fastapi\nfrom core import extractor\n"
        }
        deps = parse_dependencies(files_mock)
        
        # Verify external
        self.assertIn("fastapi", deps["external"])
        self.assertIn("uvicorn", deps["external"])
        self.assertIn("react", deps["external"])
        self.assertIn("vite", deps["external"])
        
        # Verify internal
        self.assertEqual(len(deps["internal"]), 0) # No actual modules matching in tree since core/extractor doesn't exist in mock paths
        
if __name__ == "__main__":
    unittest.main()
