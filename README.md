# Pomodoro Timer (Electron)

基於 Electron 的 macOS 桌面版番茄鐘工具，提供專注倒數、休息時間調整以及加減時等常用功能，並可自訂分類以快速標記當前專注內容。

## 功能特色
- 畫面中央顯示目前階段倒數與進度條
- Home 分頁顯示倒數、進度與快速分類切換（分類可在 Settings 分頁管理）
- 支援開始、暫停、重新開始（重設）
- 可即時加時 / 減時（每次 1 分鐘）
- 可設定專注、短休息、長休息時間與長休息週期
- 提供自動開始休息階段選項

## 安裝與啟動
1. 安裝相依套件
   ```sh
   npm install
   ```
2. 啟動 Electron 應用程式
   ```sh
   npm start
   ```

## 使用說明
- `Start`：開始目前階段的倒數；若前一次有暫停，按鈕會變成 `Resume`
- `Pause`：暫停倒數
- `Reset`：將目前階段重設回原始長度
- `+1 min` / `-1 min`：即時調整剩餘時間（最低保留 1 分鐘）
- `Home`：顯示計時器、進度條與分類快速切換
- `Settings`：新增/移除分類並調整各階段時間，調整後按 `Apply` 生效
- `Logs`：查看每次番茄鐘的開始/結束時間、分類與耗時，可於此清除所有紀錄
- 每次按下 `Start` 開始專注時，會將啟動時間與當下分類記錄在 localStorage 中

## 結構概覽
```
.
├── main.js          # Electron 主行程入口
├── preload.js       # 預載入腳本，保持 renderer sandbox
├── renderer
│   ├── app.js       # 倒數邏輯與互動控制
│   ├── index.html   # 使用者介面
│   └── styles.css   # 介面樣式
└── package.json
```

> 提示：若要打包成安裝檔，可進一步導入 `electron-builder` 或相關工具。
