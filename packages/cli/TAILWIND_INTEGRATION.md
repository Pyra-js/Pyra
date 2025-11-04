# Tailwind CSS Integration

The `pyra init` command now supports optional Tailwind CSS setup, similar to create-vite and Next.js.

## Features

- ✅ **Optional Setup** - Prompts user after project scaffolding
- ✅ **CLI Flags** - Full control via command-line flags
- ✅ **Two Presets** - Basic and shadcn/ui configurations
- ✅ **Auto-Configuration** - Generates all necessary config files
- ✅ **Smart Import** - Automatically injects CSS import into entry file
- ✅ **Framework-Aware** - Content paths match your framework (React, Vue, Vanilla, etc.)

## Usage

### Interactive Prompts

```bash
$ pyra init my-app
? Project name: my-app
? Select a template: React
? Select a language: TypeScript
? Add Tailwind CSS? (y/N)  # <-- NEW PROMPT
? Select Tailwind preset: Basic
```

### With Flags

```bash
# Enable Tailwind with basic preset
$ pyra init my-app --tailwind

# Enable with shadcn/ui preset
$ pyra init my-app --tailwind --ui shadcn

# Disable Tailwind (skip prompt)
$ pyra init my-app --no-tailwind

# All flags together
$ pyra init my-react-app \
  --template react \
  --language typescript \
  --tailwind \
  --ui shadcn \
  --skip-install
```

## Available Flags

| Flag | Description |
|------|-------------|
| `--tailwind` | Enable Tailwind CSS (skips prompt) |
| `--no-tailwind` | Skip Tailwind setup entirely |
| `--ui <preset>` | Choose preset: `basic` or `shadcn` |
| `--skip-install` | Skip dependency installation |

## Presets

### Basic Preset

Standard Tailwind CSS setup with minimal configuration.

**Includes:**
- `tailwindcss` - Core framework
- `postcss` - CSS processor
- `autoprefixer` - Browser compatibility

**Generated files:**
```
tailwind.config.js   # Basic config with content paths
postcss.config.js    # PostCSS with Tailwind + Autoprefixer
src/index.css        # @tailwind directives
```

**Example:**
```bash
$ pyra init my-app --tailwind --ui basic
```

### shadcn/ui Preset

Tailwind with shadcn/ui design tokens and utilities.

**Includes:**
- All basic preset dependencies
- `clsx` - Conditional class utility
- `tailwind-merge` - Merge Tailwind classes intelligently

**Generated files:**
```
tailwind.config.js   # With shadcn theme tokens
postcss.config.js    # PostCSS config
src/index.css        # Tailwind directives + CSS variables
```

**Features:**
- ✅ Custom color system with CSS variables
- ✅ Dark mode support (class-based)
- ✅ Design tokens (radius, spacing, etc.)
- ✅ Ready for shadcn/ui components

**Example:**
```bash
$ pyra init my-app --tailwind --ui shadcn
```

## What Gets Generated

### 1. Configuration Files

**`tailwind.config.js`** - Framework-aware content paths:
```js
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"  // Adapts to framework
  ],
  theme: {
    extend: {},  // Or shadcn theme if using that preset
  },
  plugins: [],
}
```

**`postcss.config.js`** - PostCSS configuration:
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

### 2. CSS File

**`src/index.css`** - Tailwind directives:

**Basic:**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**shadcn/ui:**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    /* ... more design tokens */
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    /* ... dark mode tokens */
  }
}
```

### 3. package.json Updates

**Basic preset:**
```json
{
  "devDependencies": {
    "tailwindcss": "^3.4.1",
    "postcss": "^8.4.35",
    "autoprefixer": "^10.4.17"
  }
}
```

**shadcn preset (additional):**
```json
{
  "dependencies": {
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.1"
  }
}
```

### 4. CSS Import Injection

The utility automatically injects `import "./index.css"` into your entry file:

**React (`src/index.tsx`):**
```tsx
import "./index.css";  // <-- Auto-injected
import React from 'react';
import { createRoot } from 'react-dom/client';
// ... rest of your code
```

**Vanilla (`src/index.ts`):**
```ts
import "./index.css";  // <-- Auto-injected
const app = document.querySelector('#app');
// ... rest of your code
```

## Output Example

```bash
$ pyra init my-react-app --tailwind --ui shadcn --skip-install

pyra v0.0.4

[pyra] Creating react project with typescript...
[pyra] Project created at C:\projects\my-react-app

[pyra] Setting up Tailwind CSS...
[pyra] ✓ Created tailwind.config.js
[pyra] ✓ Created postcss.config.js
[pyra] ✓ Created src/index.css
[pyra] ✓ Added CSS import to entry file
[pyra] ✓ Updated package.json

[pyra] ✓ Tailwind CSS configured successfully

[pyra] 📚 shadcn/ui preset includes:
[pyra]   • Custom design tokens (colors, radius, etc.)
[pyra]   • Dark mode support
[pyra]   • clsx and tailwind-merge utilities

[pyra] Next steps:
[pyra]   cd my-react-app
[pyra]   pnpm install
[pyra]   pnpm dev

project completed in 342 ms
```

## Framework Support

The utility is framework-aware and generates appropriate content paths:

| Framework | Content Paths |
|-----------|---------------|
| **React** | `./index.html`, `./src/**/*.{js,ts,jsx,tsx}` |
| **Vue** | `./index.html`, `./src/**/*.{vue,js,ts,jsx,tsx}` |
| **Svelte** | `./index.html`, `./src/**/*.{svelte,js,ts,jsx,tsx}` |
| **Vanilla** | `./index.html`, `./src/**/*.{js,ts}` |

## Implementation Details

### Architecture

```
packages/cli/src/
├── utils/
│   └── tailwind.ts          # Tailwind setup utility
├── scaffold.ts              # Updated to support Tailwind
└── bin.ts                   # Updated init command
```

### Key Functions

**`addTailwind(options)`** - Main setup function:
```typescript
export async function addTailwind(options: {
  projectDir: string;
  pm: PM;
  preset: 'basic' | 'shadcn';
  framework: 'vanilla' | 'react' | 'vue' | 'svelte';
  language: 'typescript' | 'javascript';
  skipInstall?: boolean;
}): Promise<void>
```

**Workflow:**
1. Generate `tailwind.config.js` (framework-aware content paths)
2. Generate `postcss.config.js`
3. Generate `src/index.css` (with or without design tokens)
4. Inject CSS import into entry file
5. Update `package.json` with dependencies
6. Install dependencies (unless `--skip-install`)

### Entry File Detection

The utility intelligently finds your entry file:

**React:**
- `src/main.tsx` (or `.ts`)
- `src/index.tsx` (or `.ts`)

**Vue:**
- `src/main.ts` (or `.js`)

**Svelte:**
- `src/main.ts` (or `.js`)

**Vanilla:**
- `src/index.ts` (or `.js`)
- `src/main.ts` (or `.js`)

## Error Handling

- ✅ If entry file not found, prints helpful warning
- ✅ Graceful fallback if dependencies fail to install
- ✅ Validates preset values (basic/shadcn)
- ✅ Doesn't break if CSS import already exists

## Testing

Tested scenarios:
- ✅ Basic preset with React/TypeScript
- ✅ shadcn preset with React/TypeScript
- ✅ `--skip-install` flag works correctly
- ✅ CSS import injection works
- ✅ package.json updates correctly
- ✅ Config files generated properly

## Next Steps for Users

After running `pyra init` with Tailwind:

1. **Install dependencies** (if you used `--skip-install`):
   ```bash
   cd my-app
   npm install
   ```

2. **Start dev server**:
   ```bash
   npm run dev
   ```

3. **Start using Tailwind**:
   ```tsx
   // src/App.tsx
   export default function App() {
     return (
       <div className="flex items-center justify-center min-h-screen bg-gradient-to-r from-blue-500 to-purple-600">
         <h1 className="text-4xl font-bold text-white">
           Hello, Tailwind! 🎨
         </h1>
       </div>
     );
   }
   ```

4. **If using shadcn preset**, you can start adding shadcn/ui components:
   ```bash
   # Install shadcn CLI
   npx shadcn@latest init

   # Add components
   npx shadcn@latest add button
   ```

## Future Enhancements

Potential improvements:
- [ ] Add more presets (DaisyUI, Headless UI, etc.)
- [ ] Support for Tailwind plugins
- [ ] Vue and Svelte framework integration
- [ ] Custom theme generation
- [ ] Interactive theme builder
