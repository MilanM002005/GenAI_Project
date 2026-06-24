# AI Reverse Engineering Agent — Implementation Guide

---

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

| # | Feature | Keep? | Notes |
|---|---------|--------|-------|
| 1 | Source Code Analysis | ✅ | Core feature — parse structure |
| 2 | Documentation Generation | ✅ | LLM-generated per module |
| 3 | Architecture Reconstruction | ✅ | Simplified — text description |
| 4 | AI Code Explanation | ✅ | Core LLM feature |
| 5 | Dependency Analysis | ✅ | Parse imports/requirements.txt |
| 6 | Security Vulnerability Detection | ✅ | Prompt-based, simplified |
| 7 | Modernization Recommendations | ✅ | LLM output |
| 8 | Interactive Chat Interface | ✅ | Core — RAG over codebase |
| 9 | Cloud Deployment | ✅ | Hugging Face Spaces (free) |

---

## Tech Stack

### Backend — Python
| Layer | Tool | Why |
|-------|------|-----|
| LLM | `google-generativeai` (Gemini 1.5 Flash) or `openai` | Free tier / workshop API keys |
| Embeddings + RAG | `llama-index` or `langchain` + `chromadb` | Easy local vector store |
| Code parsing | Python `ast`, `os`, `zipfile` stdlib | No extra deps |
| Dependency parsing | `pipreqs`, manual parse of `requirements.txt` / `package.json` | Simple |
| Security scan | Prompt-based (LLM) + `bandit` (optional) | `pip install bandit` |

### Frontend —  html css / react 


### Step 1 — Requirements File
# requirements.txt
```

google-generativeai>=0.5
llama-index>=0.10
llama-index-llms-gemini
llama-index-embeddings-gemini
chromadb
python-dotenv
```





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
   - *"What does the main.py file do?"*
   - *"Where is user authentication handled?"*
   - *"What database is this project using?"*
