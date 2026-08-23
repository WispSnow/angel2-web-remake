/**
 * 宿主工具列上的單選組骨架。「畫面縮放」與「介面縮放」共用同一份行為，其中
 * 「按鍵絕不能抵達戰場」是安全性不變式：戰鬥、開場與結局都在 `window` 上綁 `keydown`，
 * 這裡漏出去一次，玩家只是在挑選項就會移動戰場游標或推進演出。這條規則只留一份實作，
 * 之後再加宿主控制項時也不會又抄一份漏掉的版本。
 */
export interface HostChromeRadioOption<Value extends string> {
  readonly value: Value;
  readonly label: string;
  readonly testid: string;
  readonly title?: string;
}

export interface HostChromeRadioConfig<Value extends string> {
  /** 控制項掛進去的容器；卸載時只移除自己建立的節點。 */
  readonly container: HTMLElement;
  readonly labelId: string;
  readonly labelText: string;
  /** `dataset` 上的鍵名，同時決定選取器 `[data-<kebab>]`。 */
  readonly datasetKey: string;
  readonly options: readonly HostChromeRadioOption<Value>[];
  readonly read: () => Value;
  readonly write: (value: Value) => void;
  readonly subscribe: (listener: (value: Value) => void) => () => void;
  /** 每次重繪後的額外處理，例如更新共用的說明行。 */
  readonly onRender?: (value: Value, initial: boolean) => void;
}

const kebab = (key: string): string => key.replace(/[A-Z]/gu, (upper) => `-${upper.toLowerCase()}`);

export function mountHostChromeRadioGroup<Value extends string>(
  config: HostChromeRadioConfig<Value>,
): () => void {
  const { container, datasetKey, options } = config;
  const attribute = `data-${kebab(datasetKey)}`;
  const label = document.createElement("span");
  label.className = "display-settings-label";
  label.id = config.labelId;
  label.textContent = config.labelText;
  const group = document.createElement("div");
  group.className = "display-settings-options";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-labelledby", config.labelId);
  const buttons = options.map((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "radio");
    button.setAttribute(attribute, option.value);
    button.dataset.testid = option.testid;
    if (option.title !== undefined) button.title = option.title;
    button.textContent = option.label;
    group.append(button);
    return button;
  });
  container.append(label, group);

  const isValue = (candidate: string | null | undefined): candidate is Value =>
    options.some((option) => option.value === candidate);

  let initial = true;
  const render = (value: Value) => {
    for (const button of buttons) {
      const selected = button.getAttribute(attribute) === value;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    config.onRender?.(value, initial);
    initial = false;
  };

  const events = new AbortController();
  const { signal } = events;
  group.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(`[${attribute}]`);
    const value = button?.getAttribute(attribute);
    if (isValue(value)) config.write(value);
  }, { signal });
  group.addEventListener("keydown", (event) => {
    // 每一個按鍵都要停在這裡，不只是處理得到的那幾個：`stopPropagation` 之外的按鍵
    // 仍會被戰場的 `window` 監聽收走。單獨 `stopPropagation` 已足以擋住外洩，Tab 與
    // Space/Enter 的原生行為則保持不變。
    event.stopPropagation();
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight"
      && event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    // 方向鍵是 radiogroup 的預期操作，也是 roving tabindex 之後唯一能走到未選項目的路。
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const next = buttons[(index + delta + buttons.length) % buttons.length];
    const value = next.getAttribute(attribute);
    if (isValue(value)) config.write(value);
    next.focus();
  }, { signal });

  const unsubscribe = config.subscribe(render);
  render(config.read());
  return () => {
    events.abort();
    unsubscribe();
    label.remove();
    group.remove();
  };
}
