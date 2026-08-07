# Repo-scope hook payload (projection lane)

`copilot-home.json` is the repo-scope twin of the plugin's `hooks/copilot-hooks.json` — same events, same scripts, but loaded from `.github/hooks/` where the Copilot CLI (and the cloud agent, which loads ONLY this location) picks it up without the `${PLUGIN_ROOT}` workaround.

The scripts are **not duplicated here**: `/copilot-home:copilot-home-install repo` copies `copilot-home.json` into the target repo's `.github/hooks/` and the scripts from the plugin's `hooks/scripts/` into `.github/hooks/scripts/`, then verifies enforcement live with an attempted-block test. Single source of truth for script logic stays `hooks/scripts/`.
