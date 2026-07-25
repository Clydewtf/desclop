import { open } from "@tauri-apps/plugin-dialog";

export async function chooseFolder() {
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : null;
}

export async function choosePortableBackupFile() {
  const selected = await open({
    directory: false,
    multiple: false,
    filters: [{ name: "Desclop backup", extensions: ["desclop"] }]
  });
  return typeof selected === "string" ? selected : null;
}
