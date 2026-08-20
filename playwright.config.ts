import { defineConfig, devices } from "@playwright/test";

// `reuseExistingServer` 会接管 4173 上任何一个已在跑的开发服务器。在 worktree 里
// 跑验收时，那通常是主工作区的服务器，测试就会静默地验到另一份代码。设定
// `ANGEL2_E2E_PORT` 可以让这次运行拥有自己的端口和服务器；不设时行为不变。
const port = Number(process.env.ANGEL2_E2E_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  // Playwright 默认起「CPU 核数一半」个 worker（本机 10 核即 5 个）。本套件的用例
  // 是长时间真实通关，多个 Chromium 上下文互相抢占后，页面会被判为不可见并把
  // requestAnimationFrame 节流到近乎停止——而剧情推进、眨眼时钟和战斗表现都由 rAF
  // 驱动。症状每次落点不同（waitForFunction 超时、locator.click 超时、眨眼延迟取样
  // 撞车、断言读到过期状态），本质是同一个资源饥饿。实测 5 worker 时
  // `S00-A through S00-D` 约 3/4 次失败，2 worker 连续两轮全绿，总时长只多约 15%。
  workers: 2,
  // 该用例单独跑约 14 s，默认 30 s 余量太窄；留一倍余量，避免机器偶发变慢就误报。
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chromium",
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
});
