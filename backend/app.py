from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import os
import shutil
import uuid

load_dotenv()

# Import custom core modules
from core.extractor import extract_zip, build_tree_json
from core.dependency import parse_dependencies
from core.analyzer import generate_summary, generate_documentation, analyze_security, generate_recommendations
from core import rag

app = FastAPI(title="Aegis RE — AI Reverse Engineering Agent API")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

# Configure CORS for Vite React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global active project state (in-memory session for demonstration purposes)
# In production, this can be session-based or database-stored
current_project = {
    "files": {},          # {rel_path: content}
    "tree": [],           # structured JSON tree
    "dependencies": {},   # dependencies dict
    "summary": "",        # project overview markdown
    "security": "",       # security analysis markdown
    "recommendations": "", # recommendations markdown
    "docs_cache": {},     # {rel_path: docs_markdown}
    "temp_dir": None      # path to extracted temp directory
}

class ChatRequest(BaseModel):
    question: str
    history: list = []

@app.post("/api/upload")
async def upload_codebase(file: UploadFile = File(...)):
    """Upload a zip file containing the codebase and perform initial analysis."""
    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Only ZIP archives are supported.")

    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="The server is missing its Gemini API key. Set GEMINI_API_KEY in backend/.env and restart the backend."
        )
    api_key = GEMINI_API_KEY

    # Cleanup existing workspace
    global current_project
    if current_project["temp_dir"] and os.path.exists(current_project["temp_dir"]):
        try:
            shutil.rmtree(current_project["temp_dir"])
        except Exception:
            pass

    # Setup a secure temp directory in the workspace to extract
    temp_workspace = os.path.join(os.getcwd(), "temp_workspace")
    os.makedirs(temp_workspace, exist_ok=True)
    temp_dir = os.path.join(temp_workspace, str(uuid.uuid4()))
    os.makedirs(temp_dir, exist_ok=True)

    zip_path = os.path.join(temp_dir, file.filename)
    extract_path = os.path.join(temp_dir, "extracted")

    try:
        # Save uploaded file
        with open(zip_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        # Extract and load files
        extracted_files = extract_zip(zip_path, extract_path)
        if not extracted_files:
            raise HTTPException(status_code=400, detail="No supported source code files found in the ZIP archive.")

        # Build file tree JSON
        tree_json = build_tree_json(list(extracted_files.keys()))

        # Run dependency parsing
        deps = parse_dependencies(extracted_files)
        deps_str = f"External Dependencies:\n" + "\n".join(deps.get("external", []))

        # Generate structural overview summary
        summary = generate_summary(
            file_tree="\n".join(sorted(extracted_files.keys())),
            sample_files=extracted_files,
            api_key=api_key
        )

        # Run Security vulnerability scan
        security_findings = analyze_security(extracted_files, api_key=api_key)

        # Run recommendations
        recommendations = generate_recommendations(summary, deps_str, api_key=api_key)

        # Build LlamaIndex semantic search index
        rag.build_index(extracted_files, api_key=api_key)

        # Save to memory session
        current_project = {
            "files": extracted_files,
            "tree": tree_json,
            "dependencies": deps,
            "summary": summary,
            "security": security_findings,
            "recommendations": recommendations,
            "docs_cache": {},
            "temp_dir": temp_dir
        }

        return {
            "status": "success",
            "message": "Codebase successfully uploaded and analyzed.",
            "file_count": len(extracted_files),
            "summary": summary,
            "tree": tree_json,
            "dependencies": deps,
            "security": security_findings,
            "recommendations": recommendations
        }

    except Exception as e:
        # Cleanup on failure
        if os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
            except Exception:
                pass
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.get("/api/docs")
async def get_file_docs(
    filepath: str = Query(..., description="Relative path of file to get documentation for")
):
    """Retrieve or generate developer documentation for a specific file (lazy loading)."""
    global current_project
    if not current_project["files"]:
        raise HTTPException(status_code=400, detail="Please upload a codebase first.")

    if filepath not in current_project["files"]:
        raise HTTPException(status_code=404, detail=f"File '{filepath}' not found in the codebase.")

    # Check if docs are already cached
    if filepath in current_project["docs_cache"]:
        return {
            "filepath": filepath,
            "code": current_project["files"][filepath],
            "docs": current_project["docs_cache"][filepath]
        }

    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="The server is missing its Gemini API key.")
    api_key = GEMINI_API_KEY

    # Generate on the fly
    try:
        content = current_project["files"][filepath]
        docs = generate_documentation(filepath, content, api_key=api_key)
        current_project["docs_cache"][filepath] = docs
        return {
            "filepath": filepath,
            "code": content,
            "docs": docs
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate documentation: {str(e)}")

@app.post("/api/chat")
async def chat_with_codebase(request: ChatRequest):
    """Resolve codebase QA queries using RAG."""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="The server is missing its Gemini API key.")
    api_key = GEMINI_API_KEY

    try:
        answer = rag.chat(
            question=request.question,
            history=request.history,
            api_key=api_key
        )
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")

@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "has_active_codebase": bool(current_project["files"]),
        "api_key_configured": bool(GEMINI_API_KEY)
    }

# Optional cleanup on shutdown
@app.on_event("shutdown")
def cleanup_temp_files():
    temp_workspace = os.path.join(os.getcwd(), "temp_workspace")
    if os.path.exists(temp_workspace):
        try:
            shutil.rmtree(temp_workspace)
        except Exception:
            pass
