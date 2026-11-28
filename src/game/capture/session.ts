import type { CaptureEventType, CaptureUntil } from "./options";

export type CaptureStatus = "loading" | "ready" | "running" | "done";

export interface CaptureEvent {
  /** 程式時鐘自起跑起的毫秒數；暫停期間不前進。 */
  readonly t: number;
  /** 同一時刻的 `performance.now()`，方便和錄製工具的時鐘對表。 */
  readonly perf: number;
  readonly type: string;
  readonly [detail: string]: unknown;
}

export interface CaptureRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** `window.__ANGEL2_CAPTURE__`：錄製工具唯一需要的介面。 */
export interface Angel2CaptureApi {
  readonly status: CaptureStatus;
  readonly ready: Promise<void>;
  start(): number;
  readonly done: Promise<void>;
  readonly events: readonly CaptureEvent[];
  /** 起跑前因等不到某項資源而放行時的說明；正常為空。 */
  readonly readyWarnings: readonly string[];
  rect(): CaptureRect;
  state(): object;
}

export interface CaptureSessionEnvironment {
  programNow(): number;
  performanceNow(): number;
  /** 程式時鐘上的延時：`until` 的延時跟著暫停一起停。 */
  programTimeout(callback: () => void, delay: number): void;
  /** 每筆事件同時派發給頁面（`CustomEvent("angel2-capture")`）。 */
  dispatch(event: CaptureEvent): void;
}

export interface CaptureSessionHooks {
  /** 放開準備門的凍結；起跑時呼叫一次。 */
  release(): void;
  /** 起跑時的 `scene` 事件詳情（入口、生效的表現設定）。 */
  describeScene(): Readonly<Record<string, unknown>>;
}

interface PendingEvent {
  readonly type: string;
  readonly detail: Readonly<Record<string, unknown>>;
}

/**
 * 一次錄製的生命週期：`loading`（資源門、掛載）→ `ready`（程式時鐘停在場景第一幀）→
 * `running`（起跑後記事件）→ `done`（滿足 `until`）。
 *
 * 起跑前就發生的事件（第一頁對白在準備門內就已開窗、語音排在暫停的音訊上）照順序暫存，
 * 起跑時以 `t = 0` 記在 `scene` 之後並標 `preStart`：它們正是起跑第一幀看到、聽到的東西。
 */
export class CaptureSession {
  private currentStatus: CaptureStatus = "loading";
  private readonly recorded: CaptureEvent[] = [];
  private readonly pending: PendingEvent[] = [];
  private readonly warnings: string[] = [];
  private startedAt = 0;
  private untilMatched = false;
  private resolveReady: () => void = () => undefined;
  private resolveDone: () => void = () => undefined;
  readonly ready: Promise<void>;
  readonly done: Promise<void>;

  constructor(
    private readonly until: CaptureUntil | undefined,
    private readonly environment: CaptureSessionEnvironment,
    private readonly hooks: CaptureSessionHooks,
  ) {
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    this.done = new Promise((resolve) => {
      this.resolveDone = resolve;
    });
  }

  get status(): CaptureStatus {
    return this.currentStatus;
  }

  get events(): readonly CaptureEvent[] {
    return this.recorded;
  }

  get readyWarnings(): readonly string[] {
    return this.warnings;
  }

  /** 準備門通過：場景已掛載、資源已解碼、程式時鐘停在第一幀。 */
  markReady(warnings: readonly string[] = []): void {
    if (this.currentStatus !== "loading") return;
    this.warnings.push(...warnings);
    this.currentStatus = "ready";
    this.resolveReady();
  }

  start(): number {
    if (this.currentStatus !== "ready") {
      throw new Error(`capture is ${this.currentStatus}; start() needs "ready"`);
    }
    this.currentStatus = "running";
    // 先記下起跑時刻再放開凍結：凍結中的程式時鐘就停在這個值。
    this.startedAt = this.environment.programNow();
    const perf = this.environment.performanceNow();
    this.append("scene", this.hooks.describeScene(), false);
    for (const { type, detail } of this.pending.splice(0)) this.append(type, detail, true);
    this.hooks.release();
    return perf;
  }

  /** 表現層與控制器回報的事件；起跑前先暫存，`done` 之後照常記。 */
  record(type: CaptureEventType | string, detail: Readonly<Record<string, unknown>> = {}): void {
    if (this.currentStatus === "loading" || this.currentStatus === "ready") {
      this.pending.push({ type, detail });
      return;
    }
    this.append(type, detail, false);
  }

  private append(type: string, detail: Readonly<Record<string, unknown>>, preStart: boolean): void {
    const event: CaptureEvent = {
      ...detail,
      ...(preStart ? { preStart: true } : {}),
      t: preStart ? 0 : Math.max(0, this.environment.programNow() - this.startedAt),
      perf: this.environment.performanceNow(),
      type,
    };
    this.recorded.push(event);
    this.environment.dispatch(event);
    if (type !== "done" && !this.untilMatched && this.until?.type === type) {
      this.untilMatched = true;
      const { delayMs } = this.until;
      if (delayMs === 0) this.finish();
      else this.environment.programTimeout(() => this.finish(), delayMs);
    }
  }

  private finish(): void {
    if (this.currentStatus !== "running") return;
    this.currentStatus = "done";
    this.append("done", {}, false);
    this.resolveDone();
  }
}
