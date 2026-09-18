import { join } from 'path';
import * as fs from 'fs';
import { getAppDataPath } from '../shared/utils.js';
import { logger } from '../shared/logger.js';

const DATA_DIR = join(getAppDataPath(), 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const schemaStorage = createStorage<{ version: number }>('schema-version.json', { version: 0 });

export interface Storage<T> {
  load(): T;
  save(data: T): void;
  getPath(): string;
}

export function createStorage<T>(filename: string, defaultData: T): Storage<T> {
  const filePath = join(DATA_DIR, filename);

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    logger.info(`Created ${filename} with default data`);
  }

  return {
    load(): T {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
      } catch (error) {
        logger.error(`Failed to load ${filename}:`, error);
        return defaultData;
      }
    },

    save(data: T): void {
      try {
        const tempPath = `${filePath}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
        fs.renameSync(tempPath, filePath);
      } catch (error) {
        logger.error(`Failed to save ${filename}:`, error);
        throw error;
      }
    },

    getPath(): string {
      return filePath;
    }
  };
}

export function ensureDataFiles() {
  const files = [
    { name: 'queue.json', default: [] },
    { name: 'history.json', default: [] },
    { name: 'settings.json', default: {} },
    { name: 'schema-version.json', default: { version: 0 } }
  ];

  for (const file of files) {
    const path = join(DATA_DIR, file.name);
    if (!fs.existsSync(path)) {
      fs.writeFileSync(path, JSON.stringify(file.default, null, 2));
    }
  }
}
