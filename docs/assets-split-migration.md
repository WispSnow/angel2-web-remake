# 原版素材拆分迁移手册

把 `public/assets/original/` 从公开仓库移到独立私有仓库，同时保持 CI、Windows 打包和本地
开发可用。本文是这次迁移的操作清单与顺序约束。

**当前状态：第一、二阶段已完成，第三阶段部分完成。** 剩余未完成项：

- [ ] 建立细粒度 PAT 并写入仓库 secret `ASSETS_REPO_TOKEN`（第 6 步，必须你本人操作）
- [ ] 生成素材包并确定分发地址，回填 README 的「下载地址：待补充」占位符（第 5 步）
- [ ] 重写 Git 历史（第 8 步，**必须在仓库公开之前**）

**在这三项完成之前，不要把仓库设为公开**：没有 secret 时 CI 会因为取不到素材而失败，
而历史里仍留有素材的全部 3,831 个对象。

## 为什么要分三个阶段

三件事有硬性先后顺序，颠倒会造成不可恢复的状态：

1. **素材必须先在别处存在**，才能从本仓库删除。否则唯一副本只剩本地工作区，一次误删就没了。
2. **必须先停止追踪，才能改 `.gitignore`**。反过来做会留下一个陷阱：`.gitignore` 不影响已
   追踪文件，但会让**新生成**的素材静默不进 `git status`——重跑生成器时新增的帧会悄悄丢失。
3. **历史重写必须在公开之前**。仓库公开后再重写，中间任何人 clone 过就等于素材已经流出，
   而且强推会打断所有已有 fork 和 PR。

---

## 第一阶段：本地准备（已完成）

无需私有仓库即可完成，且不改变素材的追踪状态，因此可以随时回退。

- [x] `scripts/check-original-assets.mjs`：素材缺失／层级错误／版本不符的前置检查。
- [x] `package.json` 的 `predev`、`pretest`、`pretest:coverage`、`pretest:e2e`、
      `prebuild:release` 钩子调用该检查（`--quiet`，成功时无输出）。pnpm 11 默认执行
      `pre*` 脚本，已实测。
- [x] `scripts/setup-worktree.sh` 增加 `link_from_main "public/assets/original"`。素材仍被
      追踪时该行会打印「跳过」，停止追踪后自动开始软链，无需再改。
- [x] README 增加「获取原版素材」章节与版权口径。

**版本对齐不需要额外的 lock 文件。** `scripts/generate-resource-manifest.mjs` 已经把清单身份
哈希写进随代码提交的 `src/game/content/resource-manifest.generated.ts`
（`RESOURCE_MANIFEST_IDENTITY`）。前置检查比对这一个哈希，就能拦下版本错配的素材包。

---

## 第二阶段：建立私有素材仓库并停止追踪（已完成）

### 1. 建私有仓库（已完成）

`WispSnow/angel2-assets`，private，`main` 分支，3,225 个文件已推送并核对。

仓库根目录**等于 `public/assets/original/` 的内容**（根下直接是 `music/`、`portraits/`、
`resource-manifest.v1.json` …），CI 才能用 `path: public/assets/original` 一步到位。
**根目录不要放 README 或任何非素材文件**：`generate-resource-manifest.mjs` 会扫描目录下
每一个文件，多一个文件就会改变清单身份哈希，并被复制进 `release/`。版权说明放在 GitHub
仓库描述里。

```bash
gh repo create WispSnow/angel2-assets --private
cd /tmp && git init angel2-assets && cd angel2-assets
cp -R /path/to/TS2/public/assets/original/. .
git add -A && git commit -m "chore: import original asset pack"
git remote add origin git@github.com:WispSnow/angel2-assets.git
git push -u origin main
```

推完后核对文件数与体积对得上（3,225 个文件 / 67 MB），再进行下一步。

### 2. 从公开仓库停止追踪（已完成）

```bash
git rm -r --cached public/assets/original
```

`--cached` 只从索引移除，工作区文件保留——本地仍然可以直接开发。

### 3. 改 `.gitignore`（已完成）

删掉第 27–56 行全部 30 条 `!public/assets/original/...` 反向例外，替换为一行：

```
public/assets/original/
```

`!docs/media/` 与 `!src-tauri/icons/...` 的例外要保留。

### 4. 验证（已完成，尚未提交）

```bash
git status --short          # 应只看到大量 D（删除追踪）与 .gitignore 修改
pnpm check:assets           # 工作区文件还在，必须仍然通过
pnpm build:release          # 必须仍然通过
```

### 5. 生成并发布素材包

在私有素材仓库里：

```bash
git archive --prefix=original/ -o angel2-assets-v1.zip HEAD
```

`--prefix=original/` 让包内根目录是 `original/`，用户解压到 `public/assets/` 即落位；同时
`git archive` 天然不含 `.git`。把 zip 传到公开仓库的 Release，版本号与素材仓库的 tag 对应。

---

## 第三阶段：工作流与历史

### 6. 两个工作流加素材 checkout（YAML 已改，secret 待建）

`ci.yml` 的三个 job 与 `desktop-windows.yml` 的 package job，都要在「Install dependencies」
**之前**加：

```yaml
      - name: Check out original assets
        uses: actions/checkout@v4
        with:
          repository: WispSnow/angel2-assets
          token: ${{ secrets.ASSETS_REPO_TOKEN }}
          path: public/assets/original

      - name: Strip nested git metadata
        shell: bash
        run: rm -rf public/assets/original/.git
```

两点必须注意：

- **`rm -rf .git` 不能省。** Vite 会把 `public/` 下的一切原样复制进 `release/`，不删就会把
  素材仓库的 git 元数据打进 Windows 安装包和线上站点。
- **`token` 用细粒度 PAT**，只授予 `angel2-assets` 的 `Contents: Read`，存为仓库 secret
  `ASSETS_REPO_TOKEN`。不要用有写权限的令牌。

版本对齐由 `pnpm check:assets` 兜底：素材仓库跟 `main` 即可，取到不匹配的版本时构建会带着
明确信息失败，而不是产出坏包。需要更强的可复现性再给 checkout 加 `ref:`。

### 7. 处理 fork PR 拿不到 secret 的问题（已完成）

GitHub 不会把 secret 交给来自 fork 的 `pull_request` 触发的工作流，因此外部贡献者的 PR 上
素材 checkout 必然失败。已采用的做法：

- `quality` 与 `e2e` 两个 job 加守卫，fork PR 跳过：

  ```yaml
    if: github.event_name != 'pull_request'
      || github.event.pull_request.head.repo.full_name == github.repository
  ```

  `coverage` 本来就只在推送时跑，天然不受影响。

- 新增 `external-pr` job 覆盖 fork PR，只跑 `pnpm typecheck` 与 `pnpm build`——这两条是
  目前仅有的、在干净检出上确定能过的检查（原因见下节）。

将来若要让外部 PR 也跑单元测试，需要把测试拆成「依赖本地取证／素材」与「纯逻辑」两组。
依赖素材的是 `music-assets`、`map-action-atlas`、`full-combat-atlas`、
`battle-sprite-atlas`、`stage1-content`、`resource-manifest`、`construction-terrain-assets`
共 7 个文件；依赖 `reverse/` 取证产物的还要多得多，见下节。

### 7.1 干净检出上 CI 本来就跑不过（既有问题，与本次迁移无关）

排查素材工作流时发现 `main` 上的 CI 已连续失败多次（最近一次为 run 32616278229），
根因与素材同类：**多项检查假定维护者本地的 `reverse/`、`ref/` 取证产物存在**，而它们被
gitignore，干净检出上没有。

| 检查 | 干净检出上的表现 |
| --- | --- |
| `pnpm docs:check` | 2 个错误：`stage-02.md` 链到 gitignore 的 `ref/关卡列表.md`；职业数值参考需要 `reverse/parsed/native/unit-catalog.json` |
| `pnpm test` / `test:coverage` | 约 40 个 `stage*-content` 用例报 `ENOENT: reverse/decoded/B/****/00.raw` |
| `tests/unit/stage36-ai-performance` | CI runner 较慢导致性能预算超标（实测 1996 ms > 1500 ms 上限），与取证产物无关 |
| e2e | 前面失败触发 fail-fast，被取消 |

**这是仓库公开前必须单独处理的一项**：README 顶部有 CI 徽章，公开后会直接显示 failing。
处理方向与素材一致——把「需要本地取证产物」的检查同「干净检出可跑」的检查分开，前者只在
维护者环境或带取证产物的 job 里跑。

### 8. 重写历史（公开之前，不可逆）

只在 HEAD 删除素材是无效的：当前 `.git` 有 270 MiB，`public/assets` 在历史中有 3,831 个
对象，任何人 clone 之后都能取回全部素材。

```bash
# 先做完整备份，这一步不可逆
git clone --mirror . /path/to/backup-before-filter.git

pip install git-filter-repo
git filter-repo --path public/assets/original --invert-paths
```

之后：

- 所有 commit SHA 都会改变，必须强推，且现存的 fork／PR／本地 clone 全部作废。
- `planning/` 与 `reverse/` 里引用旧 commit SHA 的文字会失效，需要复核。
- 重写后再次运行 `pnpm check:assets`、`pnpm build:release` 和 `pnpm docs:check`。
- 用 `git count-objects -vH` 确认体积确实下降（预期从约 270 MiB 降到 20 MiB 量级）。

---

## 迁移后的边界

- 素材包不进入 Git，通过单独的下载地址分发；生成器重跑后素材有变，要同时把新素材推到
  `angel2-assets` 并重新发布素材包，否则 CI 会因清单身份不符而失败（这正是期望行为）。
- 素材仓库是私有的，因此**外部贡献者无法运行游戏或依赖素材的测试**。这是这个方案的固有代价，
  README 已经说明。
- 把素材移出仓库降低了分发面，但 `src/game/content/` 里约 2.7 MB 由原版数据生成的内容表
  （对白、地图、数值、图集帧表）仍留在公开仓库，无法拆出。彻底方案是玩家自备原版文件、本机
  转换，属于另一项独立工程。
