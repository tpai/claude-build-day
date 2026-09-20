# 鏡像維度 · Mirror Dimension

奇異博士風格的城市模擬器:真實城市的 OSM 建築足跡,在 Three.js 裡摺疊、扭轉、萬花筒化。
四個季節、五座城市、一個「鏡像強度」滑桿。整個示範是**一個完全離線的 HTML 檔**。

## 使用

直接雙擊 `dist/mirror-dimension.html`(需支援 WebGL2 的瀏覽器)。

| 操作 | 效果 |
| --- | --- |
| 拖曳 / 滾輪 / 雙指 | 旋轉、縮放,放開幾秒後恢復自動繞行 |
| `1` – `5` | 切換城市(台北、東京、紐約、巴黎、香港) |
| `Q` `W` `E` `R` | 切換春、夏、秋、冬 |
| `[` `]` | 調整鏡像強度 |
| `H` | 隱藏 / 顯示控制面板 |
| `L` | 繁中 / English |

### 網址參數

可用 hash 直接開到指定狀態,方便分享或截圖:

```
mirror-dimension.html#city=tokyo&season=winter&mirror=0.6&lang=en&intro=0
```

`city` 可以是 key(taipei / tokyo / newyork / paris / hongkong)或索引 0–4;`season` 為 spring / summer / autumn / winter;`mirror` 為 0–1;`intro=0` 跳過開場的摺疊展開動畫。

## 重新建置

```bash
npm run build              # 使用 data/ 快取的城市資料,沒快取的才抓
npm run build:fresh        # 全部重新向 Overpass 抓取
node build.mjs --quick     # 只用已快取的城市,產出 dist/mirror-dimension-preview.html
```

Overpass 公開節點常常 504,腳本會在多個鏡像之間輪替重試最多 15 次;
抓到的原始資料快取在 `data/<city>.raw.json`,刪掉該檔即可強制重抓單一城市。

需要 Node 20 以上,建置時需要網路(Overpass API 與 jsDelivr)。產出檔在 `dist/mirror-dimension.html`。

要改城市、半徑或建築上限,編輯 `build.mjs` 開頭的 `CITIES` 與常數。

## 結構

```
build.mjs            抓取 OSM、簡化幾何、打包成 int16 base64、內聯一切
src/index.html       HTML 模板(<!--STYLE--> 與 <!--APP--> 會被取代)
src/style.css        介面樣式
src/main.js          主程式:解碼城市、擠出建築、季節插值、鏡頭、後製、UI
src/shaders/         fold.glsl(共用摺疊)、building/ground/sky/particles/post
data/                快取:*.raw.json(Overpass 原始回應)、three.module.min.js
dist/                產出的單檔 HTML
```

## 資料來源

建築資料 © OpenStreetMap 貢獻者,依 ODbL 授權。Three.js 依 MIT 授權。
