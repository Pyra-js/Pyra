import './style.css';

const app = document.querySelector('#app');

app.innerHTML = `
  <div class="container">
    <h1>Welcome to Pyra.js!</h1>
    <p>Edit <code>src/index.js</code> and save to reload.</p>
    <button id="counter">Count: 0</button>
  </div>
`;

const button = document.querySelector('#counter');
let count = 0;

button.addEventListener('click', () => {
  count++;
  button.textContent = `Count: ${count}`;
});
