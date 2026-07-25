import { useEffect, useState } from "react";
import {
  Button,
  InlineAlert,
  ScreenHeader,
  SectionHeader,
  SelectField,
  Surface
} from "../../shared/ui";
import {
  DEFAULT_SETTINGS,
  formatShortcut,
  shortcutFromKeyboardEvent,
  type AppSettings
} from "./settings";

interface SettingsProps {
  settings: AppSettings;
  error?: string | null;
  status?: string | null;
  onChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onQuit: () => void;
}

export function Settings({ settings, error, status, onChange, onQuit }: SettingsProps) {
  const [recordingShortcut, setRecordingShortcut] = useState(false);

  useEffect(() => {
    if (!recordingShortcut) {
      return;
    }

    function handleShortcutKeyDown(event: globalThis.KeyboardEvent) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (event.key === "Escape" || event.code === "Escape") {
        setRecordingShortcut(false);
        return;
      }

      const shortcut = shortcutFromKeyboardEvent(event);
      if (!shortcut) {
        return;
      }

      setRecordingShortcut(false);
      onChange("captureShortcut", shortcut);
    }

    window.addEventListener("keydown", handleShortcutKeyDown, true);
    return () => window.removeEventListener("keydown", handleShortcutKeyDown, true);
  }, [onChange, recordingShortcut]);

  return (
    <section className="settings-screen">
      <ScreenHeader
        eyebrow="Application"
        title="Settings"
        description="Keep Desclop comfortable for daily local work. These preferences stay on this machine."
      />

      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      {status ? (
        <p className="settings-status" role="status" aria-live="polite">
          {status}
        </p>
      ) : null}

      <Surface ariaLabel="Appearance settings" className="settings-card">
        <SectionHeader title="Appearance" />
        <div className="settings-form settings-form--appearance">
          <SelectField
            id="settings-theme"
            label="Theme"
            hint="System follows the operating system appearance."
            value={settings.theme}
            onChange={(event) =>
              onChange("theme", event.target.value as AppSettings["theme"])
            }
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </SelectField>

          <SelectField
            id="settings-density"
            label="Density"
            value={settings.density}
            onChange={(event) =>
              onChange("density", event.target.value as AppSettings["density"])
            }
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </SelectField>

          <SelectField
            id="settings-text-scale"
            label="Interface size"
            value={settings.textScale}
            onChange={(event) =>
              onChange("textScale", event.target.value as AppSettings["textScale"])
            }
          >
            <option value="small">Small</option>
            <option value="normal">Normal</option>
            <option value="large">Large</option>
          </SelectField>

          <label
            className="settings-checkbox settings-checkbox--compact"
            htmlFor="settings-compact-sidebar"
          >
            <input
              id="settings-compact-sidebar"
              type="checkbox"
              checked={settings.compactSidebar}
              onChange={(event) => onChange("compactSidebar", event.target.checked)}
            />
            <span className="settings-checkbox__control" aria-hidden="true" />
            <span className="settings-checkbox__copy">
              <strong>Compact sidebar</strong>
              <small className="ui-help-text">
                Keep navigation labels visible while using less horizontal space.
              </small>
            </span>
          </label>

          <label
            className="settings-checkbox settings-checkbox--compact"
            htmlFor="settings-show-explanations"
          >
            <input
              id="settings-show-explanations"
              type="checkbox"
              checked={settings.showExplanations}
              onChange={(event) => onChange("showExplanations", event.target.checked)}
            />
            <span className="settings-checkbox__control" aria-hidden="true" />
            <span className="settings-checkbox__copy">
              <strong>Show explanatory text</strong>
              <small className="ui-help-text">
                Keep contextual descriptions and field hints visible throughout the app.
              </small>
            </span>
          </label>
        </div>
      </Surface>

      <Surface ariaLabel="Window settings" className="settings-card">
        <SectionHeader title="Window" />
        <div className="settings-form settings-form--two-column">
          <SelectField
            id="settings-close-behavior"
            label="When the window is closed"
            hint={
              settings.closeBehavior === "tray"
                ? "The app keeps running in the system tray."
                : "The app exits when the main window is closed."
            }
            value={settings.closeBehavior}
            onChange={(event) =>
              onChange("closeBehavior", event.target.value as AppSettings["closeBehavior"])
            }
          >
            <option value="tray">Hide to tray</option>
            <option value="quit">Quit the app</option>
          </SelectField>

          <label className="settings-checkbox" htmlFor="settings-window-resizable">
            <input
              id="settings-window-resizable"
              type="checkbox"
              checked={settings.windowResizable}
              onChange={(event) => onChange("windowResizable", event.target.checked)}
            />
            <span className="settings-checkbox__control" aria-hidden="true" />
            <span className="settings-checkbox__copy">
              <strong>Allow window resizing</strong>
              <small className="ui-help-text">
                The minimum window size keeps Plan, Task Detail, and Import usable.
              </small>
            </span>
          </label>

          <div className="settings-danger-zone">
            <div>
              <strong>Explicit quit</strong>
              <p className="ui-help-text">Quit is always available from the tray menu and exits immediately.</p>
            </div>
            <Button type="button" variant="secondary" onClick={onQuit}>
              Quit Desclop
            </Button>
          </div>
        </div>
      </Surface>

      <Surface ariaLabel="Capture shortcut settings" className="settings-card">
        <SectionHeader title="Capture shortcut" />
        <p className="settings-note ui-help-text">
          Assign a single key or a combination. The shortcut can work while Desclop is in the background.
        </p>
        <div className="settings-shortcut">
          <Button
            type="button"
            variant="secondary"
            className="settings-shortcut__recorder"
            aria-pressed={recordingShortcut}
            onClick={() => setRecordingShortcut((recording) => !recording)}
          >
            {recordingShortcut ? "Press a key or combination…" : formatShortcut(settings.captureShortcut)}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={settings.captureShortcut === DEFAULT_SETTINGS.captureShortcut}
            onClick={() => onChange("captureShortcut", DEFAULT_SETTINGS.captureShortcut)}
          >
            Reset
          </Button>
        </div>
        <p className="settings-note ui-help-text">
          Use Escape while recording to cancel. If the operating system rejects a shortcut, the previous one stays active.
        </p>
      </Surface>
    </section>
  );
}
