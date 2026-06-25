import React, { useState, useEffect, useRef } from 'react';

// Custom inline Markdown parser to render LLM responses beautifully without third-party dependencies
const parseInlineMarkdown = (text) => {
  const parts = [];
  const regex = /(\*\*.*?\*\*|`.*?`)/g;
  let match;
  let lastIndex = 0;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    const textBefore = text.substring(lastIndex, match.index);
    if (textBefore) parts.push(textBefore);

    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={key++}>{token.substring(2, token.length - 2)}</strong>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(<code key={key++}>{token.substring(1, token.length - 1)}</code>);
    }

    lastIndex = regex.lastIndex;
  }

  const textAfter = text.substring(lastIndex);
  if (textAfter) parts.push(textAfter);

  return parts.length > 0 ? parts : text;
};

const Markdown = ({ content }) => {
  if (!content) return null;
  const lines = content.split('\n');
  let inCodeBlock = false;
  let codeLines = [];
  const rendered = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        rendered.push(
          <pre key={`code-${i}`}>
            <code>{codeLines.join('\n')}</code>
          </pre>
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Headers
    if (line.startsWith('### ')) {
      rendered.push(<h3 key={i}>{line.substring(4)}</h3>);
    } else if (line.startsWith('## ')) {
      rendered.push(<h2 key={i}>{line.substring(3)}</h2>);
    } else if (line.startsWith('# ')) {
      rendered.push(<h1 key={i}>{line.substring(2)}</h1>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      rendered.push(<li key={i}>{parseInlineMarkdown(line.substring(2))}</li>);
    } else if (line.trim() === '') {
      // Skip duplicate spacing
      if (i > 0 && lines[i - 1].trim() !== '') {
        rendered.push(<div key={`br-${i}`} style={{ height: '8px' }}></div>);
      }
    } else {
      rendered.push(<p key={i}>{parseInlineMarkdown(line)}</p>);
    }
  }

  return <div className="markdown-body">{rendered}</div>;
};

// Folder Tree Node Component
const TreeNode = ({ node, onSelectFile, selectedFile, expandedNodes, toggleNode }) => {
  const isDirectory = node.type === 'directory';
  const isExpanded = expandedNodes[node.path];

  if (isDirectory) {
    return (
      <div className="tree-node">
        <div 
          className="tree-row" 
          onClick={() => toggleNode(node.path)}
        >
          <span className="node-icon">{isExpanded ? '📂' : '📁'}</span>
          <span>{node.name}</span>
        </div>
        {isExpanded && node.children && (
          <div className="tree-children" style={{ marginLeft: '12px' }}>
            {node.children.map((child, idx) => (
              <TreeNode 
                key={idx} 
                node={child} 
                onSelectFile={onSelectFile} 
                selectedFile={selectedFile}
                expandedNodes={expandedNodes}
                toggleNode={toggleNode}
              />
            ))}
          </div>
        )}
      </div>
    );
  } else {
    const isSelected = selectedFile === node.path;
    return (
      <div className="tree-node">
        <div 
          className={`tree-row ${isSelected ? 'selected' : ''}`} 
          onClick={() => onSelectFile(node.path)}
        >
          <span className="node-icon">📄</span>
          <span>{node.name}</span>
        </div>
      </div>
    );
  }
};

// Helper to turn a fetch/network failure into a readable message
const describeFetchError = (err, fallback) => {
  if (err instanceof TypeError) {
    return 'Cannot reach the backend server. Make sure it is running at http://127.0.0.1:8000.';
  }
  return err.message || fallback;
};

export default function App() {
  const [theme, setTheme] = useState('light');
  const [backendStatus, setBackendStatus] = useState('checking'); // checking | online | offline | no-key
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Dashboard analysis results
  const [analysisData, setAnalysisData] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [chatOnlyMode, setChatOnlyMode] = useState(false);
  
  // File Explorer State
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFileContent, setSelectedFileContent] = useState(null);
  const [selectedFileDocs, setSelectedFileDocs] = useState(null);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState({});

  // Chatbot state
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isChatting, setIsChatting] = useState(false);
  
  const chatEndRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const checkBackendHealth = async () => {
    setBackendStatus('checking');
    try {
      const response = await fetch('/api/health');
      if (!response.ok) {
        setBackendStatus('offline');
        return;
      }
      const data = await response.json();
      setBackendStatus(data.api_key_configured ? 'online' : 'no-key');
    } catch {
      setBackendStatus('offline');
    }
  };

  useEffect(() => {
    checkBackendHealth();
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory]);

  const toggleNode = (path) => {
    setExpandedNodes(prev => ({
      ...prev,
      [path]: !prev[path]
    }));
  };

  const processUpload = async (file) => {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.zip')) {
      setErrorMessage('Only .zip archives are supported.');
      return;
    }

    if (backendStatus === 'offline') {
      setErrorMessage('Cannot reach the backend server. Make sure it is running at http://127.0.0.1:8000.');
      return;
    }

    if (backendStatus === 'no-key') {
      setErrorMessage('The server is missing its Gemini API key. Set GEMINI_API_KEY in backend/.env and restart the backend.');
      return;
    }

    setIsUploading(true);
    setErrorMessage('');
    setUploadProgress(['Extracting codebase archive...', 'Analyzing module structure...']);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Step update simulations
      setTimeout(() => {
        setUploadProgress(prev => [...prev, 'Parsing internal imports & package requirements...']);
      }, 1500);

      setTimeout(() => {
        setUploadProgress(prev => [...prev, 'Generating high-level project summary...', 'Detecting security vulnerabilities...']);
      }, 3000);

      setTimeout(() => {
        setUploadProgress(prev => [...prev, 'Configuring semantic code index...']);
      }, 5000);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Analysis failed.');
      }

      const data = await response.json();
      setAnalysisData(data);
      
      // Auto expand first level folders in file tree
      const newExpanded = {};
      data.tree.forEach(node => {
        if (node.type === 'directory') {
          newExpanded[node.path] = true;
        }
      });
      setExpandedNodes(newExpanded);
      
      setActiveTab('overview');
      setSelectedFile(null);
      setSelectedFileContent(null);
      setSelectedFileDocs(null);
      setChatHistory([]);
    } catch (err) {
      setErrorMessage(describeFetchError(err, 'An unexpected error occurred during analysis.'));
    } finally {
      setIsUploading(false);
      setUploadProgress([]);
    }
  };

  const handleFileInputChange = (event) => {
    const file = event.target.files[0];
    processUpload(file);
    event.target.value = '';
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    processUpload(file);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const loadFileDocs = async (filepath) => {
    setSelectedFile(filepath);
    setIsLoadingDocs(true);
    setSelectedFileDocs(null);
    setSelectedFileContent(null);

    try {
      const response = await fetch(`/api/docs?filepath=${encodeURIComponent(filepath)}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to retrieve file documentation.');
      }
      const data = await response.json();
      setSelectedFileContent(data.code);
      setSelectedFileDocs(data.docs);
    } catch (err) {
      setErrorMessage(describeFetchError(err, 'Failed to retrieve file documentation.'));
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const handleSendChatMessage = async (e) => {
    e.preventDefault();
    if (!chatQuestion.trim()) return;

    const userMsg = { role: 'user', content: chatQuestion };
    setChatHistory(prev => [...prev, userMsg]);
    setChatQuestion('');
    setIsChatting(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          question: chatQuestion,
          history: chatHistory
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Chat RAG engine failed.');
      }
      const data = await response.json();
      setChatHistory(prev => [...prev, { role: 'assistant', content: data.answer }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'assistant', content: `⚠️ ${describeFetchError(err, 'Chat RAG engine failed.')}` }]);
    } finally {
      setIsChatting(false);
    }
  };

  const clearProject = () => {
    setAnalysisData(null);
    setSelectedFile(null);
    setSelectedFileContent(null);
    setSelectedFileDocs(null);
    setChatHistory([]);
    setChatOnlyMode(false);
  };

  const enterChatOnlyMode = () => {
    setChatOnlyMode(true);
    setActiveTab('chat');
  };

  const showWorkspace = (analysisData || chatOnlyMode) && !isUploading;

  return (
    <div className="app-container">
      {errorMessage && (
        <div className="toast" onClick={() => setErrorMessage('')}>
          {errorMessage} (Click to dismiss)
        </div>
      )}

      {/* Left Sidebar */}
      <aside className="sidebar">
        <div className="logo-section">
          <h1>🛡️Dixtra</h1>
          <div className="logo-sub">Reverse Engineering Agent</div>
        </div>

        <div className="sidebar-content">
          <div className={`status-card status-${backendStatus}`}>
            <div className="status-row">
              <span className="status-dot"></span>
              <span className="status-label">
                {backendStatus === 'checking' && 'Checking backend…'}
                {backendStatus === 'online' && 'Backend connected'}
                {backendStatus === 'offline' && 'Backend unreachable'}
                {backendStatus === 'no-key' && 'API key not configured'}
              </span>
            </div>
            {backendStatus === 'offline' && (
              <p className="status-detail">
                Start the backend with <code>python run_backend.py</code>, then{' '}
                <button className="status-retry" onClick={checkBackendHealth}>retry</button>.
              </p>
            )}
            {backendStatus === 'no-key' && (
              <p className="status-detail">
                Add <code>GEMINI_API_KEY</code> to <code>backend/.env</code> and restart the backend, then{' '}
                <button className="status-retry" onClick={checkBackendHealth}>retry</button>.
              </p>
            )}
          </div>

          <div className="sidebar-info-card">
            <h4>💡 How to use</h4>
            <p>1. The server is pre-configured with a Gemini API key — no key needed here.</p>
            <p>2. Upload a ZIP of your codebase repository.</p>
            <p>3. Explore structure, dependencies, security audit, and chat with your code.</p>
          </div>
        </div>

        <div className="theme-toggle-container">
          <button className="theme-btn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? '🌙 Switch to Dark Theme' : '☀️ Switch to Light Theme'}
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="main-panel">
        {!showWorkspace && !isUploading ? (
          // Welcome Screen
          <div className="welcome-screen">
            <h2 className="welcome-title">Deconstruct Codebases Instantly</h2>
            <p className="welcome-subtitle">
              Upload your code repository. Securely analyze its structure, dependencies, security risks, documentation, and query it semantically.
            </p>
            <label
              className={`upload-zone ${isDragging ? 'dragging' : ''} ${backendStatus !== 'online' ? 'disabled' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept=".zip"
                onChange={handleFileInputChange}
                style={{ display: 'none' }}
              />
              <div className="upload-icon">📦</div>
              <div className="upload-text">Select or Drag ZIP Repository</div>
              <div className="upload-subtext">Supports .zip archives containing Python, JavaScript, TypeScript, Go, C++, Rust, etc.</div>
            </label>
            <button className="chat-only-link" onClick={enterChatOnlyMode}>
              💬 Or skip uploading — chat with the AI agent directly
            </button>
          </div>
        ) : isUploading ? (
          // Loading Phase Screen
          <div className="welcome-screen">
            <div className="loading-container">
              <div className="spinner-glow"></div>
              <div className="loading-title">Analyzing Codebase...</div>
              <div className="loading-steps">
                {uploadProgress.map((step, idx) => (
                  <div key={idx} className="loading-step active">
                    <div className="step-dot"></div>
                    <div>{step}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          // Main Dashboard Panel with Tabs
          <>
            <div className="tabs-bar">
              <button
                className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
                disabled={!analysisData}
              >
                📊 Overview & Structure
              </button>
              <button
                className={`tab-btn ${activeTab === 'explorer' ? 'active' : ''}`}
                onClick={() => setActiveTab('explorer')}
                disabled={!analysisData}
              >
                📂 Docs & Code Explorer
              </button>
              <button
                className={`tab-btn ${activeTab === 'dependencies' ? 'active' : ''}`}
                onClick={() => setActiveTab('dependencies')}
                disabled={!analysisData}
              >
                🔗 Dependency Graph
              </button>
              <button
                className={`tab-btn ${activeTab === 'security' ? 'active' : ''}`}
                onClick={() => setActiveTab('security')}
                disabled={!analysisData}
              >
                🛡️ Security Audit
              </button>
              <button
                className={`tab-btn ${activeTab === 'recommendations' ? 'active' : ''}`}
                onClick={() => setActiveTab('recommendations')}
                disabled={!analysisData}
              >
                💡 Recommendations
              </button>
              <button
                className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
                onClick={() => setActiveTab('chat')}
              >
                💬 Q&A Chat Agent
              </button>
              <button className="btn-clear" onClick={clearProject}>
                ❌ {analysisData ? 'Clear Analysis' : 'Reset'}
              </button>
            </div>

            <div className="tab-content-frame">
              {activeTab === 'overview' && analysisData && (
                <div className="content-pane">
                  <Markdown content={analysisData.summary} />
                </div>
              )}

              {activeTab === 'explorer' && analysisData && (
                <div className="explorer-split">
                  {/* File tree browser */}
                  <div className="explorer-tree-panel">
                    <h4 style={{ marginBottom: '12px', fontFamily: 'Outfit' }}>Codebase Files</h4>
                    {analysisData.tree.map((node, idx) => (
                      <TreeNode 
                        key={idx} 
                        node={node} 
                        onSelectFile={loadFileDocs} 
                        selectedFile={selectedFile}
                        expandedNodes={expandedNodes}
                        toggleNode={toggleNode}
                      />
                    ))}
                  </div>
                  
                  {/* Documentation & Code viewer */}
                  <div className="explorer-content-panel">
                    {selectedFile ? (
                      isLoadingDocs ? (
                        <div className="content-pane" style={{ justifyContent: 'center', alignItems: 'center' }}>
                          <div className="spinner-glow"></div>
                          <p style={{ color: 'var(--text-secondary)' }}>Generating analysis & documentation for {selectedFile}...</p>
                        </div>
                      ) : (
                        <>
                          <div className="doc-viewer">
                            <h3 style={{ marginBottom: '16px', borderBottom: '1px solid var(--panel-border)', paddingBottom: '8px' }}>
                              📄 Developer Documentation for {selectedFile}
                            </h3>
                            <Markdown content={selectedFileDocs} />
                          </div>
                          {selectedFileContent && (
                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '200px' }}>
                              <div className="code-viewer-header">
                                <span>SOURCE CODE</span>
                                <span>{selectedFile}</span>
                              </div>
                              <pre className="code-viewer-pre">
                                <code>{selectedFileContent}</code>
                              </pre>
                            </div>
                          )}
                        </>
                      )
                    ) : (
                      <div className="content-pane" style={{ justifyContent: 'center', alignItems: 'center' }}>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
                          Select a file in the sidebar to view source code and AI documentation details.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'dependencies' && analysisData && (
                <div className="content-pane">
                  <h2 style={{ fontFamily: 'Outfit', marginBottom: '12px' }}>Package Dependency Graph</h2>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
                    Identified packages from project configurations and Python import statements.
                  </p>

                  <div className="dependency-section-title">External Libraries</div>
                  {analysisData.dependencies.external.length > 0 ? (
                    <div className="dependency-grid">
                      {analysisData.dependencies.external.map((dep, idx) => (
                        <div key={idx} className="dependency-card">📦 {dep}</div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No external package dependencies found.</p>
                  )}

                  <div className="dependency-section-title">Internal Import Links</div>
                  {analysisData.dependencies.internal.length > 0 ? (
                    <div style={{ marginTop: '12px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid var(--panel-border)', color: 'var(--text-primary)' }}>
                            <th style={{ padding: '8px 12px' }}>Source File</th>
                            <th style={{ padding: '8px 12px' }}>Imported Module / Package</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analysisData.dependencies.internal.map((link, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--panel-border)' }}>
                              <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}><code>{link.file}</code></td>
                              <td style={{ padding: '8px 12px', color: 'var(--accent-primary)', fontWeight: '600' }}>{link.imported_module}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No internal links parsed between Python files.</p>
                  )}
                </div>
              )}

              {activeTab === 'security' && analysisData && (
                <div className="content-pane">
                  <Markdown content={analysisData.security} />
                </div>
              )}

              {activeTab === 'recommendations' && analysisData && (
                <div className="content-pane">
                  <Markdown content={analysisData.recommendations} />
                </div>
              )}

              {activeTab === 'chat' && (
                <div className="chat-container">
                  <div className="chat-history">
                    {chatHistory.length === 0 && (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        {analysisData
                          ? '💬 The codebase index is ready! Ask me anything about the repository (e.g. "What does main.py do?", "Where are the config files?").'
                          : '💬 Ask me anything — I\'m a general-purpose AI agent. Upload a codebase anytime to let me answer questions about your repository specifically.'}
                      </div>
                    )}
                    {chatHistory.map((msg, idx) => (
                      <div key={idx} className={`chat-msg ${msg.role}`}>
                        <Markdown content={msg.content} />
                      </div>
                    ))}
                    {isChatting && (
                      <div className="chat-msg assistant" style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
                        Thinking...
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  <form onSubmit={handleSendChatMessage} className="chat-input-bar">
                    <input 
                      type="text" 
                      className="input-glass chat-input" 
                      placeholder="Ask a question about the repository..." 
                      value={chatQuestion}
                      onChange={(e) => setChatQuestion(e.target.value)}
                      disabled={isChatting}
                    />
                    <button type="submit" className="btn-primary" disabled={isChatting || !chatQuestion.trim()}>
                      Send
                    </button>
                  </form>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
