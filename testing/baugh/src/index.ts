// Welcome to your Pyra project!
// Start the dev server with: npm run dev

const app = document.querySelector<HTMLDivElement>('#app');

if (app) {
  app.innerHTML = `
    <h1>🔥 Pyra.js</h1>
    <p>Your project is ready!</p>
    <p>Edit <code>src/index.ts</code> to get started.</p>
  `;
}

// Hot Module Replacement (HMR) API
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    console.log('🔥 HMR update');
  });
}
