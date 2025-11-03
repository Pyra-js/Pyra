import pc from 'picocolors';

export const log = {
  info: (msg: string) => console.log(`${pc.cyan('[pyra]')} ${msg}`),
  success: (msg: string) => console.log(`${pc.green('[pyra]')} ${msg}`),
  warn: (msg: string) => console.warn(`${pc.yellow('[pyra]')} ${msg}`),
  error: (msg: string) => console.error(`${pc.red('[pyra]')} ${msg}`),
};
