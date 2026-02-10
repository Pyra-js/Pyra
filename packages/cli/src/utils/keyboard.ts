import pc from 'picocolors';

export interface KeyboardShortcutsOptions {
  onRestart: () => Promise<void>;
  onQuit: () => void;
  onOpen: () => void;
  onClear: () => void;
  color: boolean;
}

interface Shortcut {
  key: string;
  description: string;
  action: () => void | Promise<void>;
}

/**
 * Detect if the terminal supports Unicode characters.
 */
function getArrow(color: boolean): string {
  const supportsUnicode =
    process.platform !== 'win32' ||
    !!process.env.WT_SESSION ||
    process.env.TERM_PROGRAM === 'vscode' ||
    process.env.TERM === 'xterm-256color';

  const arrow = supportsUnicode ? '\u279C' : '>';
  return color ? pc.green(arrow) : arrow;
}

/**
 * Print the shortcuts help menu.
 */
function printHelp(shortcuts: Shortcut[], color: boolean): void {
  const a = getArrow(color);

  console.log('');
  if (color) {
    console.log(`  ${pc.bold('Shortcuts')}`);
  } else {
    console.log('  Shortcuts');
  }

  for (const s of shortcuts) {
    if (color) {
      console.log(
        `  ${a}  ${pc.dim('press ')}${pc.bold(s.key + ' + enter')}${pc.dim(` to ${s.description}`)}`
      );
    } else {
      console.log(`  ${a}  press ${s.key} + enter to ${s.description}`);
    }
  }

  console.log('');
}

/**
 * Set up interactive keyboard shortcuts on stdin.
 * Returns a cleanup function to restore stdin state.
 *
 * Only call this when process.stdin.isTTY is true.
 */
export function setupKeyboardShortcuts(opts: KeyboardShortcutsOptions): () => void {
  const { onRestart, onQuit, onOpen, onClear, color } = opts;

  const shortcuts: Shortcut[] = [
    { key: 'r', description: 'restart server', action: onRestart },
    { key: 'o', description: 'open in browser', action: onOpen },
    { key: 'c', description: 'clear console', action: onClear },
    { key: 'q', description: 'quit', action: onQuit },
  ];

  let buffer = '';

  const onData = (data: Buffer) => {
    const str = data.toString();

    for (const ch of str) {
      if (ch === '\r' || ch === '\n') {
        const key = buffer.trim().toLowerCase();
        buffer = '';

        if (key === 'h') {
          printHelp(shortcuts, color);
          return;
        }

        const shortcut = shortcuts.find((s) => s.key === key);
        if (shortcut) {
          shortcut.action();
        }
      } else {
        buffer += ch;
      }
    }
  };

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', onData);

  // Don't let stdin keep the process alive
  process.stdin.unref();

  return () => {
    process.stdin.off('data', onData);
  };
}
