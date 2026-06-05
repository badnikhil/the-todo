import { useState, useEffect } from 'react';
import { Plus, Trash2, Check, LogOut, LogIn, UserPlus } from 'lucide-react';
import './index.css';

interface Todo {
  id: number;
  title: string;
  description: string | null;
  completed: boolean;
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
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) {
      fetchTodos();
    }
  }, [token]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    
    if (isLoginView) {
      // Login uses OAuth2 form data
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
      // Signup uses JSON
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
        
        // Auto login after signup
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
    setTodos([]);
  };

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
        body: JSON.stringify({ title: newTitle }),
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

  if (!token) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="header">
            <h1>{isLoginView ? 'Welcome Back' : 'Create Account'}</h1>
            <p> Todos</p>
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
    );
  }

  return (
    <div className="app-container">
      <div className="app-header">
        <div className="header">
          <h1>Todos</h1>
          <p>Stay focused, stay productive.</p>
        </div>
        <button className="logout-btn" onClick={handleLogout} title="Log out">
          <LogOut size={20} />
        </button>
      </div>

      <form className="add-todo-form" onSubmit={addTodo}>
        <div className="input-group">
          <input
            type="text"
            className="input-field"
            placeholder="What needs to be done?"
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
          <div className="empty-state">Loading your tasks...</div>
        ) : todos.length === 0 ? (
          <div className="empty-state">No tasks yet. Enjoy your day!</div>
        ) : (
          todos.map((todo, index) => (
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
                <div className="todo-title">{todo.title}</div>
              </div>
              <div className="actions">
                <button 
                  className="action-btn delete" 
                  onClick={() => deleteTodo(todo.id)}
                  title="Delete"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default App;
