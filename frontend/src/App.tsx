import { useState, useEffect } from 'react';
import { Plus, Trash2, Check, LogOut, LogIn, UserPlus, Folder, Inbox, LayoutDashboard, Edit2, X, Users } from 'lucide-react';
import './index.css';

interface User {
  id: number;
  email: string;
  is_active: boolean;
  role: string;
}

interface Todo {
  id: number;
  title: string;
  description: string | null;
  completed: boolean;
  project_id: number | null;
  owner_id: number;
}

interface Project {
  id: number;
  title: string;
  description: string | null;
  owner_id: number;
}

const API_URL = 'http://localhost:8000';

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  
  // Auth state
  const [isLoginView, setIsLoginView] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // App state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);
  
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'todos' | 'admin'>('todos');
  
  const [newTitle, setNewTitle] = useState('');
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [loading, setLoading] = useState(false);

  // Edit state
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [editProjectTitle, setEditProjectTitle] = useState('');
  
  const [editingTodoId, setEditingTodoId] = useState<number | null>(null);
  const [editTodoTitle, setEditTodoTitle] = useState('');

  useEffect(() => {
    if (token) {
      fetchCurrentUser();
      fetchTodos();
      fetchProjects();
    }
  }, [token]);

  useEffect(() => {
    if (viewMode === 'admin' && token) {
      fetchAllUsers();
    }
  }, [viewMode, token]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    
    if (isLoginView) {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);

      try {
        const res = await fetch(`${API_URL}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData,
        });
        
        if (!res.ok) throw new Error('Invalid credentials');
        
        const data = await res.json();
        setToken(data.access_token);
        localStorage.setItem('token', data.access_token);
      } catch (err: any) {
        setAuthError(err.message);
      }
    } else {
      try {
        const res = await fetch(`${API_URL}/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || 'Signup failed');
        }
        
        setIsLoginView(true);
        setAuthError('Signup successful! Please log in.');
      } catch (err: any) {
        setAuthError(err.message);
      }
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('token');
    setCurrentUser(null);
    setTodos([]);
    setProjects([]);
    setUsersList([]);
    setSelectedProjectId(null);
    setViewMode('todos');
  };

  // --- USER API ---
  const fetchCurrentUser = async () => {
    try {
      const response = await fetch(`${API_URL}/users/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 401) return handleLogout();
      const data = await response.json();
      setCurrentUser(data);
    } catch (error) {
      console.error('Error fetching current user:', error);
    }
  };

  const fetchAllUsers = async () => {
    try {
      const response = await fetch(`${API_URL}/users/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 403) {
        setViewMode('todos');
        return;
      }
      if (response.ok) {
        const data = await response.json();
        setUsersList(data);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const deleteUser = async (id: number) => {
    try {
      const response = await fetch(`${API_URL}/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        setUsersList(usersList.filter(u => u.id !== id));
      }
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  const updateUserRole = async (id: number, newRole: string) => {
    try {
      const response = await fetch(`${API_URL}/users/${id}/role`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ role: newRole })
      });
      if (response.ok) {
        const updatedUser = await response.json();
        setUsersList(usersList.map(u => u.id === id ? updatedUser : u));
      }
    } catch (error) {
      console.error('Error updating role:', error);
    }
  };

  // --- PROJECTS API ---
  const fetchProjects = async () => {
    try {
      const response = await fetch(`${API_URL}/projects/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 401) return handleLogout();
      const data = await response.json();
      setProjects(data);
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const addProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectTitle.trim()) return;

    try {
      const response = await fetch(`${API_URL}/projects/`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title: newProjectTitle }),
      });
      if (response.status === 401) return handleLogout();
      const newProject = await response.json();
      setProjects([...projects, newProject]);
      setNewProjectTitle('');
      setSelectedProjectId(newProject.id);
      setViewMode('todos');
    } catch (error) {
      console.error('Error adding project:', error);
    }
  };

  const saveProjectEdit = async (id: number) => {
    if (!editProjectTitle.trim()) {
      setEditingProjectId(null);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/projects/${id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title: editProjectTitle }),
      });
      if (response.status === 401) return handleLogout();
      const updatedProject = await response.json();
      setProjects(projects.map((p) => (p.id === id ? updatedProject : p)));
      setEditingProjectId(null);
    } catch (error) {
      console.error('Error updating project:', error);
    }
  };

  const deleteProject = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(`${API_URL}/projects/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 401) return handleLogout();
      setProjects(projects.filter((p) => p.id !== id));
      setTodos(todos.filter(t => t.project_id !== id));
      if (selectedProjectId === id) setSelectedProjectId(null);
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  };

  // --- TODOS API ---
  const fetchTodos = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/todos/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 401) return handleLogout();
      const data = await response.json();
      setTodos(data);
    } catch (error) {
      console.error('Error fetching todos:', error);
    } finally {
      setLoading(false);
    }
  };

  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const response = await fetch(`${API_URL}/todos/`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title: newTitle, project_id: selectedProjectId }),
      });
      if (response.status === 401) return handleLogout();
      const newTodo = await response.json();
      setTodos([newTodo, ...todos]);
      setNewTitle('');
    } catch (error) {
      console.error('Error adding todo:', error);
    }
  };

  const toggleTodo = async (todo: Todo) => {
    try {
      if (!todo.completed) {
        const response = await fetch(`${API_URL}/todos/${todo.id}/complete`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.status === 401) return handleLogout();
        const updatedTodo = await response.json();
        setTodos(todos.map((t) => (t.id === todo.id ? updatedTodo : t)));
      } else {
        const response = await fetch(`${API_URL}/todos/${todo.id}`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ completed: false }),
        });
        if (response.status === 401) return handleLogout();
        const updatedTodo = await response.json();
        setTodos(todos.map((t) => (t.id === todo.id ? updatedTodo : t)));
      }
    } catch (error) {
      console.error('Error toggling todo:', error);
    }
  };

  const saveTodoEdit = async (id: number) => {
    if (!editTodoTitle.trim()) {
      setEditingTodoId(null);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/todos/${id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title: editTodoTitle }),
      });
      if (response.status === 401) return handleLogout();
      const updatedTodo = await response.json();
      setTodos(todos.map((t) => (t.id === id ? updatedTodo : t)));
      setEditingTodoId(null);
    } catch (error) {
      console.error('Error updating todo:', error);
    }
  };

  const deleteTodo = async (id: number) => {
    try {
      const response = await fetch(`${API_URL}/todos/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 401) return handleLogout();
      setTodos(todos.filter((t) => t.id !== id));
    } catch (error) {
      console.error('Error deleting todo:', error);
    }
  };


  // --- RENDER VIEWS ---
  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-container">
          <div className="auth-card">
            <div className="header" style={{ marginBottom: '2rem' }}>
              <h1>{isLoginView ? 'Welcome Back' : 'Create Account'}</h1>
              <p>Todos</p>
            </div>
            
            <form className="auth-form" onSubmit={handleAuth}>
              {authError && <div className="auth-error">{authError}</div>}
              
              <input
                type="email"
                className="input-field"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                className="input-field"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              
              <button type="submit" className="auth-btn">
                {isLoginView ? <><LogIn size={18} /> Sign In</> : <><UserPlus size={18} /> Sign Up</>}
              </button>
            </form>
            
            <div className="auth-switch">
              {isLoginView ? "Don't have an account? " : "Already have an account? "}
              <button onClick={() => setIsLoginView(!isLoginView)}>
                {isLoginView ? 'Sign up' : 'Log in'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const visibleTodos = todos.filter(t => t.project_id === selectedProjectId);
  const selectedProjectTitle = selectedProjectId === null 
    ? "Inbox" 
    : projects.find(p => p.id === selectedProjectId)?.title || "Project";

  return (
    <div className="app-layout">
      {/* Sidebar for Projects */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2><LayoutDashboard size={22} /> Todos</h2>
        </div>
        
        <nav className="nav-menu">
          <button 
            className={`nav-item ${viewMode === 'todos' && selectedProjectId === null ? 'active' : ''}`}
            onClick={() => { setViewMode('todos'); setSelectedProjectId(null); }}
          >
            <div className="nav-item-content">
              <Inbox size={18} /> <span>Inbox</span>
            </div>
          </button>

          {(currentUser?.role === 'admin' || currentUser?.role === 'owner') && (
            <button 
              className={`nav-item ${viewMode === 'admin' ? 'active' : ''}`}
              onClick={() => { setViewMode('admin'); setSelectedProjectId(null); }}
            >
              <div className="nav-item-content">
                <Users size={18} /> <span>Admin Panel</span>
              </div>
            </button>
          )}

          <div className="nav-section">
            <h3>Projects</h3>
            {projects.map(p => (
              <div key={p.id} className={`nav-item-wrapper ${viewMode === 'todos' && selectedProjectId === p.id ? 'active' : ''}`}>
                {editingProjectId === p.id ? (
                  <div className="inline-edit-form">
                    <input 
                      autoFocus
                      type="text" 
                      value={editProjectTitle} 
                      onChange={(e) => setEditProjectTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveProjectEdit(p.id);
                        if (e.key === 'Escape') setEditingProjectId(null);
                      }}
                    />
                    <button className="icon-btn success" onClick={() => saveProjectEdit(p.id)}><Check size={14}/></button>
                    <button className="icon-btn danger" onClick={() => setEditingProjectId(null)}><X size={14}/></button>
                  </div>
                ) : (
                  <button 
                    className={`nav-item ${viewMode === 'todos' && selectedProjectId === p.id ? 'active' : ''}`}
                    onClick={() => { setViewMode('todos'); setSelectedProjectId(p.id); }}
                  >
                    <div className="nav-item-content">
                      <Folder size={18} /> <span>{p.title}</span>
                    </div>
                    <div className="nav-item-actions">
                      <div className="icon-btn" onClick={(e) => {
                        e.stopPropagation();
                        setEditProjectTitle(p.title);
                        setEditingProjectId(p.id);
                      }}>
                        <Edit2 size={14} />
                      </div>
                      <div className="icon-btn delete-hover" onClick={(e) => deleteProject(p.id, e)}>
                        <Trash2 size={14} />
                      </div>
                    </div>
                  </button>
                )}
              </div>
            ))}

            <form className="add-project-form" onSubmit={addProject}>
              <input 
                type="text" 
                placeholder="New project..." 
                value={newProjectTitle}
                onChange={(e) => setNewProjectTitle(e.target.value)}
              />
              <button type="submit" title="Add Project"><Plus size={16}/></button>
            </form>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div style={{ padding: '0.8rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Logged in as {currentUser?.email} <br/>
            Role: <span style={{color: 'var(--text-main)', textTransform: 'capitalize'}}>{currentUser?.role}</span>
          </div>
          <button className="logout-btn" onClick={handleLogout} title="Log out">
            <LogOut size={18} /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {viewMode === 'admin' ? (
          <div className="app-container">
            <div className="header">
              <h1>Admin Dashboard</h1>
              <p>Manage system users and access levels.</p>
            </div>
            
            <div className="todos-list">
              {usersList.map((u, index) => (
                <div 
                  key={u.id} 
                  className="todo-item"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="todo-content" style={{ display: 'flex', alignItems: 'center' }}>
                    <div className="todo-title">{u.email}</div>
                    <span className={`role-badge ${u.role}`}>{u.role}</span>
                  </div>
                  
                  <div className="actions">
                    {currentUser?.role === 'owner' && u.id !== currentUser.id && (
                      <>
                        <select 
                          className="role-select" 
                          value={u.role} 
                          onChange={(e) => updateUserRole(u.id, e.target.value)}
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                          <option value="owner">Owner</option>
                        </select>
                        <button 
                          className="action-btn delete" 
                          onClick={() => deleteUser(u.id)}
                          title="Delete User"
                        >
                          <Trash2 size={18} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="app-container">
            <div className="header">
              <h1>{selectedProjectTitle}</h1>
              <p>Stay focused, stay productive.</p>
            </div>

            <form className="add-todo-form" onSubmit={addTodo}>
              <div className="input-group">
                <input
                  type="text"
                  className="input-field"
                  placeholder={`Add todo to ${selectedProjectTitle}...`}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>
              <button type="submit" className="add-btn">
                <Plus size={24} />
              </button>
            </form>

            <div className="todos-list">
              {loading ? (
                <div className="empty-state">Loading your todos...</div>
              ) : visibleTodos.length === 0 ? (
                <div className="empty-state">No todos here yet. Enjoy your day!</div>
              ) : (
                visibleTodos.map((todo, index) => (
                  <div 
                    key={todo.id} 
                    className={`todo-item ${todo.completed ? 'completed' : ''}`}
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <div className="checkbox-wrapper" onClick={() => toggleTodo(todo)}>
                      <div className="custom-checkbox">
                        {todo.completed && <Check size={16} strokeWidth={3} />}
                      </div>
                    </div>
                    
                    <div className="todo-content">
                      {editingTodoId === todo.id ? (
                        <div className="inline-edit-form todo-edit">
                          <input 
                            autoFocus
                            type="text" 
                            value={editTodoTitle} 
                            onChange={(e) => setEditTodoTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveTodoEdit(todo.id);
                              if (e.key === 'Escape') setEditingTodoId(null);
                            }}
                          />
                        </div>
                      ) : (
                        <div className="todo-title">{todo.title}</div>
                      )}
                    </div>
                    
                    <div className="actions">
                      {editingTodoId === todo.id ? (
                        <>
                          <button className="action-btn success" onClick={() => saveTodoEdit(todo.id)}>
                            <Check size={18} />
                          </button>
                          <button className="action-btn" onClick={() => setEditingTodoId(null)}>
                            <X size={18} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button 
                            className="action-btn" 
                            onClick={() => {
                              setEditTodoTitle(todo.title);
                              setEditingTodoId(todo.id);
                            }}
                            title="Edit"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button 
                            className="action-btn delete" 
                            onClick={() => deleteTodo(todo.id)}
                            title="Delete"
                          >
                            <Trash2 size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
