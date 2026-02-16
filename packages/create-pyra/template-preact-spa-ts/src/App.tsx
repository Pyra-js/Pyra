import { useState } from 'preact/hooks';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="container">
      <h1>Welcome to {{PROJECT_NAME}}</h1>
      <p>Edit <code>src/App.tsx</code> and save to reload.</p>
      <button onClick={() => setCount((c) => c + 1)}>
        Count: {count}
      </button>
    </div>
  );
}
