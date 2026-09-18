// Global type declarations for Electron module augmentation
// This file must not have any imports/exports to work as a global declaration

declare module 'electron' {
  interface App {
    isQuitting?: boolean;
  }
}