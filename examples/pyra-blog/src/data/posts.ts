export interface Post {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  publishedAt: string;
}

const posts: Post[] = [
  {
    id: "1",
    slug: "getting-started-with-pyra",
    title: "Getting Started with Pyra",
    excerpt: "Learn how to build full-stack apps with Pyra.js",
    content: "Pyra.js is a modern full-stack framework built on React and esbuild. It features file-based routing, server-side rendering, and a blazing-fast development experience.\n\nTo get started, run `pyra create my-app` and you'll have a fully working project in seconds.",
    author: "Pyra Team",
    publishedAt: "2026-01-15",
  },
  {
    id: "2",
    slug: "file-based-routing",
    title: "File-Based Routing in Pyra",
    excerpt: "How Pyra's file-based router works under the hood",
    content: "Pyra uses a file-based routing system where your filesystem structure maps directly to URL routes.\n\nPlace a `page.tsx` file in `src/routes/` and it becomes your home page. Create `src/routes/blog/page.tsx` and it serves at `/blog`. Dynamic segments use bracket notation: `[slug]/page.tsx`.",
    author: "Pyra Team",
    publishedAt: "2026-01-20",
  },
  {
    id: "3",
    slug: "data-loading",
    title: "Server-Side Data Loading",
    excerpt: "Using the load() function for server-side data fetching",
    content: "Every page in Pyra can export a `load()` function that runs on the server before rendering. This function receives a `RequestContext` with access to URL params, headers, cookies, and environment variables.\n\nThe data returned from `load()` is passed as props to your page component and serialized for client-side hydration.",
    author: "Pyra Team",
    publishedAt: "2026-02-01",
  },
];

export function getAllPosts(): Post[] {
  return [...posts].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function getPostBySlug(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}

export function getPostById(id: string): Post | undefined {
  return posts.find((p) => p.id === id);
}

export function getAllSlugs(): string[] {
  return posts.map((p) => p.slug);
}

let nextId = posts.length + 1;

export function createPost(data: Omit<Post, "id">): Post {
  const post: Post = { ...data, id: String(nextId++) };
  posts.push(post);
  return post;
}

export function updatePost(id: string, data: Partial<Omit<Post, "id">>): Post | undefined {
  const post = posts.find((p) => p.id === id);
  if (!post) return undefined;
  Object.assign(post, data);
  return post;
}

export function deletePost(id: string): boolean {
  const idx = posts.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  posts.splice(idx, 1);
  return true;
}
