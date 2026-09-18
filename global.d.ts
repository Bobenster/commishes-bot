// Global type declarations for Electron module augmentation
// This file must be at the root to be picked up before node_modules

declare module 'electron' {
  interface App {
    isQuitting?: boolean;
  }
}