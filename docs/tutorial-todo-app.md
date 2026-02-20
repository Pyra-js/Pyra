# Tutorial: Build a Todo App

Build a real todo app with Pyra from scratch. No prior experience with server-side code required.

By the end of this tutorial you'll have a working app where you can add, check off, and delete todos. The data loads on the server, the page renders instantly, and the buttons work in the browser — all in one project.

---

## What you'll learn

- What a full-stack app actually is (server + browser, working together)
- How file-based routing works - your folder structure becomes your URLs
- How to build a JSON API (the "backend")
- How to load data on the server before a page renders
- How the server and browser hand off to each other (SSR + hydration)

If some of those terms are new to you, don't worry. Each one is explained as you encounter it.

---

## Before you start

You need [Node.js](https://nodejs.org) (version 18 or later) installed. Check by running:

```bash
node --version
```

If you see a version number starting with 18 or higher, you're ready.

---

## Step 1: Create the project

Run this command and follow the prompts:

```bash
npm create pyra my-todo-app
```

When asked:
- **Framework** → React
- **Rendering mode** → Full-stack
- **Variant** → TypeScript
- **Add Tailwind CSS?** → No

Then start the dev server:

```bash
cd my-todo-app
npm install
npm run dev
```

Open `http://localhost:3000`. You should see the Pyra welcome page. Leave the dev server running — it updates automatically as you save files.

---

## Step 2: Understand the folder structure

Open the project in your code editor. The important folder is `src/routes/`. Every file inside it maps to a URL.

```
src/routes/
  layout.tsx    →  wraps every page (nav, footer, etc.)
  page.tsx      →  the home page at /
```

You're going to add a few more files. By the end the structure will look like this:

```
src/routes/
  layout.tsx
  page.tsx
  api/
    todos/
      route.ts          →  handles /api/todos
      [id]/
        route.ts        →  handles /api/todos/1, /api/todos/2, etc.
```

The `[id]` folder name (with square brackets) means "this segment can be anything" — a dynamic route. You'll see how to read that value in Step 5.

---

## Step 3: Create a shared type

Create a file that defines what a todo looks like. Both your API and your page will import from this file.

```typescript
// src/types.ts

export interface Todo {
  id: string;
  title: string;
  completed: boolean;
}
```

A TypeScript `interface` is a description of the shape of an object. This says every todo must have an `id`, a `title`, and a `completed` flag.

---

## Step 4: Create a data store

Real apps use a database. For this tutorial, we'll use a plain array in memory — it's simpler and works the same way from your app's point of view. The only catch is that the data resets when you restart the server.

Create this file:

```typescript
// src/data/todos.ts

import type { Todo } from "../types.js";

let nextId = 4;

const todos: Todo[] = [
  { id: "1", title: "Learn Pyra file-based routing", completed: true },
  { id: "2", title: "Build a todo API", completed: false },
  { id: "3", title: "Add client interactivity", completed: false },
];

export function getAllTodos(): Todo[] {
  return todos;
}

export function createTodo(title: string): Todo {
  const todo: Todo = { id: String(nextId++), title, completed: false };
  todos.push(todo);
  return todo;
}

export function updateTodo(
  id: string,
  updates: Partial<Pick<Todo, "title" | "completed">>
): Todo | undefined {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return undefined;
  if (updates.title !== undefined) todo.title = updates.title;
  if (updates.completed !== undefined) todo.completed = updates.completed;
  return todo;
}

export function deleteTodo(id: string): boolean {
  const index = todos.findIndex((t) => t.id === id);
  if (index === -1) return false;
  todos.splice(index, 1);
  return true;
}
```

These are just plain functions that read and modify the array. Nothing special about them — they could just as easily call a database library.

---

## Step 5: Build the API routes

An **API route** is a URL that returns data (usually JSON) instead of an HTML page. Your frontend will call these URLs from the browser to create, update, and delete todos.

In Pyra, you create an API route by adding a `route.ts` file. You export a function named after the HTTP method you want to handle — `GET`, `POST`, `PUT`, `DELETE`.

> **What is an HTTP method?** When a browser or app makes a request, it says what kind of action it wants: `GET` means "give me data", `POST` means "create something", `PUT` means "update something", `DELETE` means "remove something".

### The list and create route

Create the folders and file `src/routes/api/todos/route.ts`:

```typescript
// src/routes/api/todos/route.ts

import type { RequestContext } from "pyrajs-shared";
import { getAllTodos, createTodo } from "../../../data/todos.js";

export function GET(ctx: RequestContext) {
  return ctx.json(getAllTodos());
}

export async function POST(ctx: RequestContext) {
  const body = await ctx.request.json();

  if (!body.title || typeof body.title !== "string") {
    return ctx.json({ error: "title is required" }, { status: 400 });
  }

  const todo = createTodo(body.title.trim());
  return ctx.json(todo, { status: 201 });
}
```

`ctx` is the **request context** — it gives you everything about the incoming request and helpers to build a response:

- `ctx.request.json()` reads the request body as JSON
- `ctx.json(data)` creates a JSON response (like `{ "id": "4", "title": "..." }`)
- `ctx.json(data, { status: 400 })` does the same but with a different status code

If someone sends a request method you haven't exported (like `DELETE` to this endpoint), Pyra automatically replies with `405 Method Not Allowed`.

### The single-item route

Create `src/routes/api/todos/[id]/route.ts`:

```typescript
// src/routes/api/todos/[id]/route.ts

import type { RequestContext } from "pyrajs-shared";
import { updateTodo, deleteTodo } from "../../../../data/todos.js";

export async function PUT(ctx: RequestContext) {
  const body = await ctx.request.json();
  const todo = updateTodo(ctx.params.id, body);

  if (!todo) {
    return ctx.json({ error: "Todo not found" }, { status: 404 });
  }

  return ctx.json(todo);
}

export function DELETE(ctx: RequestContext) {
  const deleted = deleteTodo(ctx.params.id);

  if (!deleted) {
    return ctx.json({ error: "Todo not found" }, { status: 404 });
  }

  return ctx.json({ deleted: true });
}
```

`ctx.params.id` is how you read the dynamic segment from the URL. If someone requests `/api/todos/42`, then `ctx.params.id` is `"42"`.

### Test the API

With your dev server still running, open a second terminal and try these:

```bash
# Get all todos
curl http://localhost:3000/api/todos

# Create a new todo
curl -X POST http://localhost:3000/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title": "My first todo"}'

# Toggle a todo's completion
curl -X PUT http://localhost:3000/api/todos/1 \
  -H "Content-Type: application/json" \
  -d '{"completed": false}'

# Delete a todo
curl -X DELETE http://localhost:3000/api/todos/2
```

You should see JSON responses. The API is working — now let's build the page that uses it.

---

## Step 6: Create the layout

A **layout** wraps every page in the same directory. Put your app's header, navigation, or shared styles here so you don't repeat them in every page.

Replace `src/routes/layout.tsx` with this:

```tsx
// src/routes/layout.tsx

import React from "react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: "600px",
        margin: "0 auto",
        padding: "2rem",
      }}
    >
      <header
        style={{
          marginBottom: "2rem",
          borderBottom: "2px solid #e5e7eb",
          paddingBottom: "1rem",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>
          <a href="/" style={{ textDecoration: "none", color: "#111" }}>
            My Todos
          </a>
        </h1>
      </header>
      <main>{children}</main>
    </div>
  );
}
```

The `{children}` slot is where each page gets rendered. When someone visits `/`, Pyra puts your home page there. When they visit another route, it puts that page there instead.

---

## Step 7: Build the todo page

This is the most interesting part. The page has two jobs:

1. **On the server** — load the todos from the data store before anything is sent to the browser
2. **In the browser** — show the todos and let the user interact with them

Pyra handles both with a single file.

### How server-side loading works

If you export a `load()` function from a page file, Pyra calls it on the server before rendering. Whatever `load()` returns gets passed to your component as props.

```
User visits /  →  Pyra calls load()  →  Gets todos  →  Renders page with todos  →  Sends HTML to browser
```

This means the browser receives a fully-rendered page with real data — no loading spinner, no blank flash.

### The page

Replace `src/routes/page.tsx` with this:

```tsx
// src/routes/page.tsx

import React, { useState } from "react";
import type { RequestContext } from "pyrajs-shared";
import type { Todo } from "../types.js";

// Runs on the server before rendering.
// The return value becomes this component's props.
export async function load(ctx: RequestContext) {
  const { getAllTodos } = await import("../data/todos.js");
  return { todos: getAllTodos() };
}

export default function TodoPage({ todos: initialTodos }: { todos: Todo[] }) {
  const [todos, setTodos] = useState(initialTodos);
  const [newTitle, setNewTitle] = useState("");

  // --- Add a todo ---
  async function addTodo(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    const todo: Todo = await res.json();

    setTodos([...todos, todo]);
    setNewTitle("");
  }

  // --- Toggle a todo ---
  async function toggleTodo(id: string, completed: boolean) {
    const res = await fetch(`/api/todos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !completed }),
    });
    const updated: Todo = await res.json();

    setTodos(todos.map((t) => (t.id === updated.id ? updated : t)));
  }

  // --- Delete a todo ---
  async function removeTodo(id: string) {
    await fetch(`/api/todos/${id}`, { method: "DELETE" });
    setTodos(todos.filter((t) => t.id !== id));
  }

  const remaining = todos.filter((t) => !t.completed).length;

  return (
    <div>
      {/* Add todo form */}
      <form
        onSubmit={addTodo}
        style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}
      >
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="What needs to be done?"
          style={{
            flex: 1,
            padding: "0.5rem 0.75rem",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            fontSize: "1rem",
          }}
        />
        <button
          type="submit"
          style={{
            padding: "0.5rem 1rem",
            background: "#111",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "1rem",
          }}
        >
          Add
        </button>
      </form>

      {/* Todo list */}
      {todos.length === 0 ? (
        <p style={{ color: "#9ca3af", textAlign: "center", padding: "2rem 0" }}>
          No todos yet. Add one above.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {todos.map((todo) => (
            <li
              key={todo.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.75rem 0",
                borderBottom: "1px solid #f3f4f6",
              }}
            >
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() => toggleTodo(todo.id, todo.completed)}
                style={{ width: "18px", height: "18px", cursor: "pointer" }}
              />
              <span
                style={{
                  flex: 1,
                  textDecoration: todo.completed ? "line-through" : "none",
                  color: todo.completed ? "#9ca3af" : "#111",
                }}
              >
                {todo.title}
              </span>
              <button
                onClick={() => removeTodo(todo.id)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#ef4444",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <p style={{ marginTop: "1rem", fontSize: "0.875rem", color: "#6b7280" }}>
        {remaining} {remaining === 1 ? "item" : "items"} remaining
      </p>
    </div>
  );
}
```

### What's happening in this file

**`load()` runs on the server.** It calls `getAllTodos()` and returns the result. Pyra passes that to `TodoPage` as the `todos` prop. By the time the browser gets the HTML, the todos are already in it.

**The component runs twice — once on the server, once in the browser.** On the server, React renders it to HTML and sends that HTML to the browser. In the browser, React "hydrates" the same component: it attaches event listeners to the existing HTML so the checkboxes and buttons become clickable. This process is invisible to the user — they just see a page that works immediately.

**After hydration, the component runs purely in the browser.** When the user clicks "Add", the component calls `fetch()` to hit your `/api/todos` route, then updates its own state. No page reload needed.

---

## Step 8: See it in action

Open `http://localhost:3000`. You should see:

- The three seed todos from Step 4
- An input field to add new todos
- Checkboxes to mark todos complete (they'll get a strikethrough)
- Delete buttons to remove todos

Try it out. The todos persist as long as the dev server is running.

---

## Step 9: Deploy a production build

When you're ready to share the app:

```bash
npm run build
npm run start
```

`npm run build` compiles and optimizes everything into a `dist/` folder. `npm run start` serves it with the production server. The app works the same way in production — same API routes, same server-side data loading.

---

## What you built

Here's a quick reference for what each piece does:

| File | URL | What it does |
|------|-----|--------------|
| `src/routes/layout.tsx` | wraps all pages | Shared header and container |
| `src/routes/page.tsx` | `/` | Loads todos on the server, renders them, handles client interactions |
| `src/routes/api/todos/route.ts` | `/api/todos` | `GET` returns all todos, `POST` creates one |
| `src/routes/api/todos/[id]/route.ts` | `/api/todos/:id` | `PUT` updates a todo, `DELETE` removes it |

And the key concepts you used:

| Concept | What it means |
|---------|---------------|
| File-based routing | Your file's path in `src/routes/` becomes its URL |
| `[id]` folder | A dynamic segment — matches any value, readable via `ctx.params.id` |
| `export function GET` | Handles `GET` requests to that route's URL |
| `export async function load()` | Runs on the server before the page renders; return value becomes props |
| `ctx.json()` | Sends a JSON response |
| `ctx.request.json()` | Reads JSON from the request body |
| Hydration | The process of React attaching interactivity to server-rendered HTML |

---

## What to try next

- Add a `/todos/[id]/page.tsx` with its own `load()` to show a detail view for a single todo
- Add a `src/routes/middleware.ts` to log every request (see the [Middleware docs](./middleware.md))
- Swap the in-memory array for a real database like SQLite or Postgres
- Try `export const prerender = true` on a static page like an About page (see the [SSR docs](./ssr-and-data-loading.md))
