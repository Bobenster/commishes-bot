import { app } from 'electron';
import { join } from 'path';

// Small GitHub agent edit test.
export function isDev(): boolean {
  return process.env.NODE_ENV === 'development' || !app.isPackaged;
}

export function getAppDataPath(): string {
  return app.getPath('userData');
}

export function getResourcePath(...paths: string[]): string {
  const base = isDev() 
    ? join(process.cwd(), 'src')
    : join(process.resourcesPath, 'app');
  return join(base, ...paths);
}