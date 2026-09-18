import { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { VitePlugin } from '@electron-forge/plugin-vite';
import * as fs from 'fs';
import * as path from 'path';

const config: ForgeConfig = {
  packagerConfig: {
    asar: false,
    icon: 'src/renderer/assets/icon.ico',
    extraResource: [
      'data',
      'images',
      {
        from: '.build/build-info.json',
        to: 'build-info.json'
      },
      {
        from: 'scripts/process-guardian.ps1',
        to: 'process-guardian.ps1'
      }
    ]
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'Commishes Control Center',
      setupIcon: 'src/renderer/assets/icon.ico'
    })
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.ts',
          target: 'main'
        },
        {
          entry: 'src/main/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload'
        }
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts'
        }
      ]
    })
  ],
  hooks: {
    postPackage: async (config, options) => {
      // Copy playwright to app directory after packaging
      for (const outputPath of options.outputPaths) {
        const appDir = path.join(outputPath, 'resources', 'app');
        const playwrightSrc = path.join(__dirname, 'node_modules', 'playwright');
        const playwrightCoreSrc = path.join(__dirname, 'node_modules', 'playwright-core');
        const playwrightDest = path.join(appDir, 'node_modules', 'playwright');
        const playwrightCoreDest = path.join(appDir, 'node_modules', 'playwright-core');

        if (fs.existsSync(playwrightSrc)) {
          fs.cpSync(playwrightSrc, playwrightDest, { recursive: true });
          console.log('Copied playwright to:', playwrightDest);
        }
        if (fs.existsSync(playwrightCoreSrc)) {
          fs.cpSync(playwrightCoreSrc, playwrightCoreDest, { recursive: true });
          console.log('Copied playwright-core to:', playwrightCoreDest);
        }
      }
    }
  }
};

export default config;