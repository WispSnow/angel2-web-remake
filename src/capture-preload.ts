import { installCapturePreferences } from "./game/capture/preload";

/**
 * 每個入口的第一個 import：開發構建先解析網址的錄製（`capture=1`）與表現參數，在任何模組讀
 * 偏好之前換上只對這一頁生效的覆寫層。發布構建整段被常數折疊移除，連同 `game/capture/`。
 */
if (import.meta.env.MODE !== "release") installCapturePreferences(location.search);
