import google.generativeai as genai
import os
import json

def get_model(api_key: str = None):
    """Retrieve and configure the Gemini model client."""
    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise ValueError("Gemini API Key is missing. Provide it in the UI or set the GEMINI_API_KEY environment variable.")
    genai.configure(api_key=key)
    # Using gemini-2.5-flash as the efficient free-tier model
    return genai.GenerativeModel("gemini-2.5-flash")

def generate_summary(file_tree: str, sample_files: dict, api_key: str = None) -> str:
    """Analyze the codebase file tree and core files to generate a project summary."""
    model = get_model(api_key)
    
    # Create sample representations of the main files
    sample = "\n\n".join([
        f"### File: {k}\n```\n{v[:600]}\n```" 
        for k, v in list(sample_files.items())[:5]
    ])

    prompt = f"""You are a professional software analyst. Analyze the following project codebase overview and structure.

File structure:
{file_tree}

Key file samples:
{sample}

Provide a comprehensive, high-quality summary of this codebase. Format it in clean Markdown with the following structure:
1. **Project Overview**: A 2-3 sentence summary of the project's purpose and scope.
2. **Core Modules & Architecture**: Explain the structure of the project, detailing what the key folders and files are responsible for.
3. **Inferred Tech Stack**: List all languages, frameworks, libraries, and tools used or implied, and explain why they were selected.
"""
    response = model.generate_content(prompt)
    return response.text

def generate_documentation(filepath: str, content: str, api_key: str = None) -> str:
    """Generate developer documentation for a single file."""
    model = get_model(api_key)
    prompt = f"""Generate concise, professional developer documentation for the code file below.
File name: {filepath}

Code Content:
```
{content[:4000]}
```

Provide the documentation in clean Markdown including:
1. **Module Purpose**: What does this file do?
2. **Key Classes and Functions**: Major definitions, their arguments, and return types.
3. **Dependencies**: Imports and dependencies used in this file.
4. **Usage Example**: Simple usage pattern or function invocation logic.
"""
    response = model.generate_content(prompt)
    return response.text

def analyze_security(files: dict, api_key: str = None) -> str:
    """Review code for potential security issues (SQL injection, hardcoded secrets, eval, etc.)."""
    model = get_model(api_key)
    
    # Combine code snippets for analysis (limiting size)
    combined = "\n\n".join([
        f"### File: {k}\n```\n{v[:800]}\n```" 
        for k, v in list(files.items())[:15]
    ])

    prompt = f"""You are a security auditor. Inspect the codebase for security vulnerabilities, coding issues, or operational risks.

Focus on:
- Hardcoded secrets, passwords, or API credentials.
- SQL Injection vulnerabilities.
- Vulnerable usage of `eval()`, `exec()`, or dangerous commands.
- Insufficient input sanitization or validation.
- Risky dependency usage or insecure logic.

Analyze this codebase:
{combined}

Format your audit as a beautiful Markdown report:
- If issues are found, list each issue under a subheading:
  - **Vulnerability**: Clear name (e.g. "Hardcoded API Key in config.py")
  - **Severity**: [Low / Medium / High / Critical]
  - **Location**: File path and rough line reference
  - **Details**: Brief description of the issue
  - **Fix Suggestion**: How to solve it (with code snippet)
- If NO issues are found, state clearly that no obvious vulnerabilities were detected during the prompt scan.
"""
    response = model.generate_content(prompt)
    return response.text

def generate_recommendations(summary: str, dependencies: str, api_key: str = None) -> str:
    """Generate recommendations for modernization, refactoring, and quick wins."""
    model = get_model(api_key)
    prompt = f"""Based on the following codebase overview and parsed dependencies, provide actionable recommendations for engineering modernization and technical debt resolution.

Project Overview:
{summary}

Parsed Dependencies:
{dependencies}

Format your advice in clean Markdown with the following subheadings:
1. **Modernization Path**: Upgrades, frameworks, design patterns, or newer libraries to adopt.
2. **Top 3 Technical Debt Items**: The most significant technical debts found in the structure or dependencies.
3. **Quick Wins**: Low-effort, high-impact fixes that can be completed in under an hour (e.g. adding gitignore, linting configs, separating configs).
"""
    response = model.generate_content(prompt)
    return response.text
