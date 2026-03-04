# Japan Attractions Map (Vercel)

一个可直接部署到 Vercel 的静态站点：
- 地图底图：OpenStreetMap + Leaflet
- 景点数据：热门 + 小众（当前 151 个）
- 每个景点包含：特色说明、分类、地区、Google Maps / OpenStreetMap 导航链接
- 攻略入口：小红书、B站、马蜂窝、Google 攻略搜索

## 快速预览
在仓库根目录执行：

```bash
python3 -m http.server 8080
```

然后访问 `http://localhost:8080`。

## 数据文件
- 基础景点：`data/attractions.seed.json`
- 扩展景点：`data/attractions.extra.json`
- 生成结果：`attractions.json`

## 重新生成景点坐标
执行：

```bash
node scripts/generate-attractions.mjs
```

说明：
- 脚本会自动合并基础 + 扩展数据，并按 `id` 去重。
- 当条目缺少 `feature` / `query` / `sourceUrl` 时会自动补默认值。
- 地理编码使用 OpenStreetMap Nominatim，并以约 1.1 秒/次请求节流。

## Vercel 部署
本项目是纯静态文件，可直接导入 Git 仓库部署：
- Framework Preset: `Other`
- Build Command: 留空
- Output Directory: 留空（根目录静态发布）

每次推送到你配置的分支后，Vercel 会自动更新。

## 目录结构

```text
.
├── index.html
├── styles.css
├── app.js
├── attractions.json
├── data/
│   ├── attractions.seed.json
│   └── attractions.extra.json
└── scripts/
    └── generate-attractions.mjs
```
