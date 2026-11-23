# 日落路书 · Leonida Field Notes

GTA VI 中文无剧透游玩手记。打开后只显示当前章节，任务和人物名称可以在简中、繁中与英文对照之间查看。人物卡、武器领取窗口及章末提示随本机进度更新。

## 运行

在仓库根目录运行 `python -m http.server 8000 --directory public`，访问 `http://localhost:8000`。剧情攻略在首页，武器备忘、任务与解锁、人物名录和资料来源分别位于 `/weapons/`、`/missions/`、`/people/` 和 `/references/`。同一浏览器中的五页共用游戏进度。

## 部署

修改页面模板、脚本、样式或数据后，在仓库根目录运行 `python tools/build_pages.py` 更新五个静态入口。Cloudflare Pages 的构建命令留空，输出目录设为 `public`。也可以将 `public` 目录直接上传到 Pages。

## 内容维护

`public/guide-data.js` 保存各章任务、前置关系、武器窗口、人物登场点和资料来源。前置条件用于推断已见人物与领取窗口，玩家勾选的任务完成记录单独保存。更新任务或角色时沿用已有 ID，以保留本机进度。

首次访问可以用 `#at=<任务ID>` 指定当前任务。已有本机记录优先。人物缩略图来源见 `public/assets/portraits/credits.json`。

### 上游任务索引

项目使用 [gta6-data](https://github.com/crlsmartnruiz/gta6-data) 的固定版本，将前三章的本地任务 ID 对应到上游名称和来源。每个任务的「核对来源」可以展开参考资料。领取窗口、首次到访条件和繁简译名由路书另行核查。

在仓库根目录运行 `python tools/sync_mission_index.py --check` 可以复核当前快照。需要更新时，运行 `python tools/sync_mission_index.py --revision <上游完整提交 SHA>`，检查变更后再发布。访问网站本身无需连接上游 API。
