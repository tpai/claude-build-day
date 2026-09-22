# 鏡像維度 · Mirror Dimension

奇異博士風格的城市模擬器:真實城市的 OSM 建築足跡與街道網,在 Three.js 裡變成鏡像維度——
觀者固定在正中央,城市被切成 N 條帶子,貼在 N 片無限延伸的平面上圍成隧道;每片面都在不停地滑動
(上往左、下往右,整條隧道像在旋轉),城市在面上無限重複,車流、行人、樹都跟著面一起走。
切面有五種:∥ 上下兩片平行、△ 三角、□ 四角、⬠ 五角、⬡ 六角。建築有程序化的窗戶、玻璃帷幕、店面與屋頂設備;
街道有人行道、車道線、斑馬線;車輛沿真實路網行駛(依路口轉彎、遵守單行道與各城市的行駛方向),行人在人行道上走動;
河流、港灣與公園來自 OSM 水域/綠地多邊形與海岸線,夜晚有星空、亮起的窗戶、路燈與車燈。
白天與夜晚、五座城市、五種切面。整個示範是**一個完全離線的 HTML 檔**。

## 使用

直接雙擊 `dist/mirror-dimension.html`(需支援 WebGL2 的瀏覽器)。

| 操作 | 效果 |
| --- | --- |
| 拖曳 | 原地環視(上下 ±60°) |
| 滾輪 / 雙指 | 視角寬窄 40°–90° |
| `1` – `5` | 切換城市(台北、東京、紐約、巴黎、香港) |
| `Q` `W` | 切換白天、夜晚 |
| `A` `S` `D` `F` `G` | 切換切面:平行、三角、四角、五角、六角 |
| `H` | 隱藏 / 顯示控制面板 |
| `L` | 繁中 / English |

### 網址參數

可用 hash 直接開到指定狀態,方便分享或截圖:

```
mirror-dimension.html#city=tokyo&time=night&fold=6&lang=en&intro=0
```

`city` 可以是 key(taipei / tokyo / newyork / paris / hongkong)或索引 0–4;`time` 為 day / night(預設白天);`fold` 為 2–6 的切面數(預設 4);`intro=0` 跳過開場隧道收攏的動畫。
`yaw`、`pitch`(弧度)與 `fov` 可指定初始視線方向與視角,適合截圖。

## 重新建置

```bash
npm run build              # 使用 data/ 快取的城市資料,沒快取的才抓
npm run build:fresh        # 全部重新向 Overpass 抓取
node build.mjs --quick     # 只用已快取的城市,產出 dist/mirror-dimension-preview.html
```

Overpass 公開節點常常 504,腳本會在多個鏡像之間輪替重試最多 15 次;
抓到的原始資料快取在 `data/<city>.raw.json`(建築)、`data/<city>.roads.raw.json`(道路)與 `data/<city>.areas.raw.json`(水域、綠地、海岸線),刪掉該檔即可強制重抓單一城市。
水域與綠地在建置時光柵化成一張 1024² 的 PNG 遮罩(R = 水、G = 綠地;多邊形用奇偶填充處理島嶼等內環,海岸線則畫成邊界後從海側洪水填充)。

需要 Node 20 以上,建置時需要網路(Overpass API 與 jsDelivr)。產出檔在 `dist/mirror-dimension.html`。

要改城市、半徑、建築或道路上限,編輯 `build.mjs` 開頭的 `CITIES`、`ROAD_CLASS` 與常數。

## 結構

```
build.mjs            抓取 OSM 建築、道路與水域/綠地,簡化幾何、打包成 int16 base64 與 PNG 遮罩、內聯一切
src/index.html       HTML 模板(<!--STYLE--> 與 <!--APP--> 會被取代)
src/style.css        介面樣式
src/main.js          主程式:解碼城市與路網、擠出建築、道路緞帶、依帶子切分與貼塊可見性、車流/行人模擬、遮罩解碼與種樹、日夜插值、鏡頭、後製、UI
src/shaders/         fold.glsl(共用映射:N 片滑動的無限平面)、lighting.glsl(共用光照/霧)、
                     building(三種立面 + 店面 + 屋頂)、road(柏油/人行道/標線)、car、people、tree、
                     ground(鋪面 + 草地 + 水面)、sky、particles、post
data/                快取:*.raw.json(Overpass 原始回應)、three.module.min.js
dist/                產出的單檔 HTML
```

## 資料來源

建築、道路、水域與綠地資料 © OpenStreetMap 貢獻者,依 ODbL 授權。Three.js 依 MIT 授權。
