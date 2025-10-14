import { spawn } from 'child_process';

console.log('🎃 Starting Mastra dev server for Halloween Discord Bot...\n');

const mastra = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true
});

mastra.on('error', (error) => {
  console.error('❌ Failed to start mastra dev:', error);
  process.exit(1);
});

mastra.on('exit', (code) => {
  console.log(`\n🎃 Mastra dev server exited with code ${code}`);
  process.exit(code || 0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down...');
  mastra.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down...');
  mastra.kill('SIGINT');
});
