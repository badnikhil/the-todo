import { useState, useEffect } from 'react';
import { Plus, Trash2, Check } from 'lucide-react';
import './index.css';

interface Todo {
  id: number;
  title: string;
  description: string | null;
  completed: boolean;
}

const API_URL = 'http://localhost:8000/todos';

function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTodos();
  }, []);

  const fetchTodos = async () => {
    try {
      const response = await fetch(`${API_URL}/`);
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
      const response = await fetch(`${API_URL}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
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
        // Use the complete endpoint
        const response = await fetch(`${API_URL}/${todo.id}/complete`, {
          method: 'POST',
        });
        const updatedTodo = await response.json();
        setTodos(todos.map((t) => (t.id === todo.id ? updatedTodo : t)));
      } else {
        // Just uncheck it via normal update (if supported) or just basic toggle
        const response = await fetch(`${API_URL}/${todo.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: false }),
        });
        const updatedTodo = await response.json();
        setTodos(todos.map((t) => (t.id === todo.id ? updatedTodo : t)));
      }
    } catch (error) {
      console.error('Error toggling todo:', error);
    }
  };

  const deleteTodo = async (id: number) => {
    try {
      await fetch(`${API_URL}/${id}`, {
        method: 'DELETE',
      });
      setTodos(todos.filter((t) => t.id !== id));
    } catch (error) {
      console.error('Error deleting todo:', error);
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1> Todos</h1>
        <p>Stay focused, stay productive.</p>
      </header>

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
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div 
                className="checkbox-wrapper" 
                onClick={() => toggleTodo(todo)}
              >
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
