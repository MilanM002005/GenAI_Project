# AI Reverse Engineering Agent — Implementation Guide

> GenAI Workshop Project | Python Backend · Gradio UI

---

main priorities
:::
Source Code Analysis to understand the structure and functionality of the code.
Automated Documentation Generation to create clear project documentation.
Architecture Reconstruction to identify modules, components, and their interactions.
Dependency Analysis to visualize internal and external dependencies.
Security Vulnerability Detection to identify potential security risks and coding issues.
An Interactive Chat Interface that allows users to ask questions about the codebase and receive intelligent responses.
:::::

## What We're Building

A web app where a user uploads a code repository (ZIP), and the system automatically produces:

- Codebase summary and structure map
- Auto-generated documentation
- AI-powered code Q&A chatbot
- Security vulnerability highlights
- Modernization/tech-debt recommendations

Everything powered by an LLM (Gemini / OpenAI) on the backend with a clean Gradio frontend.

---

## Trimmed Feature Set (Workshop-Realistic)

| #   | Feature                          | Keep? | Notes                          |
| --- | -------------------------------- | ----- | ------------------------------ |
| 1   | Source Code Analysis             | ✅    | Core feature — parse structure |
| 2   | Documentation Generation         | ✅    | LLM-generated per module       |
| 3   | UML Diagram Generation           | ❌    | Too complex for workshop scope |
| 4   | Architecture Reconstruction      | ✅    | Simplified — text description  |
| 5   | AI Code Explanation              | ✅    | Core LLM feature               |
| 6   | Data Flow Visualization          | ❌    | Out of scope                   |
| 7   | Dependency Analysis              | ✅    | Parse imports/requirements.txt |
| 8   | Security Vulnerability Detection | ✅    | Prompt-based, simplified       |
| 9   | Modernization Recommendations    | ✅    | LLM output                     |
| 10  | Technical Debt Assessment        | ✅    | Merged with #9                 |
| 11  | Interactive Chat Interface       | ✅    | Core — RAG over codebase       |
| 12  | Report Export (PDF/HTML)         | ❌    | Nice-to-have, skip for demo    |
| 13  | Cloud Deployment                 | ✅    | Hugging Face Spaces (free)     |

---

## Tech Stack

### Backend — Python

| Layer              | Tool                                                           | Why                           |
| ------------------ | -------------------------------------------------------------- | ----------------------------- |
| LLM                | `google-generativeai` (Gemini 1.5 Flash) or `openai`           | Free tier / workshop API keys |
| Embeddings + RAG   | `llama-index` or `langchain` + `chromadb`                      | Easy local vector store       |
| Code parsing       | Python `ast`, `os`, `zipfile` stdlib                           | No extra deps                 |
| Dependency parsing | `pipreqs`, manual parse of `requirements.txt` / `package.json` | Simple                        |
| Security scan      | Prompt-based (LLM) + `bandit` (optional)                       | `pip install bandit`          |

### Frontend —vite + vue 3 / react

---

## Project Structure

```
clean efficient
---

## Implementation Steps


Create a `.env` file:
```

GEMINI_API_KEY=your_key_here

```

Or use OpenAI:
```

OPENAI_API_KEY=your_key_here

````

---

### Step 2 — Code Extractor (`core/extractor.py`)

```python
import zipfile, os

SUPPORTED_EXTENSIONS = {'.py', '.js', '.ts', '.java', '.cpp', '.c', '.go', '.rs', '.md', '.txt'}

def extract_zip(zip_path: str, extract_to: str) -> dict:
    """Unzip and read all source files. Returns {filepath: content}."""
    files = {}
    with zipfile.ZipFile(zip_path, 'r') as z:
        z.extractall(extract_to)

    for root, _, filenames in os.walk(extract_to):
        for fname in filenames:
            ext = os.path.splitext(fname)[1]
            if ext in SUPPORTED_EXTENSIONS:
                full_path = os.path.join(root, fname)
                rel_path = os.path.relpath(full_path, extract_to)
                try:
                    with open(full_path, 'r', errors='ignore') as f:
                        files[rel_path] = f.read()
                except Exception:
                    pass
    return files

def get_file_tree(files: dict) -> str:
    """Return a text representation of the project structure."""
    return "\n".join(sorted(files.keys()))
````

---

### Step 3 — LLM Analyzer (`core/analyzer.py`)

````python
import google.generativeai as genai
import os

genai.configure(api_key=os.environ["GEMINI_API_KEY"])
model = genai.GenerativeModel("gemini-1.5-flash")

def llm(prompt: str) -> str:
    response = model.generate_content(prompt)
    return response.text

def generate_summary(file_tree: str, sample_files: dict) -> str:
    sample = "\n\n".join(
        [f"### {k}\n```\n{v[:500]}\n```" for k, v in list(sample_files.items())[:5]]
    )
    return llm(f"""
You are a software analyst. Analyze this project and give:
1. A one-paragraph project overview
2. Key modules and their purpose (bullet points)
3. Inferred tech stack

File structure:
{file_tree}

Sample files:
{sample}
""")

def generate_documentation(filepath: str, content: str) -> str:
    return llm(f"""
Generate concise developer documentation for this file.
Include: purpose, key functions/classes, inputs/outputs, dependencies.

File: {filepath}
````

{content[:2000]}

```
""")

def analyze_security(files: dict) -> str:
    combined = "\n\n".join([f"# {k}\n{v[:800]}" for k, v in list(files.items())[:10]])
    return llm(f"""
Review this codebase for common security issues:
- Hardcoded secrets or credentials
- SQL injection risks
- Insecure use of eval() or exec()
- Missing input validation
- Outdated or risky imports

For each issue found: state the file, line snippet, and fix suggestion.
If none found, say so.

Code:
{combined}
""")

def generate_recommendations(summary: str, dependencies: str) -> str:
    return llm(f"""
Based on this legacy codebase analysis, provide:
1. Modernization suggestions (framework upgrades, patterns to adopt)
2. Top 3 technical debt items
3. Quick wins (things that can be fixed in under an hour)

Project summary:
{summary}

Dependencies:
{dependencies}
""")
```

---

### Step 4 — Dependency Parser (`core/dependency.py`)

```python
import ast, os

def parse_dependencies(files: dict) -> str:
    deps = set()

    # requirements.txt
    if 'requirements.txt' in files:
        for line in files['requirements.txt'].splitlines():
            line = line.strip()
            if line and not line.startswith('#'):
                deps.add(line.split('==')[0].split('>=')[0])

    # package.json
    if 'package.json' in files:
        import json
        try:
            pkg = json.loads(files['package.json'])
            deps.update(pkg.get('dependencies', {}).keys())
            deps.update(pkg.get('devDependencies', {}).keys())
        except Exception:
            pass

    # Python imports from .py files
    for path, content in files.items():
        if path.endswith('.py'):
            try:
                tree = ast.parse(content)
                for node in ast.walk(tree):
                    if isinstance(node, ast.Import):
                        for alias in node.names:
                            deps.add(alias.name.split('.')[0])
                    elif isinstance(node, ast.ImportFrom):
                        if node.module:
                            deps.add(node.module.split('.')[0])
            except Exception:
                pass

    return "\n".join(sorted(deps)) if deps else "No dependencies found."
```

---

### Step 5 — RAG Chat (`core/rag.py`)

```python
from llama_index.core import VectorStoreIndex, Document
from llama_index.core.settings import Settings
from llama_index.llms.gemini import Gemini
from llama_index.embeddings.gemini import GeminiEmbedding
import os

Settings.llm = Gemini(api_key=os.environ["GEMINI_API_KEY"], model_name="models/gemini-1.5-flash")
Settings.embed_model = GeminiEmbedding(api_key=os.environ["GEMINI_API_KEY"])

_index = None

def build_index(files: dict):
    global _index
    docs = [Document(text=f"File: {k}\n\n{v[:3000]}") for k, v in files.items()]
    _index = VectorStoreIndex.from_documents(docs)

def chat(question: str, history: list) -> str:
    if _index is None:
        return "Please upload and analyze a project first."
    engine = _index.as_query_engine()
    response = engine.query(question)
    return str(response)
```

---

### Step 6 — (`app.py`)

ui

### Step 7 — Requirements File

```
# requirements.txt

google-generativeai>=0.5
llama-index>=0.10
llama-index-llms-gemini
llama-index-embeddings-gemini
chromadb
python-dotenv
```

---

## Running Locally

```bash
git clone <your-repo>
cd ai-re-agent
pip install -r requirements.txt

# Set your API key
export GEMINI_API_KEY=your_key_here   # Linux/Mac
set GEMINI_API_KEY=your_key_here      # Windows

python app.py
# Opens at http://localhost:7860
```

---

## Deploy

---

## Demo Flow (Workshop Presentation)

1. Show the UI briefly
2. Upload a sample Python project ZIP (prepare a small one — Flask app or CLI tool works well)
3. Click **Analyze** — walk through each tab:
   - File tree → shows structure parsed
   - Summary → LLM describes the project
   - Dependencies → auto-detected libraries
   - Security → any flags from the LLM
   - Recommendations → modernization ideas
4. Switch to **Chat** tab → ask:
   - _"What does the main.py file do?"_
   - _"Where is user authentication handled?"_
   - _"What database is this project using?"_

---

## Possible Extensions (Post-Workshop)

- Add `bandit` integration for proper static security scanning
- Generate a downloadable PDF report using `fpdf2`
- Support GitHub URL input instead of ZIP upload
- Add streaming LLM responses for faster UX
- Store analysis history using SQLite
