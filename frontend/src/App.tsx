import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Check, LogOut, LogIn, UserPlus, Folder, Inbox, LayoutDashboard, Edit2, X, Users, Paperclip, Upload, User as UserIcon, Calendar, Bell } from 'lucide-react';
import './index.css';

interface User {
  id: number;
  email: string;
  is_active: boolean;
  role: string;
  profile_picture_url: string | null;
}

interface Todo {
  id: number;
  title: string;
  description: string | null;
  completed: boolean;
  project_id: number | null;
  owner_id: number;
  attachment_url: string | null;
  due_date: string | null;
}

interface Project {
  id: number;
  title: string;
  description: string | null;
  owner_id: number;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws';

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  
  // Auth state
  const [isLoginView, setIsLoginView] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // App state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [appError, setAppError] = useState('');
  const [todos, setTodos] = useState<Todo[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);
  
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'todos' | 'admin'>('todos');
  
  const [newTitle, setNewTitle] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [loading, setLoading] = useState(false);

  // Edit state
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [editProjectTitle, setEditProjectTitle] = useState('');
  
  const [editingTodoId, setEditingTodoId] = useState<number | null>(null);
  const [editTodoTitle, setEditTodoTitle] = useState('');
  const [editTodoDueDate, setEditTodoDueDate] = useState('');
  
  const profileInputRef = useRef<HTMLInputElement>(null);
  const todoAttachmentRef = useRef<HTMLInputElement>(null);
  const [activeTodoUploadId, setActiveTodoUploadId] = useState<number | null>(null);

  // Global WebSocket Stats
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [globalTodos, setGlobalTodos] = useState<number>(0);
  const [globalProjects, setGlobalProjects] = useState<number>(0);
  const [notifications, setNotifications] = useState<{id: number, message: string, is_read: boolean, created_at: string}[]>([]);

  useEffect(() => {
    if (!token) return;
    
    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'init' || data.type === 'stats_update' || data.type === 'presence') {
        if (data.online_users !== undefined) setOnlineUsers(data.online_users);
        if (data.total_todos !== undefined) setGlobalTodos(data.total_todos);
        if (data.total_projects !== undefined) setGlobalProjects(data.total_projects);
      } else if (data.type === 'notification') {
        setNotifications(prev => [{id: data.id, message: data.message, is_read: data.is_read, created_at: new Date().toISOString()}, ...prev]);
      }
    };

    return () => {
      ws.close();
    };
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchCurrentUser();
      fetchTodos();
      fetchProjects();
      fetchNotifications();
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
          // Check if it's a Pydantic validation error (array of details)
          if (Array.isArray(errData.detail)) {
            const errorMsg = errData.detail.map((e: any) => `${e.loc[e.loc.length - 1]}: ${e.msg}`).join(', ');
            throw new Error(errorMsg);
          }
          throw new Error(errData.detail || 'Signup failed');
        }
        
        setIsLoginView(true);
        setAuthError('Signup successful! Please log in.');
      } catch (err: any) {
        setAuthError(err.message);
      }
    }
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await fetch(`${API_URL}/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (e) {
        console.error('Logout error:', e);
      }
    }
    setToken(null);
    localStorage.removeItem('token');
    setCurrentUser(null);
    setTodos([]);
    setProjects([]);
    setUsersList([]);
    setSelectedProjectId(null);
    setViewMode('todos');
    setAppError('');
  };

  const handleApiError = async (res: Response) => {
    if (res.status === 401) {
      handleLogout();
      return true;
    }
    if (!res.ok) {
      let errData;
      try { errData = await res.json(); } catch { errData = {}; }
      if (Array.isArray(errData.detail)) {
        setAppError(errData.detail.map((e: any) => `${e.loc[e.loc.length - 1]}: ${e.msg}`).join(', '));
      } else {
        setAppError(errData.detail || 'An error occurred');
      }
      setTimeout(() => setAppError(''), 5000);
      return true;
    }
    return false;
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
      if (await handleApiError(response)) return;
      const updatedUser = await response.json();
      setUsersList(usersList.map(u => u.id === id ? updatedUser : u));
    } catch (error) {
      console.error('Error updating role:', error);
    }
  };

  const uploadProfilePicture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_URL}/users/me/profile_picture`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (await handleApiError(response)) return;
      const updatedUser = await response.json();
      setCurrentUser(updatedUser);
    } catch (error) {
      console.error('Error uploading profile picture:', error);
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
      if (await handleApiError(response)) return;
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
      if (await handleApiError(response)) return;
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
        if (await handleApiError(response)) return;
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
        if (await handleApiError(response)) return;
      const data = await response.json();
      setTodos(data);
    } catch (error) {
      console.error('Error fetching todos:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- NOTIFICATIONS API ---
  const fetchNotifications = async () => {
    try {
      const response = await fetch(`${API_URL}/notifications/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) return;
      const data = await response.json();
      setNotifications(data);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const markNotificationRead = async (id: number) => {
    try {
      const response = await fetch(`${API_URL}/notifications/${id}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      }
    } catch (error) {
      console.error('Error marking notification read:', error);
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
        body: JSON.stringify({ 
          title: newTitle, 
          project_id: selectedProjectId,
          due_date: newDueDate ? new Date(newDueDate).toISOString() : null
        }),
      });
        if (await handleApiError(response)) return;
      const newTodo = await response.json();
      setTodos([newTodo, ...todos]);
      setNewTitle('');
      setNewDueDate('');
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
          if (await handleApiError(response)) return;
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
          if (await handleApiError(response)) return;
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
        body: JSON.stringify({ 
          title: editTodoTitle,
          due_date: editTodoDueDate ? new Date(editTodoDueDate).toISOString() : null
        }),
      });
        if (await handleApiError(response)) return;
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
        if (await handleApiError(response)) return;
      setTodos(todos.filter((t) => t.id !== id));
    } catch (error) {
      console.error('Error deleting todo:', error);
    }
  };

  const uploadTodoAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeTodoUploadId) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_URL}/todos/${activeTodoUploadId}/attachment`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (await handleApiError(response)) return;
      const updatedTodo = await response.json();
      setTodos(todos.map((t) => (t.id === activeTodoUploadId ? updatedTodo : t)));
    } catch (error) {
      console.error('Error uploading attachment:', error);
    } finally {
      setActiveTodoUploadId(null);
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
                type="text"
                className="input-field"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                type="password"
                className="input-field"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
          {notifications.length > 0 && (
            <div className="notifications-panel" style={{ padding: '0 1rem 1rem 1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Bell size={14} /> Notifications 
                  {notifications.filter(n => !n.is_read).length > 0 && (
                    <span style={{ background: 'var(--danger-color)', color: 'white', padding: '0.1rem 0.4rem', borderRadius: '10px', fontSize: '0.7rem' }}>
                      {notifications.filter(n => !n.is_read).length}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '150px', overflowY: 'auto' }}>
                {notifications.map(n => (
                  <div 
                    key={n.id} 
                    onClick={() => !n.is_read && markNotificationRead(n.id)}
                    style={{ 
                      fontSize: '0.85rem', 
                      padding: '0.5rem', 
                      background: n.is_read ? 'transparent' : 'var(--bg-card)', 
                      borderRadius: '4px', 
                      borderLeft: `3px solid ${n.is_read ? 'transparent' : 'var(--primary-color)'}`,
                      cursor: n.is_read ? 'default' : 'pointer',
                      opacity: n.is_read ? 0.6 : 1
                    }}
                    title={!n.is_read ? "Click to mark as read" : ""}
                  >
                    {n.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="global-stats" style={{ padding: '0 1rem 1rem 1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span>🟢 Online Users:</span>
              <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{onlineUsers.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span>📝 Total Todos:</span>
              <span style={{ fontWeight: 600 }}>{globalTodos}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>📁 Total Projects:</span>
              <span style={{ fontWeight: 600 }}>{globalProjects}</span>
            </div>
          </div>
          <div className="profile-section">
            <div 
              className="profile-avatar" 
              onClick={() => profileInputRef.current?.click()}
              title="Change Profile Picture"
            >
              {currentUser?.profile_picture_url ? (
                <img src={`${API_URL}${currentUser.profile_picture_url}`} alt="Avatar" className="profile-avatar" style={{ border: 'none' }} />
              ) : (
                <UserIcon size={20} color="var(--text-muted)" />
              )}
            </div>
            <input 
              type="file" 
              ref={profileInputRef} 
              style={{ display: 'none' }} 
              onChange={uploadProfilePicture}
              accept="image/*"
            />
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Logged in as {currentUser?.email} <br/>
              Role: <span style={{color: 'var(--text-main)', textTransform: 'capitalize'}}>{currentUser?.role}</span>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout} title="Log out">
            <LogOut size={18} /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {appError && <div className="app-error-banner">{appError}</div>}
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

            <form className="add-todo-form" onSubmit={addTodo} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <div className="input-group" style={{ margin: 0 }}>
                <input
                  type="text"
                  className="input-field"
                  placeholder={`Add todo to ${selectedProjectTitle}...`}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  style={{ marginBottom: 0 }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                  <Calendar size={18} />
                  <input 
                    type="datetime-local" 
                    className="input-field"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    style={{ width: 'auto', margin: 0, padding: '0.3rem 0.5rem', fontSize: '0.85rem' }}
                    title="Optional Due Date"
                  />
                </div>
                <button type="submit" className="add-btn" style={{ padding: '0.5rem 1rem', borderRadius: '4px', width: 'auto', height: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                  <Plus size={18} /> Add Task
                </button>
              </div>
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
                        <div className="inline-edit-form todo-edit" style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                          <input 
                            autoFocus
                            type="text" 
                            style={{ flex: 1, border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.2rem 0.5rem' }}
                            value={editTodoTitle} 
                            onChange={(e) => setEditTodoTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveTodoEdit(todo.id);
                              if (e.key === 'Escape') setEditingTodoId(null);
                            }}
                          />
                          <input 
                            type="datetime-local" 
                            style={{ width: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.2rem 0.5rem' }}
                            value={editTodoDueDate}
                            onChange={(e) => setEditTodoDueDate(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveTodoEdit(todo.id);
                              if (e.key === 'Escape') setEditingTodoId(null);
                            }}
                          />
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <div className="todo-title">{todo.title}</div>
                          {todo.attachment_url && (
                            <a 
                              href={`${API_URL}${todo.attachment_url}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="attachment-link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Paperclip size={14} /> Attachment
                            </a>
                          )}
                          {todo.due_date && (
                            <div className="due-date-badge" style={{ fontSize: '0.75rem', color: new Date(todo.due_date + 'Z') < new Date() && !todo.completed ? 'var(--danger-color)' : 'var(--text-muted)', marginLeft: '1rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                              <span>⏱</span> {new Date(todo.due_date + 'Z').toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </div>
                          )}
                        </div>
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
                              setActiveTodoUploadId(todo.id);
                              todoAttachmentRef.current?.click();
                            }}
                            title="Attach File"
                          >
                            <Upload size={18} />
                          </button>
                          <button 
                            className="action-btn" 
                            onClick={() => {
                              setEditTodoTitle(todo.title);
                              setEditTodoDueDate(
                                todo.due_date 
                                  ? new Date(new Date(todo.due_date + 'Z').getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16) 
                                  : ''
                              );
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
            {/* Hidden file input for Todo Attachments */}
            <input 
              type="file" 
              ref={todoAttachmentRef} 
              style={{ display: 'none' }} 
              onChange={uploadTodoAttachment}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
