# Commishes Control Center

Local desktop application for managing Commishes auction queue with automated scheduling.

## Features

- **Queue Management**: Create, edit, delete, and reorder auction publications
- **Scheduled Execution**: Automatic publishing at specified times
- **Dry Run Mode**: Test the full flow without actually publishing (stops at "Start now!" button)
- **History Tracking**: View execution logs, screenshots on error, and auction URLs
- **Chrome Management**: Automatic detection/launch of dedicated Chrome profile with remote debugging
- **System Tray**: Minimize to tray, auto-start on Windows login
- **Notifications**: Desktop notifications on job completion/failure
- **Keyboard Shortcuts**: Quick actions (Ctrl+N for new job, etc.)

## Architecture

```
commishes-control-center/
├── src/
│   ├── main/                    # Electron Main Process (Node.js)
│   │   ├── main.ts             # Entry point
│   │   ├── preload.ts          # IPC Bridge (contextBridge)
│   │   ├── ipc/                # IPC Handlers
│   │   ├── engine/             # Core Engine Modules
│   │   │   ├── chrome-manager.ts   # Chrome lifecycle management
│   │   │   ├── commishes-engine.ts # Playwright automation (DRY RUN)
│   │   │   ├── runner.ts           # Job orchestration
│   │   │   ├── scheduler.ts        # Time-based scheduling
│   │   │   ├── selectors.ts        # CSS selectors (single source)
│   │   │   └── types.ts            # TypeScript interfaces
│   │   ├── data/               # Data Layer
│   │   │   ├── storage.ts          # JSON file storage
│   │   │   ├── migrations.ts       # Schema migrations
│   │   │   ├── queue-manager.ts    # Queue CRUD
│   │   │   ├── history-manager.ts  # History append/query
│   │   │   └── settings-manager.ts # Settings persistence
│   │   └── shared/             # Shared utilities
│   └── renderer/               # Electron Renderer (UI)
│       ├── index.html          # Main HTML
│       ├── main.ts             # UI Entry point
│       ├── styles.css          # All styles
│       ├── components/         # UI Components
│       │   ├── QueueTab.ts
│       │   ├── HistoryTab.ts
│       │   ├── SettingsTab.ts
│       │   ├── JobModal.ts
│       │   └── LogModal.ts
│       └── stores/             # Reactive Stores
│           ├── queueStore.ts
│           ├── historyStore.ts
│           ├── settingsStore.ts
│           └── uiStore.ts
├── data/                       # Runtime data (gitignored)
│   ├── queue.json
│   ├── history.json
│   ├── settings.json
│   └── schema-version.json
├── images/                     # User uploaded images
├── logs/                       # Structured logs
│   ├── jobs/                   # NDJSON per job
│   └── errors/                 # Error screenshots
└── chrome-profile/             # Chrome user data directory
```

## Safety Rules

**IMPORTANT**: This application NEVER posts to the live Commishes site automatically.

- The scheduler **only runs Dry Run** (stops at Page 3, before "Start now!" button)
- Real publishing requires **explicit user action** via "Publish Now" button in UI
- Test Mode is enabled by default in settings
- No automated posting to ych.commishes.com ever occurs

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Type check
npm run typecheck

# Build for production
npm run build

# Create distributable
npm run make
```

## Configuration

On first run, configure in Settings tab:

1. **Chrome**: Path to `chrome.exe`, profile directory, debug port
2. **Scheduler**: Check interval, cooldown between jobs, max retries
3. **Engine**: Test Mode (always on for safety), images directory
4. **App**: Auto-launch on Windows, minimize to tray, notifications

## Creating a Publication

1. Click "New Publication" or press `Ctrl+N`
2. Fill all required fields:
   - Image file
   - Category, Subtitle, Title, Description
   - Rating (Safe/Questionable/Explicit/Shock)
   - NSFW, Prevent Sniping toggles
   - Duration, Promoted toggle
   - Starting Bid, Minimum Increase
   - Autobuy (optional)
3. Set schedule date/time
4. Click "Add to Queue"

## Running a Publication

- **Automatic**: Scheduler runs due jobs at their scheduled time (Dry Run only)
- **Manual Run Now**: Click ▶ on any waiting job (Dry Run)
- **Test Run**: Click 🧪 to run full flow and view detailed log
- **View Log**: Click 📋 to see stage-by-stage execution log

## History

- All executions logged with timestamps
- Filter by date, status, search
- View detailed logs with screenshots on error
- Export history as JSON/CSV

## Data Files

All data stored locally in `%APPDATA%/commishes-control-center/`:
- `queue.json` - Pending and completed jobs
- `history.json` - Execution history
- `settings.json` - User preferences
- `logs/jobs/*.log` - NDJSON structured logs per job
- `logs/errors/*.png` - Screenshots on failure

## Building

```bash
npm run make
```

Outputs to `dist/`:
- Portable executable
- NSIS installer

## License

ISC