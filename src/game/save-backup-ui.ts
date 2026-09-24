import { DIFFICULTY_OPTIONS } from "./content/startup";
import {
  createSaveBackup,
  deleteSaveSlot,
  parseSaveBackup,
  readSaveSlot,
  restoreSaveBackup,
  saveBackupFilename,
  saveRecordStageLabel,
  type SaveBackupData,
  type SaveSlotReadResult,
} from "./save";

const DELETE_CONFIRM_NOTE = "刪除後無法復原；如需保留，請先匯出備份。";

export const SAVE_BACKUP_TOOLS_MARKUP = `
  <div class="startup-record-tools" role="group" aria-label="記錄工具">
    <button type="button" data-startup-action="record-export"
      data-testid="export-save-backup">匯出全部記錄</button>
    <button type="button" data-startup-action="record-import"
      data-testid="import-save-backup">匯入記錄</button>
    <button type="button" data-startup-action="record-delete"
      data-testid="delete-save-record">刪除此記錄</button>
  </div>
  <input class="visually-hidden" type="file" accept="application/json,.json"
    data-testid="import-save-file" aria-label="選擇記錄備份檔" />`;

export const SAVE_BACKUP_CONFIRM_MARKUP = `
  <section class="startup-record-confirm" data-testid="import-save-confirm"
    role="dialog" aria-modal="true" aria-labelledby="import-save-title" hidden>
    <h3 id="import-save-title">還原全部記錄？</h3>
    <p data-testid="import-save-summary"></p>
    <p>備份內的空槽也會清空目前同號槽。此動作不會改變備份檔。</p>
    <div class="startup-record-confirm-actions" role="menu" aria-label="還原記錄選擇">
      <button type="button" role="menuitem" data-startup-action="record-import-confirm"
        data-confirm-index="0" data-testid="confirm-save-import">確 定</button>
      <button type="button" role="menuitem" data-startup-action="record-import-confirm"
        data-confirm-index="1" data-testid="cancel-save-import">取 消</button>
    </div>
  </section>
  <section class="startup-record-confirm" data-testid="delete-save-confirm"
    role="dialog" aria-modal="true" aria-labelledby="delete-save-title"
    aria-describedby="delete-save-summary" hidden>
    <h3 id="delete-save-title" data-testid="delete-save-title"></h3>
    <p id="delete-save-summary" data-testid="delete-save-summary"></p>
    <p>只刪除這一格，其他記錄不受影響。<br />${DELETE_CONFIRM_NOTE}</p>
    <div class="startup-record-confirm-actions" role="menu" aria-label="刪除記錄選擇">
      <button type="button" role="menuitem" data-startup-action="record-delete-confirm"
        data-confirm-index="0" data-testid="confirm-save-delete">確 定</button>
      <button type="button" role="menuitem" data-startup-action="record-delete-confirm"
        data-confirm-index="1" data-testid="cancel-save-delete">取 消</button>
    </div>
  </section>`;

export const RECORD_SAVE_BACKUP_CONFIRM_MARKUP = `
  <input class="visually-hidden" type="file" accept="application/json,.json"
    data-testid="record-backup-file" aria-label="選擇記錄備份檔" />
  <section class="record-tools-confirm record-panel" data-testid="record-backup-confirm"
    role="dialog" aria-modal="true" aria-labelledby="record-backup-confirm-title" hidden>
    <h3 id="record-backup-confirm-title">還原全部記錄？</h3>
    <p data-testid="record-backup-summary"></p>
    <p>備份內的空槽也會清空目前同號槽。此動作不會改變備份檔。</p>
    <div class="record-tools-confirm-actions" role="menu" aria-label="還原記錄選擇">
      <button type="button" role="menuitem" data-action="record-backup-import-confirm"
        data-confirm-index="0" data-testid="record-backup-confirm-import">確 定</button>
      <button type="button" role="menuitem" data-action="record-backup-import-confirm"
        data-confirm-index="1" data-testid="record-backup-cancel-import">取 消</button>
    </div>
  </section>
  <section class="record-tools-confirm record-panel" data-testid="record-delete-confirm"
    role="dialog" aria-modal="true" aria-labelledby="record-delete-title"
    aria-describedby="record-delete-summary" hidden>
    <h3 id="record-delete-title" data-testid="record-delete-title"></h3>
    <p id="record-delete-summary" data-testid="record-delete-summary"></p>
    <p>只刪除這一格，目前的戰局與其他記錄不受影響。<br />${DELETE_CONFIRM_NOTE}</p>
    <div class="record-tools-confirm-actions" role="menu" aria-label="刪除記錄選擇">
      <button type="button" role="menuitem" data-action="record-delete-confirm"
        data-confirm-index="0" data-testid="record-delete-confirm-delete">確 定</button>
      <button type="button" role="menuitem" data-action="record-delete-confirm"
        data-confirm-index="1" data-testid="record-delete-cancel">取 消</button>
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
  /** The 1-based slot under the record cursor; each surface owns its own cursor. */
  selectedSlot: () => number;
  onRecordsRestored: (saveCount: number) => void;
  onRecordDeleted: (slot: number) => void;
  onStatus: (message: string) => void;
}

interface SaveBackupSurface {
  readonly contentSelector: string;
  readonly fileInputSelector: string;
  readonly actionDataset: "action" | "startupAction";
  readonly exportAction: string;
  readonly importAction: string;
  readonly importButtonSelector: string;
  readonly importConfirmAction: string;
  readonly importConfirmSelector: string;
  readonly importSummarySelector: string;
  readonly importCancelSelector: string;
  readonly deleteAction: string;
  readonly deleteButtonSelector: string;
  readonly deleteConfirmAction: string;
  readonly deleteConfirmSelector: string;
  readonly deleteTitleSelector: string;
  readonly deleteSummarySelector: string;
  readonly deleteCancelSelector: string;
}

type PendingConfirmation =
  | { kind: "import"; backup: SaveBackupData }
  | { kind: "delete"; slot: number };

const required = <T extends Element>(root: ParentNode, selector: string): T => {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`missing save backup element ${selector}`);
  return element;
};

/** What the delete confirmation names, so the player can tell which record goes. */
function deletionSummary(result: SaveSlotReadResult): string {
  if (result.kind !== "valid") return "資料損壞或版本不相容，無法讀取。";
  const { save } = result;
  const progress = save.kind === "battle" ? `第 ${save.battle.round} 回合` : "戰役完成";
  const savedAt = `${save.savedAt.slice(0, 16).replace("T", " ")} UTC`;
  return `${saveRecordStageLabel(save)}・${progress}・${DIFFICULTY_OPTIONS[save.difficulty].label}・${savedAt}`;
}

function mountSaveBackupSurface(
  root: HTMLElement,
  options: SaveBackupUiOptions,
  surface: SaveBackupSurface,
): SaveBackupUi {
  const content = required<HTMLElement>(root, surface.contentSelector);
  const fileInput = required<HTMLInputElement>(root, surface.fileInputSelector);
  const dialogs = {
    import: {
      element: required<HTMLElement>(root, surface.importConfirmSelector),
      cancelButton: required<HTMLButtonElement>(root, surface.importCancelSelector),
      action: surface.importConfirmAction,
      originSelector: surface.importButtonSelector,
    },
    delete: {
      element: required<HTMLElement>(root, surface.deleteConfirmSelector),
      cancelButton: required<HTMLButtonElement>(root, surface.deleteCancelSelector),
      action: surface.deleteConfirmAction,
      originSelector: surface.deleteButtonSelector,
    },
  } as const;
  const importSummary = required<HTMLParagraphElement>(root, surface.importSummarySelector);
  const deleteTitle = required<HTMLElement>(root, surface.deleteTitleSelector);
  const deleteSummary = required<HTMLParagraphElement>(root, surface.deleteSummarySelector);
  const toolActions = new Set([
    surface.exportAction,
    surface.importAction,
    surface.deleteAction,
  ]);
  let pending: PendingConfirmation | undefined;
  /** Both destructive confirmations default to cancel (index 1). */
  let confirmIndex = 1;

  const setConfirmIndex = (index: number) => {
    confirmIndex = index === 0 ? 0 : 1;
    if (!pending) return;
    for (const button of dialogs[pending.kind].element.querySelectorAll<HTMLButtonElement>("button")) {
      const selected = Number(button.dataset.confirmIndex) === confirmIndex;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-current", String(selected));
    }
  };

  const focusTool = (selector: string) => {
    root.querySelector<HTMLButtonElement>(selector)?.focus();
  };

  const closeConfirm = (restoreFocus = true) => {
    if (!pending) return;
    const dialog = dialogs[pending.kind];
    pending = undefined;
    dialog.element.hidden = true;
    content.inert = false;
    if (restoreFocus) focusTool(dialog.originSelector);
  };

  const openConfirm = (next: PendingConfirmation) => {
    pending = next;
    const dialog = dialogs[next.kind];
    content.inert = true;
    dialog.element.hidden = false;
    setConfirmIndex(1);
    dialog.cancelButton.focus();
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

  const openImportConfirm = (backup: SaveBackupData) => {
    const saveCount = backup.slots.filter((save) => save !== null).length;
    const exportedAt = backup.exportedAt.slice(0, 16).replace("T", " ");
    importSummary.textContent = `備份時間 ${exportedAt} UTC，共 ${saveCount} 筆有效記錄。`;
    openConfirm({ kind: "import", backup });
  };

  /**
   * Deleting targets the cursor slot only. An empty slot has nothing to confirm,
   * so it answers in the status line instead of opening a dialog that could
   * only say so; a corrupt record is deletable and says it is corrupt.
   */
  const requestDelete = () => {
    const slot = options.selectedSlot();
    const result = readSaveSlot(options.storage, slot);
    if (result.kind === "empty") {
      options.onStatus(`記錄 ${slot} 是空槽，沒有可刪除的資料。`);
      return;
    }
    deleteTitle.textContent = `刪除記錄 ${slot}？`;
    deleteSummary.textContent = deletionSummary(result);
    openConfirm({ kind: "delete", slot });
  };

  const restoreBackup = (backup: SaveBackupData) => {
    const saveCount = backup.slots.filter((save) => save !== null).length;
    const result = restoreSaveBackup(options.storage, backup);
    if (result.kind === "failed") {
      options.onStatus(result.rollbackSucceeded
        ? "匯入失敗，原有記錄已完整保留。"
        : "匯入失敗，且瀏覽器未能完整還原原有記錄；請重新整理後檢查。");
      return;
    }
    options.onRecordsRestored(saveCount);
    options.onStatus(`已從備份還原 ${saveCount} 筆記錄。`);
  };

  const deleteRecord = (slot: number) => {
    const result = deleteSaveSlot(options.storage, slot);
    if (result.kind === "failed") {
      options.onStatus(`刪除失敗，記錄 ${slot} 保持不變。`);
      return;
    }
    options.onRecordDeleted(slot);
    options.onStatus(result.kind === "deleted"
      ? `已刪除記錄 ${slot}。`
      : `記錄 ${slot} 是空槽，沒有可刪除的資料。`);
  };

  const activateConfirm = () => {
    const confirmed = pending;
    if (!confirmed) return;
    if (confirmIndex === 1) {
      closeConfirm();
      return;
    }
    const origin = dialogs[confirmed.kind].originSelector;
    closeConfirm(false);
    if (confirmed.kind === "import") restoreBackup(confirmed.backup);
    else deleteRecord(confirmed.slot);
    focusTool(origin);
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
    openImportConfirm(backup);
  };

  fileInput.addEventListener("change", onFileChange);

  return {
    cancel: () => {
      if (!pending) return false;
      closeConfirm();
      return true;
    },
    dispose: () => fileInput.removeEventListener("change", onFileChange),
    handleClick: (button) => {
      const action = button.dataset[surface.actionDataset];
      if (pending) {
        if (action === dialogs[pending.kind].action) {
          setConfirmIndex(Number(button.dataset.confirmIndex));
          activateConfirm();
        }
        return true;
      }
      if (action === surface.exportAction) exportBackup();
      else if (action === surface.importAction) fileInput.click();
      else if (action === surface.deleteAction) requestDelete();
      // A closed dialog's buttons are hidden; a stray one still must not reach the host.
      else if (action !== surface.importConfirmAction && action !== surface.deleteConfirmAction) {
        return false;
      }
      return true;
    },
    handleKeyDown: (event) => {
      if (!pending) {
        const focused = document.activeElement instanceof HTMLButtonElement
          ? document.activeElement
          : undefined;
        const action = focused?.dataset[surface.actionDataset];
        if (!focused || focused.offsetParent === null || !action || !toolActions.has(action)) {
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
        dialogs[pending.kind].element.querySelector<HTMLButtonElement>(
          `[data-confirm-index="${confirmIndex}"]`,
        )?.focus();
      } else if (event.key === "Enter" || event.key === " ") activateConfirm();
      else return true;
      event.preventDefault();
      return true;
    },
    handlePointerOver: (button) => {
      const action = button.dataset[surface.actionDataset];
      if (!action) return false;
      if (pending && action === dialogs[pending.kind].action) {
        setConfirmIndex(Number(button.dataset.confirmIndex));
        return true;
      }
      return toolActions.has(action)
        || action === surface.importConfirmAction
        || action === surface.deleteConfirmAction;
    },
  };
}

export function mountSaveBackupUi(
  root: HTMLElement,
  options: SaveBackupUiOptions,
): SaveBackupUi {
  return mountSaveBackupSurface(root, options, {
    contentSelector: ".startup-record-content",
    fileInputSelector: "[data-testid=import-save-file]",
    actionDataset: "startupAction",
    exportAction: "record-export",
    importAction: "record-import",
    importButtonSelector: "[data-testid=import-save-backup]",
    importConfirmAction: "record-import-confirm",
    importConfirmSelector: "[data-testid=import-save-confirm]",
    importSummarySelector: "[data-testid=import-save-summary]",
    importCancelSelector: "[data-testid=cancel-save-import]",
    deleteAction: "record-delete",
    deleteButtonSelector: "[data-testid=delete-save-record]",
    deleteConfirmAction: "record-delete-confirm",
    deleteConfirmSelector: "[data-testid=delete-save-confirm]",
    deleteTitleSelector: "[data-testid=delete-save-title]",
    deleteSummarySelector: "[data-testid=delete-save-summary]",
    deleteCancelSelector: "[data-testid=cancel-save-delete]",
  });
}

export function mountRecordSaveBackupUi(
  root: HTMLElement,
  options: SaveBackupUiOptions,
): SaveBackupUi {
  return mountSaveBackupSurface(root, options, {
    contentSelector: "#record-menu",
    fileInputSelector: "[data-testid=record-backup-file]",
    actionDataset: "action",
    exportAction: "record-backup-export",
    importAction: "record-backup-import",
    importButtonSelector: "[data-testid=record-backup-import]",
    importConfirmAction: "record-backup-import-confirm",
    importConfirmSelector: "[data-testid=record-backup-confirm]",
    importSummarySelector: "[data-testid=record-backup-summary]",
    importCancelSelector: "[data-testid=record-backup-cancel-import]",
    deleteAction: "record-delete",
    deleteButtonSelector: "[data-testid=record-backup-delete]",
    deleteConfirmAction: "record-delete-confirm",
    deleteConfirmSelector: "[data-testid=record-delete-confirm]",
    deleteTitleSelector: "[data-testid=record-delete-title]",
    deleteSummarySelector: "[data-testid=record-delete-summary]",
    deleteCancelSelector: "[data-testid=record-delete-cancel]",
  });
}
