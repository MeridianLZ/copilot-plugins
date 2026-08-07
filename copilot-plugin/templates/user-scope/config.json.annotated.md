# config.json — annotated reference (DO NOT project this file)

`~/.copilot/config.json` is **machine-managed** ("User settings belong in settings.json. This file is managed automatically."). The installer never writes it. Annotated shape, for understanding only:

```jsonc
{
  "firstLaunchAt": "<ISO-8601>",          // set by CLI on first run
  "appTipShown": true,                     // UI state
  "reasoningSummariesCleanupDone": true,   // migration flag
  "trustedFolders": ["/abs/path"],        // grows as you trust dirs; edit via CLI prompts, not by hand
  "installedPlugins": [                    // written by `copilot plugin install`
    {
      "name": "copilot-home",
      "marketplace": "copilot-home-marketplace",
      "version": "0.1.0",
      "installed_at": "<ISO-8601>",
      "cache_path": "~/.copilot/installed-plugins/copilot-home-marketplace/copilot-home",
      "enabled": true
    }
  ],
  "skill_directories": []                  // extra explicit skill dirs, if you use them
}
```

User-editable knobs live in `settings.json` (see the template beside this file).
