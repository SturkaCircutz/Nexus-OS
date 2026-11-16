/**
 * Compatibility re-export of the production desktop store (WM-A / Task A1).
 *
 * Divy's MockDesktopProvider and existing tests keep importing from this path.
 * The real logic lives in windowStore.ts; this file only aliases names so
 * Divy's code keeps working without import renames.
 */

export {
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WINDOW_SIZE,
  FALLBACK_CANVAS_SIZE,
  createDesktopStore as createMockDesktopStore,
  createSeedSession,
  defaultTitleFor,
  type DesktopStore as MockDesktopStore,
  type DesktopStoreActions,
  type DesktopStoreOptions as MockDesktopStoreOptions,
} from './windowStore'
