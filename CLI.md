# Grid Worker - WorkerScript CLI

WorkerScript言語のCLI実行環境です。100x100のグリッドをターミナルで操作できます。

## 🚀 CLIモードの使用方法

### インストール

```bash
npm install
```

### スクリプトファイルの実行

```bash
# 基本実行
npm run cli examples/hello.ws

# 詳細モード
npm run cli -- examples/pattern.ws --verbose

# デバッグモード  
npm run cli -- examples/square.ws --debug

# 出力をファイルに保存
npm run cli -- examples/hello.ws --output result.json
```

### インタラクティブモード

```bash
npm run cli -- --interactive
```

インタラクティブモードでは以下のコマンドが使用できます：

- `.exit` - 終了
- `.clear` - グリッドとトランスクリプトをクリア
- `.grid` - 現在のグリッド状態を表示
- `.help` - ヘルプを表示

## 📝 WorkerScript 言語仕様

### 基本構文

```workerscript
: コメント
A=10           : 変数Aに10を代入
?="Hello"      : 文字列を出力
?=A            : 変数Aの値を出力
/              : 改行を出力
C='A'          : 文字リテラル（ASCII値65）
D='''          : シングルクォート文字（ASCII値39）
```

### グリッド操作

```workerscript
: 座標系: X=左右方向(列), Y=上下方向(行)
: (0,0)は左上、(99,99)は右下

X=5 Y=10       : 座標を設定（右に5、下に10）
`=255          : 現在座標にピクセルを設定
A=`            : 現在座標の値を読み取り
```

### 制御構造

```workerscript
: IF文
;=A>10 ?="大きい" /

: FORループ
I=1,10
  ?=I /
@=I

: GOTO/GOSUB
#=^MYLABEL     : ラベルにジャンプ
!=^MYSUB       : サブルーチン呼び出し
]              : サブルーチンから復帰

^MYLABEL
  ?="ラベル" /

^MYSUB
  ?="サブルーチン" /
  ]
```

## 📊 出力例

### ASCII グリッド表示

```
📊 グリッド状態:
   0 1 2 3 4 5 6 7 8 9  ← X座標（列番号）
   -------------------
0 |░ . . . . . . . . .  ← Y座標（行番号）
1 |. ░ . . . . . . . .  
2 |. . ░ . . . . . . .
3 |. . . ░ . . . . . .
4 |. . . . ░ . . . . .
5 |. . . . . ░ . . . .
6 |. . . . . . ░ . . .
7 |. . . . . . . ░ . .
8 |. . . . . . . . ░ .
9 |. . . . . . . . . ░
```

- **上部の数字**: X座標（0-9列目）
- **左側の数字**: Y座標（0-9行目）

### 記号の意味

- `.` : 空白（値0）
- `░` : 薄い（値1-32）
- `▒` : 中間薄い（値33-96）
- `▓` : 中間濃い（値97-160）
- `█` : 濃い・最大（値161-255）

## 🎯 サンプルスクリプト

### examples/hello.ws
基本的な出力とピクセル設定のテスト

### examples/pattern.ws  
FORループを使った対角線パターン

### examples/square.ws
複数のループを使った正方形描画

## 🛠️ 開発者向け

### ビルド

```bash
npm run build
```

### テスト実行

```bash
npm test
```

### 新しいサンプル作成

`examples/`ディレクトリに`.ws`拡張子でファイルを作成してください。

## 📚 関連ドキュメント

- [spec.md](spec.md) - プロジェクト仕様
- [worker.md](worker.md) - WorkerScript言語仕様
- [src/](src/) - ソースコード