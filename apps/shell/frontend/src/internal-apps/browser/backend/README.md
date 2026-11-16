# Browser Backend

The web-search team's engine lands here: `search_web` and `fetch_article`
behind the shell's IPC contract (`src/types/ipc.ts`), speaking the typed
`WidgetPayload` shapes the widget already renders. The frontend's
`BrowserSource` seam (`frontend/src/source.ts`) is the plug point — until the
engine connects, the fixture source serves honest offline pages and the widget
says so in the UI.
