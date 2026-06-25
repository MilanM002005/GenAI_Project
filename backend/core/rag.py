from llama_index.core import VectorStoreIndex, Document
from llama_index.core.settings import Settings
from llama_index.llms.gemini import Gemini
from llama_index.embeddings.gemini import GeminiEmbedding
import os

_index = None

def init_settings(api_key: str = None):
    """Dynamically set LlamaIndex LLM and Embedding models with API key."""
    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise ValueError("Gemini API Key is missing. Provide it in the UI or set the GEMINI_API_KEY environment variable.")
    
    # Configure LLM and Embeddings using the Gemini API Key
    Settings.llm = Gemini(api_key=key, model_name="models/gemini-2.5-flash")
    Settings.embed_model = GeminiEmbedding(api_key=key, model_name="models/gemini-embedding-001")

def build_index(files: dict, api_key: str = None):
    """Build LlamaIndex in-memory vector index from the extracted codebase files."""
    global _index
    init_settings(api_key)
    
    documents = []
    for filepath, content in files.items():
        # Keep documentation/search index size healthy, truncate large files
        truncated_content = content[:6000]
        text_block = f"File Path: {filepath}\n\nCode Content:\n{truncated_content}"
        documents.append(Document(text=text_block, id_=filepath))
        
    _index = VectorStoreIndex.from_documents(documents)

def _format_history(history: list = None) -> str:
    if not history:
        return ""
    context = "Previous Conversation History:\n"
    for msg in history[-5:]:  # Last 5 messages
        role = msg.get("role", "user")
        content = msg.get("content", "")
        context += f"{role.upper()}: {content}\n"
    return context + "\n"

def chat(question: str, history: list = None, api_key: str = None) -> str:
    """Answer a question. Uses RAG over the uploaded codebase if one is indexed,
    otherwise falls back to a general-purpose Gemini chat agent."""
    global _index
    init_settings(api_key)
    context = _format_history(history)

    if _index is None:
        # No codebase uploaded yet — act as a standalone Q&A chat agent.
        response = Settings.llm.complete(f"{context}Question: {question}")
        return str(response)

    query_engine = _index.as_query_engine()
    full_query = f"{context}Question: {question}\nAnswer using the codebase context above."
    response = query_engine.query(full_query)
    return str(response)
