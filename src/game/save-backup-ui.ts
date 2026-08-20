import {
  createSaveBackup,
  parseSaveBackup,
  restoreSaveBackup,
  saveBackupFilename,
  type SaveBackupData,
} from "./save";

export const SAVE_BACKUP_TOOLS_MARKUP = `
  <div class="startup-record-tools" role="group" aria-label="記錄備份">
    <button type="button" data-startup-action="record-export"
      data-testid="export-save-backup">匯出全部記錄</button>
    <button type="button" data-startup-action="record-import"
      data-testid="import-save-backup">匯入記錄</button>
  </div>
  <input class="visually-hidden" type="file" accept="application/json,.json"
    data-testid="import-save-file" aria-label="選擇記錄備份檔" />`;

export const SAVE_BACKUP_CONFIRM_MARKUP = `
  <section class="startup-import-confirm" data-testid="import-save-confirm"
    role="dialog" aria-modal="true" aria-labelledby="import-save-title" hidden>
    <h3 id="import-save-title">還原全部記錄？</h3>
    <p data-testid="import-save-summary"></p>
    <p>備份內的空槽也會清空目前同號槽。此動作不會改變備份檔。</p>
    <div class="startup-import-confirm-actions" role="menu" aria-label="還原記錄選擇">
      <button type="button" role="menuitem" data-startup-action="record-import-confirm"
        data-import-confirm-index="0" data-testid="confirm-save-import">確 定</button>
      <button type="button" role="menuitem" data-startup-action="record-import-confirm"
        data-import-confirm-index="1" data-testid="cancel-save-import">取 消</button>
    </div>
  </section>`;

export const RECORD_SAVE_BACKUP_CONFIRM_MARKUP = `
  <input class="visually-hidden" type="file" accept="application/json,.json"
    data-testid="record-backup-file" aria-label="選擇記錄備份檔" />
  <section class="record-backup-confirm record-panel" data-testid="record-backup-confirm"
    role="dialog" aria-modal="true" aria-labelledby="record-backup-confirm-title" hidden>
    <h3 id="record-backup-confirm-title">還原全部記錄？</h3>
    <p data-testid="record-backup-summary"></p>
    <p>備份內的空槽也會清空目前同號槽。此動作不會改變備份檔。</p>
    <div class="record-backup-confirm-actions" role="menu" aria-label="還原記錄選擇">
      <button type="button" role="menuitem" data-action="record-backup-import-confirm"
        data-import-confirm-index="0" data-testid="record-backup-confirm-import">確 定</button>
      <button type="button" role="menuitem" data-action="record-backup-import-confirm"
        data-import-confirm-index="1" data-testid="record-backup-cancel-import">取 消</button>
    </div>
  </section>`;

export interface SaveBackupUi {
  cancel(): boolean;
  dispose(): void;
  handleClick(button: HTMLElement): boolean;
  handleKeyDown(event: KeyboardEvent): boolean;
  handlePointerOver(button: HTMLElement): boolean;
}

interface SaveBackupUiOptions {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  onRecordsRestored: (saveCount: number) => void;
  onStatus: (message: string) => void;
}

interface SaveBackupSurface {
  readonly contentSelector: string;
  readonly importButtonSelector: string;
  readonly fileInputSelector: string;
  readonly confirmSelector: string;
  readonly summarySelector: string;
  readonly cancelButtonSelector: string;
  readonly actionDataset: "action" | "startupAction";
  readonly exportAction: string;
  readonly importAction: string;
  readonly confirmAction: string;
}

const required = <T extends Element>(root: ParentNode, selector: string): T => {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`missing save backup element ${selector}`);
  return element;
};

function mountSaveBackupSurface(
  root: HTMLElement,
  options: SaveBackupUiOptions,
  surface: SaveBackupSurface,
): SaveBackupUi {
  const content = required<HTMLElement>(root, surface.contentSelector);
  const fileInput = required<HTMLInputElement>(root, surface.fileInputSelector);
  const confirm = required<HTMLElement>(root, surface.confirmSelector);
  const summary = required<HTMLParagraphElement>(root, surface.summarySelector);
  const cancelButton = required<HTMLButtonElement>(root, surface.cancelButtonSelector);
  let pendingBackup: SaveBackupData | undefined;
  /** The destructive import confirmation defaults to cancel (index 1). */
  let confirmIndex = 1;

  const setConfirmIndex = (index: number) => {
    confirmIndex = index === 0 ? 0 : 1;
    for (const button of confirm.querySelectorAll<HTMLButtonElement>("button")) {
      const selected = Number(button.dataset.importConfirmIndex) === confirmIndex;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-current", String(selected));
    }
  };

  const closeConfirm = (restoreFocus = true) => {
    pendingBackup = undefined;
    confirm.hidden = true;
    content.inert = false;
    if (restoreFocus) root.querySelector<HTMLButtonElement>(surface.importButtonSelector)?.focus();
  };

  const exportBackup = () => {
    const exportedAt = new Date();
    const created = createSaveBackup(options.storage, exportedAt);
    if (created.saveCount === 0) {
      options.onStatus(created.skippedInvalidSlots.length > 0
        ? "目前沒有可匯出的有效記錄；損壞的記錄不會寫入備份。"
        : "目前沒有可匯出的記錄。");
      return;
    }
    const blob = new Blob([created.serialized], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = saveBackupFilename(exportedAt);
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    const skipped = created.skippedInvalidSlots.length > 0
      ? `；損壞的記錄 ${created.skippedInvalidSlots.join("、")} 未包含`
      : "";
    options.onStatus(`已匯出 ${created.saveCount} 筆記錄${skipped}。`);
  };

  const openConfirm = (backup: SaveBackupData) => {
    pendingBackup = backup;
    const saveCount = backup.slots.filter((save) => save !== null).length;
    const exportedAt = backup.exportedAt.slice(0, 16).replace("T", " ");
    summary.textContent = `備份時間 ${exportedAt} UTC，共 ${saveCount} 筆有效記錄。`;
    content.inert = true;
    confirm.hidden = false;
    setConfirmIndex(1);
    cancelButton.focus();
  };

  const activateConfirm = () => {
    if (confirmIndex === 1 || !pendingBackup) {
      closeConfirm();
      return;
    }
    const backup = pendingBackup;
    const saveCount = backup.slots.filter((save) => save !== null).length;
    const result = restoreSaveBackup(options.storage, backup);
    closeConfirm(false);
    if (result.kind === "failed") {
      options.onStatus(result.rollbackSucceeded
        ? "匯入失敗，原有記錄已完整保留。"
        : "匯入失敗，且瀏覽器未能完整還原原有記錄；請重新整理後檢查。");
      root.querySelector<HTMLButtonElement>(surface.importButtonSelector)?.focus();
      return;
    }
    options.onRecordsRestored(saveCount);
    options.onStatus(`已從備份還原 ${saveCount} 筆記錄。`);
    root.querySelector<HTMLButtonElement>(surface.importButtonSelector)?.focus();
  };

  const onFileChange = async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    let raw: string;
    try {
      raw = await file.text();
    } catch {
      options.onStatus("匯入失敗：無法讀取選取的檔案。");
      return;
    }
    const backup = parseSaveBackup(raw);
    if (!backup) {
      options.onStatus("匯入失敗：檔案格式、版本或記錄內容不相容。");
      return;
    }
    openConfirm(backup);
  };

  fileInput.addEventListener("change", onFileChange);

  return {
    cancel: () => {
      if (!pendingBackup) return false;
      closeConfirm();
      return true;
    },
    dispose: () => fileInput.removeEventListener("change", onFileChange),
    handleClick: (button) => {
      const action = button.dataset[surface.actionDataset];
      if (pendingBackup && action !== surface.confirmAction) return true;
      if (action === surface.exportAction) {
        exportBackup();
        return true;
      }
      if (action === surface.importAction) {
        fileInput.click();
        return true;
      }
      if (action !== surface.confirmAction) return pendingBackup !== undefined;
      setConfirmIndex(Number(button.dataset.importConfirmIndex));
      activateConfirm();
      return true;
    },
    handleKeyDown: (event) => {
      if (!pendingBackup) {
        const focused = document.activeElement instanceof HTMLButtonElement
          ? document.activeElement
          : undefined;
        const action = focused?.dataset[surface.actionDataset];
        if (
          !focused
          || focused.offsetParent === null
          || (action !== surface.exportAction && action !== surface.importAction)
        ) {
          return false;
        }
        if (event.key === "Tab") return true;
        if (event.key !== "Enter" && event.key !== " ") return false;
        event.preventDefault();
        if (!event.repeat) focused.click();
        return true;
      }
      if (event.key === "Escape") closeConfirm();
      else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        setConfirmIndex(confirmIndex === 0 ? 1 : 0);
      } else if (event.key === "Tab") {
        setConfirmIndex(confirmIndex === 0 ? 1 : 0);
        confirm.querySelector<HTMLButtonElement>(
          `[data-import-confirm-index="${confirmIndex}"]`,
        )?.focus();
      } else if (event.key === "Enter" || event.key === " ") activateConfirm();
      else return true;
      event.preventDefault();
      return true;
    },
    handlePointerOver: (button) => {
      const action = button.dataset[surface.actionDataset];
      if (action === surface.confirmAction) setConfirmIndex(Number(button.dataset.importConfirmIndex));
      return action === surface.confirmAction
        || action === surface.exportAction
        || action === surface.importAction;
    },
  };
}

export function mountSaveBackupUi(
  root: HTMLElement,
  options: SaveBackupUiOptions,
): SaveBackupUi {
  return mountSaveBackupSurface(root, options, {
    contentSelector: ".startup-record-content",
    importButtonSelector: "[data-testid=import-save-backup]",
    fileInputSelector: "[data-testid=import-save-file]",
    confirmSelector: ".startup-import-confirm",
    summarySelector: "[data-testid=import-save-summary]",
    cancelButtonSelector: "[data-testid=cancel-save-import]",
    actionDataset: "startupAction",
    exportAction: "record-export",
    importAction: "record-import",
    confirmAction: "record-import-confirm",
  });
}

export function mountRecordSaveBackupUi(
  root: HTMLElement,
  options: SaveBackupUiOptions,
): SaveBackupUi {
  return mountSaveBackupSurface(root, options, {
    contentSelector: "#record-menu",
    importButtonSelector: "[data-testid=record-backup-import]",
    fileInputSelector: "[data-testid=record-backup-file]",
    confirmSelector: ".record-backup-confirm",
    summarySelector: "[data-testid=record-backup-summary]",
    cancelButtonSelector: "[data-testid=record-backup-cancel-import]",
    actionDataset: "action",
    exportAction: "record-backup-export",
    importAction: "record-backup-import",
    confirmAction: "record-backup-import-confirm",
  });
}
