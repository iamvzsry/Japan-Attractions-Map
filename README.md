# Japan Attractions Map (Vercel)

一个可直接部署到 Vercel 的静态站点：
- 地图底图：OpenStreetMap + Leaflet
- 景点数据：热门 + 小众（日本多地区）
- 每个景点包含：特色说明、分类、地区、Google Maps / OpenStreetMap 跳转链接

## 快速预览
在仓库根目录执行：

```bash
python3 -m http.server 8080
```

然后访问 `http://localhost:8080`。

## 重新生成景点坐标
景点源数据在 `data/attractions.seed.json`，可按需增删改。

执行：

```bash
node scripts/generate-attractions.mjs
```

生成文件：`attractions.json`

说明：脚本会调用 OpenStreetMap Nominatim 进行地理编码，并以约 1.1 秒/次请求节流。

## Vercel 部署
本项目是纯静态文件，可直接导入 Git 仓库部署：
- Framework Preset: `Other`
- Build Command: 留空
- Output Directory: 留空（根目录静态发布）

每次推送到主分支（或你设置的分支）后，Vercel 会自动更新。

## 目录结构

```text
.
├── index.html
├── styles.css
├── app.js
├── attractions.json
├── data/
│   └── attractions.seed.json
└── scripts/
    └── generate-attractions.mjs
```
