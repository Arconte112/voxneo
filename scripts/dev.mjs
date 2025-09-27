import concurrently from 'concurrently';

process.env.NODE_ENV = 'development';
process.env.ELECTRON_RENDERER_URL = process.env.ELECTRON_RENDERER_URL ?? 'http://127.0.0.1:5173';

const { result } = concurrently(
  [
    { command: 'npm:dev:main', name: 'main', prefixColor: 'cyan' },
    { command: 'npm:dev:renderer', name: 'renderer', prefixColor: 'magenta' },
    { command: 'npm:dev:electron', name: 'electron', prefixColor: 'green' }
  ],
  {
    killOthers: ['failure', 'success'],
    restartTries: 0
  }
);

result.catch(() => process.exit(1));
