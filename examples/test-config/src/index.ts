/**
 * Demo application entry point
 */

// Test module resolution with a simple utility
import { sum } from './utils';

console.log('Hello from Pyra! 🔥');
console.log('Configuration is working!');

const result = sum(2, 3);
console.log(`2 + 3 = ${result}`);
