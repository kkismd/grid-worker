# Grid Worker

VTL（Very Tiny Language）互換のWorkerScriptプログラミング言語と実行環境です。100x100のグリッド上でピクセルを操作し、マルチワーカーでリアルタイム実行が可能です。

## 🌐 オンラインデモ

**▶️ [https://kkismd.github.io/grid### 4. キーボード入力例 (`examples/realtime-keyboard.ws`)
```workerscript
: Real-time keyboard input demo  
?="Press keys (ESC to exit):" /
^LOOP
  K=$                    : Get keyboard input
  ;=K=27 #=-1           : Exit on ESC
  ;=K>0 ?="Key: " ?=K / : Show key if pressed
#=^LOOP
```

### 5. グリッド描画例 (`examples/pattern.ws`)tps://kkismd.github.io/grid-worker/)**

ブラウザで直接WorkerScript言語を体験できます！

## ✨ 主な機能

### 🎮 インタラクティブWeb環境
- **マルチワーカー実行** - 複数のスクリプトを同時実行
- **リアルタイムキーボード入力** - `$` による1byte I/O対応
- **可視化グリッド** - 100x100ピクセルのリアルタイム描画
- **速度調整** - Very Slow〜Maximum まで実行速度制御

### 💻 CLI環境
- **ターミナル実行** - ファイル実行とREPLモード
- **1byte I/O シミュレーション** - キーボード入力/出力対応
- **デバッグ支援** - ステップ実行とグリッド表示

### 🔤 WorkerScript言語機能
- **VTL互換記号** - `$`(I/O), `` ` ``(グリッド), `~`(ランダム)
- **文字リテラル** - `'A'` 形式での文字操作
- **16進数リテラル** - `0xFF`, `0x1A2B` などの16進数表記対応
- **統一制御構造** - IF, FOR/WHILE (`@=`開始、`#=@`終了), GOTO/GOSUB (`#=!`でRETURN)
- **演算子** - 算術、比較、論理演算子完備
- **インラインコメント** - `:` でのコメント記述
- **キャラクターVRAMモード** - 16ビット値でASCII文字+ANSIカラー表示

## 📦 インストール

```bash
git clone https://github.com/kkismd/grid-worker.git
cd grid-worker
npm install
```

## 🚀 使用方法

### Web環境での実行
```bash
npm run dev          # 開発サーバー起動
npm run build        # プロダクションビルド
npm run serve        # ビルド版プレビュー
```

### CLI環境での実行
```bash
npm run cli examples/hello.ws              # ファイル実行
npm run cli examples/hello.ws --realtime   # リアルタイム実行
npm run cli examples/hello.ws --realtime --show-grid           # グリッド表示
npm run cli examples/hello.ws --realtime --show-grid --char-mode  # キャラクターVRAMモード
npm run cli                                # REPLモード
```

**キャラクターVRAMモード** (`--char-mode`):
- グリッド値を16ビット値として解釈（ASCII文字+色情報）
- ANSI 16色カラー対応（前景色・背景色）
- エンコーディング: `value = ASCII + (fg_color * 256) + (bg_color * 4096)`
- 16進数リテラルで簡潔に記述: `0x7148` = 白背景・赤文字で'H'

### テスト実行
```bash
npm test                         # 全テスト実行
```

## 📝 WorkerScript言語仕様

### 基本構文
```workerscript
: Hello World Example
A=10 B=20 C=A+B        : 変数と演算
X=50 Y=50              : グリッド座標設定
`=255                  : グリッドに白ピクセル描画
?="Result: " ?=C /     : 結果出力と改行
```

### 記号体系（VTL互換）
- **`` ` ``** - グリッド読み書き (PEEK/POKE)
- **`$`** - 1byte キーボード入出力
- **`~`** - ランダム値生成
- **`'`** - 文字リテラル (`'A'` = 65)

### 制御構造（統一構文）
```workerscript
: IF文
;=A>100 ?="Big number!"

: FORループ（統一構文 @= で開始、#=@ で終了）
@=I,1,100
  X=I Y=I `=255
#=@

: WHILEループ（統一構文 @= で開始、#=@ で終了）
@=(X<100)
  X=X+1
#=@

: GOTO/GOSUB（統一構文 #=! でRETURN）
!=^SUBROUTINE
#=^END
^SUBROUTINE
  ?="In subroutine"
  #=!
^END
  #=-1
```

### リアルタイムキーボード入力
```workerscript
: キー入力待ち無限ループ
^LOOP
  K=$                  : キー入力取得
  ;=K>0 ?=K /         : キーが押されていれば出力
#=^LOOP
```

## 📁 プロジェクト構成

```
├── src/
│   ├── lexer.ts              # 字句解析
│   ├── ast.ts                # 構文木定義  
│   ├── workerInterpreter.ts  # インタープリター
│   ├── index.ts              # Web UI
│   ├── cli.ts                # CLI インターフェース
│   └── __tests__/            # テストスイート
├── examples/                 # サンプルスクリプト
├── dist/                     # ビルド出力
└── docs/                     # ドキュメント
```

## 🎯 サンプルスクリプト

### 1. 16進数リテラル例 (`examples/realtime_tests/11-hex-literal-test.ws`)
```workerscript
: Hexadecimal literal examples
X=0 Y=0
`=0x41      : 'A' (hex 0x41 = decimal 65)
X=1 Y=0
`=0xFF      : ÿ (hex 0xFF = decimal 255)
X=2 Y=0
`=0x7148    : 'H' with color (white bg, red fg)
```

### 2. キャラクターVRAMモード例 (`examples/realtime_tests/06-color-text.ws`)
```workerscript
: Character VRAM with colors
: Encoding: ASCII + (fg_color * 256) + (bg_color * 4096)
: Example: 'H' + red(1) + white_bg(7)
X=0 Y=0
`=0x7148    : White background, red text 'H'
X=1 Y=0
`='e'+256+7*4096  : Same with calculation
```
実行: `npm run cli examples/realtime_tests/06-color-text.ws --realtime --show-grid --char-mode`

### 3. 文字リテラル例 (`examples/char-literals.ws`)
```workerscript
: Character literal examples
A='A' B='Z' C='0'
?="ASCII values: " ?=A ?=" " ?=B ?=" " ?=C /
```

### 4. キーボード入力例 (`examples/realtime-keyboard.ws`)
```workerscript
: Real-time keyboard input demo  
?="Press keys (ESC to exit):" /
^LOOP
  K=$                    : Get keyboard input
  ;=K=27 #=-1           : Exit on ESC
  ;=K>0 ?="Key: " ?=K / : Show key if pressed
#=^LOOP
```

### 3. グリッド描画例 (`examples/pattern.ws`)
```workerscript
: Draw diagonal pattern (統一構文)
@=I,0,99
  X=I Y=I `=255        : White diagonal
  X=I Y=99-I `=128     : Gray diagonal  
#=@
```

## 🛠️ 技術スタック

- **Language**: TypeScript
- **Build**: Vite
- **Testing**: Jest + ts-jest  
- **CLI**: tsx
- **Deploy**: GitHub Pages + GitHub Actions

## 📚 ドキュメント

- [CLI使用方法](CLI.md) - ターミナル環境での詳細使用方法
- [言語仕様](worker.md) - WorkerScript言語の完全仕様

## 🔄 開発ワークフロー

### 新機能開発
1. **機能ブランチ作成**: `git checkout -b feature/new-feature`
2. **TDD開発**: テスト書いてから実装
3. **全テスト通過確認**: `npm test`
4. **ビルド確認**: `npm run build`
5. **PR作成してmainマージ**

### デプロイ
- **自動デプロイ**: mainブランチプッシュでGitHub Pages自動更新
- **手動確認**: `npm run serve` でローカルプレビュー

## 🤝 コントリビューション

1. このリポジトリをフォーク
2. 機能ブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m '素晴らしい機能を追加'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを開く

## 📄 ライセンス

このプロジェクトはISCライセンスの下で公開されています。

## 🎉 特徴

- **教育的価値** - プログラミング言語処理の学習に最適
- **レトロコンピューティング** - VTL的なシンプルさ
- **モダン開発環境** - TypeScript + Vite + Jest
- **インタラクティブ** - リアルタイム実行とキーボード入力
- **可視化** - グリッドベースの即座なフィードバック

---

**🌟 [デモを試してみる](https://kkismd.github.io/grid-worker/) | [Issue報告](https://github.com/kkismd/grid-worker/issues) | [機能リクエスト](https://github.com/kkismd/grid-worker/issues/new)**