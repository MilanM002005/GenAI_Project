import uvicorn
import os

if __name__ == "__main__":
    print("Starting bot FastAPI Backend Server...")
    print("URL: http://127.0.0.1:8000")
    print("Temp workspace will be created inside: temp_workspace/\n")
    
    # Change working directory to backend folder so imports resolve correctly
    backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
    os.chdir(backend_dir)
    
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True, app_dir=backend_dir)
